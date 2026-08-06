/**
 * useChatStream（T04 核心 hook）—— 会话状态机 + 流式编排。
 *
 * ## 收敛的三个中止源（架构 §5.2 / 风险 R4）
 *   用户点停止 / TTFB 15s 超时 / 空闲 30s 超时 → 全部走唯一的 `abortWith(reason)`：
 *   ① 先写 `abortReasonRef`，② 再 `abort()`，③ 清两个定时器。
 *   `catch` 块只读 `abortReasonRef` 分流 —— 这是评审一票否决项，
 *   顺序错了用户点停止会弹错误卡（读到 stale reason）。
 *
 * ## 双层超时（ERR-1 / §5.3）
 *   - TTFB 15s：phase=sending 起计，首 token 前到点 → 真中止；
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
  type ChatAction,
  type ChatState,
} from '../types/chat-state';
import { AppError, streamChat } from '../lib/api';
import {
  classifyError,
  ErrorCode,
  isTerminalFailure,
  type ClassifiedError,
} from '../lib/errors';
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

/** 状态机 reducer（架构 §4.1 ChatAction 全量实现）。 */
function reducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SEND':
      // 保留 consecutiveFailures（UX-4 连击跨轮累积）与 degradedFrames（每轮清零）
      return {
        ...state,
        phase: 'sending',
        requestId: action.requestId,
        retryCount: 0,
        abortReason: null,
        error: null,
        ttfbMs: null,
        degradedFrames: 0,
      };
    case 'FIRST_TOKEN':
      return { ...state, phase: 'streaming', ttfbMs: action.ttfbMs };
    case 'ABORT':
      if (action.reason === 'user') {
        return { ...state, phase: 'stopped', abortReason: action.reason };
      }
      if (SILENT_ABORT_REASONS.includes(action.reason)) {
        // 卸载/场景切换：静默回 idle，不留错误痕迹
        return { ...state, phase: 'idle', abortReason: action.reason, requestId: null };
      }
      return { ...state, phase: 'failed', abortReason: action.reason };
    case 'FAIL':
      return {
        ...state,
        phase: 'classified',
        error: action.error,
        // 只有「终态失败」才计入连击；用户主动停止不计入（isTerminalFailure）
        consecutiveFailures:
          state.consecutiveFailures + (isTerminalFailure(action.error) ? 1 : 0),
        abortReason: null,
      };
    case 'RETRY':
      return { ...state, phase: 'retrying', retryCount: state.retryCount + 1, error: null };
    case 'DONE':
      // 成功会打断「连续失败」连击
      return { ...state, phase: 'done', error: null, consecutiveFailures: 0 };
    case 'DEGRADED_FRAME':
      return { ...state, degradedFrames: state.degradedFrames + 1 };
    case 'RESET':
      return { ...INITIAL_CHAT_STATE };
  }
}

export interface UseChatStreamOptions {
  scenarioId: string;
  conversationId: string;
  initialMessages: UIMessage[];
}

export interface UseChatStreamResult {
  state: ChatState;
  messages: UIMessage[];
  /** sending / streaming / retrying / aborting 任一即 true（InputBar 切停止槽位） */
  isStreaming: boolean;
  /** 回前台挂起提示（只提示不中止） */
  streamStalled: boolean;
  /** 连续终态失败 ≥2 → 展示人工兜底卡（UX-4） */
  showHandoff: boolean;
  send: (text: string) => void;
  stop: () => void;
  retry: () => void;
  regenerate: () => void;
  /** ChatPage 侧消息变更（贴纸 / 反馈 / 记忆等非流式更新） */
  updateMessages: (fn: (prev: UIMessage[]) => UIMessage[]) => void;
  /** 场景切换时重置（ERR-6）：清消息 + 复位状态机 + 掐断旧流 */
  resetForScenario: (scenarioId: string, conversationId: string, messages: UIMessage[]) => void;
  /** 清空错误态（「换个问法」后） */
  clearError: () => void;
}

export function useChatStream({
  scenarioId,
  conversationId,
  initialMessages,
}: UseChatStreamOptions): UseChatStreamResult {
  const [state, dispatch] = useReducer(reducer, undefined, () => INITIAL_CHAT_STATE);
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
    (text: string) => {
      const question = text.trim();
      if (!question || isStreamingRef.current) return;

      // API-2：历史经 trimHistory 截断（8 轮 / 6000 字符，贴纸过滤语义内置）
      const history = trimHistory(messagesRef.current);
      const requestId = newRequestId();

      const userMsg: UIMessage = { id: nextId(), role: 'user', content: question, status: 'done' };
      const assistantId = nextId();
      const assistantMsg: UIMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        feedback: null,
      };

      activeAssistantIdRef.current = assistantId;
      tokenCountRef.current = 0;
      firstTokenDoneRef.current = false;
      sendStartedAtRef.current = Date.now();
      lastTokenAtRef.current = Date.now();
      streamStalledRef.current = false;
      setStreamStalled(false);
      handoffTrackedRef.current = false;

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      dispatch({ type: 'SEND', requestId });
      isStreamingRef.current = true;

      const controller = new AbortController();
      abortRef.current = controller;
      abortReasonRef.current = null;
      startTtfb();

      track({ ev: 'chat_send', scenario: scenarioIdRef.current, rid: requestId });

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
            } else if (reason === 'unmount' || reason === 'scenario-change') {
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

  const retry = useCallback(() => {
    // 贴纸不算提问（架构 §2.6 约定 4）
    const lastUser = [...messagesRef.current]
      .reverse()
      .find((m) => m.role === 'user' && m.kind !== 'sticker');
    if (lastUser) {
      send(lastUser.content);
    } else {
      dispatch({ type: 'RESET' });
    }
  }, [send]);

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
    dispatch({ type: 'RESET' });
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
    state.phase === 'retrying' ||
    state.phase === 'aborting';

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

  return {
    state,
    messages,
    isStreaming,
    streamStalled,
    showHandoff,
    send,
    stop,
    retry,
    regenerate,
    updateMessages,
    resetForScenario,
    clearError,
  };
}
