/**
 * useChatStream（T04 核心 hook）—— 会话状态机 + 流式编排。
 *
 * ## 收敛的三个中止源（架构 §5.2 / 风险 R4）
 *   用户点停止 / TTFB 40s 超时 / 空闲 30s 超时 → 全部走唯一的 `abortWith(reason)`：
 *   ① 先写 `abortReasonRef`，② 再 `abort()`，③ 清两个定时器。
 *   `catch` 块只读 `abortReasonRef` 分流 —— 这是评审一票否决项，
 *   顺序错了用户点停止会弹错误卡（读到 stale reason）。
 *
 * ## 双层超时（ERR-1 / §5.3）
 *   - TTFB 40s：phase=sending 起计，首 token 前到点 → 真中止；
 *     （服务端 15s×2+退避≤5s=35s 超时链已先兜住，40s 只是极端情况的后端兜底）
 *   - 空闲 30s：phase=streaming 起计，每 token 重置 → 真中止；
 *   - 回前台 8s 挂起提示：只提示不中止（既有逻辑保留）；
 *   - **只用空闲间隔计时，不用总时长**（PRD：长答案只要 token 不断流就不得中止）；
 *   - `visibilitychange→hidden` 时**暂停**空闲计时器，回前台以回来那一刻为基准重启
 *     （风险 R2：切后台 30s 回来不该误杀长答案）。
 *
 * ## rAF 合帧（PERF-1）
 *   token 先进 ref 缓冲，requestAnimationFrame 统一 flush 一次 setMessages。
 *   400 个 token 约产生 60 次 setState（60fps），而不是 400 次。
 *
 * ## 消息归属（ERR-6）
 *   所有事件处理都先查 `activeAssistantIdRef` —— 场景切换后立刻置 null，
 *   旧场景迟到的 token/sources/fallback 全部丢弃，绝不写进新场景的消息列表。
 *
 * ## 埋点（MAINT-1）
 *   chat_send / chat_first_token / chat_done / chat_abort / chat_error /
 *   chat_retry / handoff_shown 全部通过 analytics.track 上报。
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  INITIAL_CHAT_STATE,
  SILENT_ABORT_REASONS,
  type AbortReason,
  type ChatState,
} from '../types/chat-state';
import { AppError, streamChat } from '../lib/api';
import {
  classifyError,
  ErrorCode,
  type ClassifiedError,
} from '../lib/errors';
import {
  chatReducer,
  excludeMessageIds,
  findContinueDraft,
  lastUserBefore,
} from '../lib/chat-core';
import { trimHistory } from '../lib/context';
import { newRequestId } from '../lib/requestId';
import { track } from '../lib/analytics';
import { HANDOFF_FAILURE_THRESHOLD, IDLE_TIMEOUT_MS, TTFB_TIMEOUT_MS } from '../lib/config';
import type { ChatRequest, SSEEvent } from '../types/api';
import type { UIMessage } from '../types/chat';

/** 既有回前台挂起提示阈值（§5.3：只提示不中止）。 */
const STREAM_STALL_THRESHOLD_MS = 8000;

let seq = 0;
const nextId = (): string => `m${Date.now()}-${seq++}`;

/** send 的可选扩展参数（B5 / UX-8）：普通提问传 text 即可，续接才需要 opts。 */
export interface SendOpts {
  /** 替换式续接：把该 assistant 气泡标回 streaming，新流首 token 清空其内容重新累积 */
  replaceAssistantId?: string;
  /** 不进 history 的消息 id（草稿对 = 草稿气泡 + 其前一条 user，架构 §2.4 注②） */
  excludeIds?: string[];
}

export interface UseChatStreamOptions {
  scenarioId: string;
  conversationId: string;
  initialMessages: UIMessage[];
}

export interface UseChatStreamResult {
  state: ChatState;
  messages: UIMessage[];
  /** sending / streaming / retrying 任一即 true（InputBar 切停止槽位） */
  isStreaming: boolean;
  /** 回前台挂起提示（只提示不中止） */
  streamStalled: boolean;
  /** 连续终态失败 ≥2 → 展示人工兜底卡（UX-4） */
  showHandoff: boolean;
  /** 存在可续接的草稿且当前不在流式（B5 UX-8：决定「继续生成」入口是否可见） */
  hasDraft: boolean;
  send: (text: string, opts?: SendOpts) => void;
  stop: () => void;
  retry: () => void;
  regenerate: () => void;
  /** B5 UX-8：同一问题新 request_id 全量重发，新流首 token 起替换草稿气泡（replace-on-first-token） */
  continueGeneration: () => void;
  /** ChatPage 侧消息变更（贴纸 / 反馈 / 记忆等非流式更新） */
  updateMessages: (fn: (prev: UIMessage[]) => UIMessage[]) => void;
  /** 场景切换时重置（ERR-6）：清消息 + 复位状态机 + 掐断旧流 */
  resetForScenario: (scenarioId: string, conversationId: string, messages: UIMessage[]) => void;
  /** 清空错误态（「换个问法」后；连击保留，B5 修复） */
  clearError: () => void;
}

export function useChatStream({
  scenarioId,
  conversationId,
  initialMessages,
}: UseChatStreamOptions): UseChatStreamResult {
  const [state, dispatch] = useReducer(chatReducer, undefined, () => INITIAL_CHAT_STATE);
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [streamStalled, setStreamStalled] = useState(false);

  // —— ref 镜像：回调里读最新值且保持 useCallback 依赖稳定（PERF-4 / memo 生效）——
  const scenarioIdRef = useRef(scenarioId);
  const conversationIdRef = useRef(conversationId);
  const messagesRef = useRef(messages);
  const stateRef = useRef(state);
  const isStreamingRef = useRef(false);
  useEffect(() => {
    scenarioIdRef.current = scenarioId;
  }, [scenarioId]);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // —— 流控制 refs ——
  const abortRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<AbortReason | null>(null);
  const ttfbTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const tokenBufferRef = useRef<string>('');
  const lastTokenAtRef = useRef<number>(0);
  const streamStalledRef = useRef<boolean>(false);
  const activeAssistantIdRef = useRef<string | null>(null);
  const sendStartedAtRef = useRef<number>(0);
  const firstTokenDoneRef = useRef<boolean>(false);
  const tokenCountRef = useRef<number>(0);
  const pendingRetryRef = useRef<string | null>(null);
  const handoffTrackedRef = useRef<boolean>(false);
  /** B5 续接：新流首 token 到达时要清空重建的草稿气泡 id（replace-on-first-token） */
  const replaceOnFirstTokenRef = useRef<string | null>(null);

  const clearTimers = useCallback(() => {
    if (ttfbTimerRef.current !== null) {
      window.clearTimeout(ttfbTimerRef.current);
      ttfbTimerRef.current = null;
    }
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  /** 把 token 缓冲区落屏（rAF flush 与卸载/中止前同步 flush 共用）。 */
  const flushPending = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const id = activeAssistantIdRef.current;
    const chunk = tokenBufferRef.current;
    tokenBufferRef.current = '';
    if (!id || chunk === '') return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: m.content + chunk } : m)));
  }, []);

  /**
   * 中止唯一入口（架构 §5.2 / 风险 R4）。
   * 不变量：abortReasonRef 必须在 abort() 之前赋值，否则 catch 读到 stale 值。
   */
  const abortWith = useCallback(
    (reason: AbortReason) => {
      const controller = abortRef.current;
      if (!controller || controller.signal.aborted) return;
      abortReasonRef.current = reason; // ① 先写 reason
      controller.abort(); // ② 再 abort
      clearTimers(); // ③ 清定时器
    },
    [clearTimers],
  );

  const startTtfb = useCallback(() => {
    if (ttfbTimerRef.current !== null) window.clearTimeout(ttfbTimerRef.current);
    ttfbTimerRef.current = window.setTimeout(() => abortWith('ttfb-timeout'), TTFB_TIMEOUT_MS);
  }, [abortWith]);

  const startIdle = useCallback(() => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => abortWith('idle-timeout'), IDLE_TIMEOUT_MS);
  }, [abortWith]);

  /** token 入缓冲 + rAF 合帧（PERF-1：400 token → ~60 setState） */
  const appendToken = useCallback(
    (content: string) => {
      tokenBufferRef.current += content;
      lastTokenAtRef.current = Date.now();
      if (streamStalledRef.current) {
        streamStalledRef.current = false;
        setStreamStalled(false);
      }
      if (rafRef.current !== null) return; // 已有合帧在途
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        flushPending();
      });
    },
    [flushPending],
  );

  /** 对当前 assistant 气泡做补丁更新（sources/fallback/done/error）。 */
  const patchAssistant = useCallback((id: string, fn: (m: UIMessage) => UIMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  /** api 层每次自动重试前回调。 */
  const handleRetry = useCallback((attempt: number, status: number | undefined) => {
    dispatch({ type: 'RETRY' });
    track({
      ev: 'chat_retry',
      scenario: scenarioIdRef.current,
      rid: stateRef.current.requestId ?? undefined,
      retry_n: attempt + 1,
      code: status,
    });
  }, []);

  /** SSE 解析失败帧（ERR-3：计数上报而非静默）。 */
  const handleDegraded = useCallback((count: number) => {
    dispatch({ type: 'DEGRADED_FRAME' });
    track({
      ev: 'chat_error',
      scenario: scenarioIdRef.current,
      rid: stateRef.current.requestId ?? undefined,
      code: ErrorCode.PARSE_DEGRADED,
      degraded_n: count,
    });
  }, []);

  /** 终态失败收尾：移除空气泡 / 保留部分内容标 error，进入 classified 相位。 */
  const finalizeFailure = useCallback(
    (assistantId: string, classified: ClassifiedError) => {
      clearTimers();
      flushPending();
      activeAssistantIdRef.current = null;
      setMessages((prev) =>
        prev.flatMap((m) => {
          if (m.id !== assistantId) return [m];
          if (m.content === '') return []; // A4：空气泡不留，错误由 ErrorNotice 呈现
          return [{ ...m, status: 'error' }];
        }),
      );
      dispatch({ type: 'FAIL', error: classified });
      track({
        ev: 'chat_error',
        scenario: scenarioIdRef.current,
        rid: stateRef.current.requestId ?? undefined,
        code: classified.code,
        cls: classified.cls,
      });
    },
    [clearTimers, flushPending],
  );

  /** 用户点停止：保留已生成内容标「已停止」，空内容移除气泡（UX-1 / A4）。 */
  const handleUserStop = useCallback(() => {
    const id = activeAssistantIdRef.current;
    clearTimers();
    flushPending();
    activeAssistantIdRef.current = null;
    dispatch({ type: 'ABORT', reason: 'user' });
    if (id) {
      setMessages((prev) =>
        prev.flatMap((m) => {
          if (m.id !== id) return [m];
          if (m.content === '') return []; // A4：空气泡移除
          return [{ ...m, status: 'done', stopped: true }];
        }),
      );
    }
    track({
      ev: 'chat_abort',
      scenario: scenarioIdRef.current,
      rid: stateRef.current.requestId ?? undefined,
      abort_reason: 'user',
    });
  }, [clearTimers, flushPending]);

  /** SSE 事件分发（架构 §5.1）。先查归属，再按类型处理。 */
  const handleStreamEvent = useCallback(
    (ev: SSEEvent) => {
      const id = activeAssistantIdRef.current;
      if (!id) return; // 已停止 / 已切换场景：丢弃迟到事件（ERR-6）
      switch (ev.type) {
        case 'token': {
          tokenCountRef.current += 1;
          if (!firstTokenDoneRef.current) {
            firstTokenDoneRef.current = true;
            const ttfbMs = Date.now() - sendStartedAtRef.current;
            dispatch({ type: 'FIRST_TOKEN', ttfbMs });
            // B5 续接（replace-on-first-token）：新流首 token 到达 → 清空草稿气泡内容，
            // 之后 appendToken 的 rAF 合帧在同一气泡上重新累积（同一气泡原地变完整答案）。
            if (replaceOnFirstTokenRef.current) {
              const rid = replaceOnFirstTokenRef.current;
              replaceOnFirstTokenRef.current = null;
              setMessages((prev) => prev.map((m) => (m.id === rid ? { ...m, content: '' } : m)));
            }
            track({
              ev: 'chat_first_token',
              scenario: scenarioIdRef.current,
              rid: stateRef.current.requestId ?? undefined,
              ttfb_ms: ttfbMs,
            });
          }
          startIdle(); // 每个 token 重置空闲计时（总时长不设上限）
          appendToken(ev.content);
          break;
        }
        case 'sources':
          patchAssistant(id, (m) => ({ ...m, sources: ev.items }));
          break;
        case 'fallback':
          patchAssistant(id, (m) => ({ ...m, guesses: ev.guesses, contact: ev.contact }));
          break;
        case 'done': {
          clearTimers();
          flushPending();
          activeAssistantIdRef.current = null;
          patchAssistant(id, (m) => ({ ...m, status: 'done', messageId: ev.message_id }));
          dispatch({ type: 'DONE' });
          track({
            ev: 'chat_done',
            scenario: scenarioIdRef.current,
            rid: stateRef.current.requestId ?? undefined,
            dur_ms: Date.now() - sendStartedAtRef.current,
            token_n: tokenCountRef.current,
          });
          break;
        }
        case 'error':
          // 服务端 SSE error 事件：按业务码分类
          finalizeFailure(id, classifyError({ code: ev.code }));
          break;
      }
    },
    [appendToken, clearTimers, finalizeFailure, flushPending, patchAssistant, startIdle],
  );

  const send = useCallback(
    (text: string, opts?: SendOpts) => {
      const question = text.trim();
      if (!question || isStreamingRef.current) return;

      // API-2：历史经 trimHistory 截断（8 轮 / 6000 字符，贴纸过滤语义内置）。
      // B5 续接：先把草稿对（草稿气泡 + 其前一条 user）从消息里剔除，再走既有截断 ——
      // 否则 stopped 草稿（status='done'）会被送进 history，LLM 看到「同一问题已答过（部分答案）」。
      const history = trimHistory(excludeMessageIds(messagesRef.current, opts?.excludeIds ?? []));
      const requestId = newRequestId();

      const assistantId = opts?.replaceAssistantId ?? nextId();

      if (opts?.replaceAssistantId) {
        // 替换式续接（B5 / UX-8）：不 append 新气泡；把草稿气泡标回 streaming（保留内容，清 stopped）。
        // 新流首 token 到达时由 replaceOnFirstTokenRef 清空内容重新累积（replace-on-first-token），
        // 视觉上是「它接着生成了」，最终单气泡完整答案、无可见重复（架构 §2.1 方案 B）。
        replaceOnFirstTokenRef.current = assistantId;
        activeAssistantIdRef.current = assistantId;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, status: 'streaming', stopped: undefined } : m,
          ),
        );
      } else {
        const userMsg: UIMessage = { id: nextId(), role: 'user', content: question, status: 'done' };
        const assistantMsg: UIMessage = {
          id: assistantId,
          role: 'assistant',
          content: '',
          status: 'streaming',
          feedback: null,
        };
        activeAssistantIdRef.current = assistantId;
        setMessages((prev) => [...prev, userMsg, assistantMsg]);
      }

      tokenCountRef.current = 0;
      firstTokenDoneRef.current = false;
      sendStartedAtRef.current = Date.now();
      lastTokenAtRef.current = Date.now();
      streamStalledRef.current = false;
      setStreamStalled(false);
      handoffTrackedRef.current = false;

      dispatch({ type: 'SEND', requestId });
      isStreamingRef.current = true;

      const controller = new AbortController();
      abortRef.current = controller;
      abortReasonRef.current = null;
      startTtfb();

      track({ ev: 'chat_send', scenario: scenarioIdRef.current, rid: requestId });
      if (opts?.replaceAssistantId) {
        // B5 续接埋点：字段与 chat_send 同构（架构 §2.2 约定 6）
        track({ ev: 'chat_continue', scenario: scenarioIdRef.current, rid: requestId });
      }

      const req: ChatRequest = {
        scenario_id: scenarioIdRef.current,
        message: question,
        history,
        conversation_id: conversationIdRef.current,
        request_id: requestId,
      };

      void (async () => {
        try {
          await streamChat(
            req,
            { onEvent: handleStreamEvent, onDegraded: handleDegraded, onRetry: handleRetry },
            controller.signal,
          );
          // streamChat 正常返回但未收到 done（防御性收尾）：不能把气泡永远挂 streaming
          if (activeAssistantIdRef.current === assistantId) {
            clearTimers();
            flushPending();
            activeAssistantIdRef.current = null;
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, status: 'done' } : m)));
            dispatch({ type: 'DONE' });
          }
        } catch (e) {
          if (controller.signal.aborted) {
            const reason = abortReasonRef.current;
            if (reason === 'user') {
              handleUserStop();
            } else if (reason !== null && SILENT_ABORT_REASONS.includes(reason)) {
              // 生命周期中止：静默，不写错误态
              activeAssistantIdRef.current = null;
            } else {
              // TTFB / 空闲超时
              finalizeFailure(assistantId, classifyError({ abortReason: reason }));
            }
          } else {
            const classified = e instanceof AppError ? e.classified : classifyError({});
            finalizeFailure(assistantId, classified);
          }
        } finally {
          isStreamingRef.current = false;
          // B5：首 token 前失败时清掉 replace 标记防残留；
          // 草稿气泡内容保留（finalizeFailure 只移除空内容气泡），用户不丢已生成内容。
          replaceOnFirstTokenRef.current = null;
          if (abortRef.current === controller) abortRef.current = null;
        }
      })();
    },
    [
      clearTimers,
      finalizeFailure,
      flushPending,
      handleDegraded,
      handleRetry,
      handleStreamEvent,
      handleUserStop,
      startTtfb,
    ],
  );

  const stop = useCallback(() => {
    abortWith('user');
  }, [abortWith]);

  /**
   * B5 续接（UX-8 / 架构 §2.4）：同一问题新 request_id 全量重发，替换草稿气泡。
   * 草稿定位与历史排除都是 chat-core 纯函数（可单测）：
   *   - findContinueDraft 尾扫最后一个 error/stopped 且 content 非空的 assistant 气泡；
   *   - lastUserBefore 取草稿前最近一条 user 提问（贴纸除外）作为 message 原文；
   *   - 草稿对（草稿 + 其 user）从 history 剔除（架构 §2.4 注②）。
   * 幂等：旧 request_id 在客户端断开时已被服务端 settle('aborted') 释放（idempotency.ts:102-105），
   * 新 id 正常 claim，不会被 4009 挡住（API-6，服务端零改动）。
   */
  const continueGeneration = useCallback(() => {
    const draft = findContinueDraft(messagesRef.current);
    if (!draft) return;
    const userMsg = lastUserBefore(messagesRef.current, draft.id);
    if (!userMsg) return;
    send(userMsg.content, {
      replaceAssistantId: draft.id,
      excludeIds: [draft.id, userMsg.id],
    });
  }, [send]);

  /**
   * 重试。B5 升级：若存在草稿（error/stopped 的部分气泡）→ 走 continueGeneration（替换式，无重复）；
   * 无草稿 → 维持 append 式（TTFB 超时空气泡已被移除，append 无重复问题）。
   */
  const retry = useCallback(() => {
    if (findContinueDraft(messagesRef.current)) {
      continueGeneration();
      return;
    }
    // 贴纸不算提问（架构 §2.6 约定 4）
    const lastUser = [...messagesRef.current]
      .reverse()
      .find((m) => m.role === 'user' && m.kind !== 'sticker');
    if (lastUser) {
      send(lastUser.content);
    } else {
      dispatch({ type: 'RESET' });
    }
  }, [continueGeneration, send]);

  /** 回前台挂起提示的「重新生成」：掐掉死流，摘出本轮未完成的问答，原样重发一次。 */
  const regenerate = useCallback(() => {
    const stalledAssistantId = activeAssistantIdRef.current;
    abortWith('user');
    activeAssistantIdRef.current = null;

    const lastUser = [...messagesRef.current]
      .reverse()
      .find((m) => m.role === 'user' && m.kind !== 'sticker');
    const question = lastUser?.content.trim() ?? '';
    const lastUserId = lastUser?.id ?? null;

    setMessages((prev) => prev.filter((m) => m.id !== stalledAssistantId && m.id !== lastUserId));
    streamStalledRef.current = false;
    setStreamStalled(false);
    if (question) pendingRetryRef.current = question;
  }, [abortWith]);

  const clearError = useCallback(() => {
    // B5 修复：CLEAR_ERROR 保留 consecutiveFailures（与 SEND 一致）——
    // 「1 败 + 换个问法 + 1 败」仍能触发 UX-4 人工兜底卡；RESET 仅场景切换用。
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const updateMessages = useCallback((fn: (prev: UIMessage[]) => UIMessage[]) => {
    setMessages(fn);
  }, []);

  /** 场景切换（ERR-6）：掐旧流 + 静默 + 换消息 + 复位状态机。 */
  const resetForScenario = useCallback(
    (nextScenario: string, nextConversationId: string, nextMessages: UIMessage[]) => {
      abortReasonRef.current = 'scenario-change';
      const controller = abortRef.current;
      if (controller && !controller.signal.aborted) controller.abort();
      clearTimers();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      tokenBufferRef.current = '';
      activeAssistantIdRef.current = null;
      replaceOnFirstTokenRef.current = null;
      pendingRetryRef.current = null;
      streamStalledRef.current = false;
      setStreamStalled(false);
      scenarioIdRef.current = nextScenario;
      conversationIdRef.current = nextConversationId;
      setMessages(nextMessages);
      dispatch({ type: 'RESET' });
      isStreamingRef.current = false;
    },
    [clearTimers],
  );

  const isStreaming =
    state.phase === 'sending' ||
    state.phase === 'streaming' ||
    state.phase === 'retrying';
  // ⚠️ B5 勘误：无 'aborting' 相位（架构 §4.1）；中止由 in-flight AbortController 表达。

  // regenerate 不能直接调 send（send 的守卫此刻还认为在流式）；等相位回落后再发。
  useEffect(() => {
    if (isStreaming) return;
    const question = pendingRetryRef.current;
    if (question === null) return;
    pendingRetryRef.current = null;
    send(question);
  }, [isStreaming, send]);

  // R2：后台暂停空闲计时；回前台做 8s 挂起提示 + 以回来那一刻重启空闲计时。
  useEffect(() => {
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        if (idleTimerRef.current !== null) {
          window.clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
        flushPending(); // 把已到达的 token 落屏，避免回前台瞬间一大坨
      } else {
        // 回前台：既有 8s 挂起提示（只提示不中止，§5.3）
        if (isStreamingRef.current && Date.now() - lastTokenAtRef.current > STREAM_STALL_THRESHOLD_MS) {
          streamStalledRef.current = true;
          setStreamStalled(true);
        }
        if (stateRef.current.phase === 'streaming') startIdle();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [flushPending, startIdle]);

  // 卸载：只掐流，不 setState（React 18 下卸载后 setState 是空操作，但没必要）
  useEffect(() => {
    return () => {
      abortReasonRef.current = 'unmount';
      const controller = abortRef.current;
      if (controller && !controller.signal.aborted) controller.abort();
      clearTimers();
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      replaceOnFirstTokenRef.current = null;
    };
  }, [clearTimers]);

  // UX-4：连击达到阈值时上报 handoff_shown（只报一次）
  const showHandoff = state.consecutiveFailures >= HANDOFF_FAILURE_THRESHOLD;
  useEffect(() => {
    if (showHandoff && !handoffTrackedRef.current) {
      handoffTrackedRef.current = true;
      track({ ev: 'handoff_shown', scenario: scenarioIdRef.current });
    }
  }, [showHandoff]);

  // B5 UX-8：存在可续接的草稿且当前不在流式 → UI 显示「继续生成」入口。
  // 续接进行中草稿气泡被标回 streaming，findContinueDraft 自然找不到它，无需额外状态。
  const hasDraft = !isStreaming && findContinueDraft(messages) !== null;

  return {
    state,
    messages,
    isStreaming,
    streamStalled,
    showHandoff,
    hasDraft,
    send,
    stop,
    retry,
    regenerate,
    continueGeneration,
    updateMessages,
    resetForScenario,
    clearError,
  };
}
