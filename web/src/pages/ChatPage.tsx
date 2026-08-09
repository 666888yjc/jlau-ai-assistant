import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/NavBar';
import { Avatar, Bubble, FeedbackBar, NameChip, SourceFold, TypingIndicator } from '../components/ChatBits';
import { Mascot, isMascotExpression, type MascotExpression } from '../components/Mascot';
import { StickerPanel, STICKER_LABELS } from '../components/StickerPanel';
import { InputBar } from '../components/InputBar';
import { GuessYouAsk, GuessChips } from '../components/GuessYouAsk';
import { Icon } from '../components/Icon';
import { Illustration } from '../components/Illustration';
import { useToast } from '../components/Toast';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ErrorNotice } from '../components/ErrorNotice';
import { NewContentPill } from '../components/NewContentPill';
import { getFeatures, postFeedback } from '../lib/api';
import { buildFeedbackSnapshot } from '../lib/feedback';
import { isMiniProgram, navigateBackInMiniProgram } from '../lib/miniprogram';
import { addMemory, buildGreeting, isMemoryTextTruncated, readMemory, readProfile } from '../lib/profile';
import { shouldRenderErrorCard } from '../lib/errors';
import { trimStoredMessages } from '../lib/context';
import { HISTORY_MAX_MESSAGES } from '../lib/config';
import { track } from '../lib/analytics';
import { useChatStream } from '../hooks/useChatStream';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { useScrollFollow } from '../hooks/useScrollFollow';
// 记忆写入的五种结果文案（架构 §2.9）在 ProfilePage 里定义并导出，
// 这里直接复用，避免同一套提示语在两个页面各写一份、日后改一处漏一处。
import { memoryToastText } from './ProfilePage';
import type { FallbackContact, FeatureItem, SourceItem } from '../types/api';
import type { UIMessage } from '../types/chat';

// ---- 会话本地持久化（刷新不丢聊天）----
// 按场景维度存 localStorage：jxn-conv-<scenarioId> -> { conversationId, messages }
const CONV_STORAGE_PREFIX = 'jxn-conv-';
const CONV_SAVE_DEBOUNCE_MS = 250;

interface StoredConversation {
  conversationId: string;
  messages: UIMessage[];
}

let seq = 0;
const nextId = (): string => `m${Date.now()}-${seq++}`;

/**
 * 恢复历史消息：status 统一置 'done'（历史不再流式），
 * 保留 sources/guesses/contact/feedback/messageId 等字段，缺字段补默认。
 */
function normalizeRestoredMessage(raw: unknown): UIMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const role = m.role;
  if (typeof m.id !== 'string' || (role !== 'user' && role !== 'assistant') || typeof m.content !== 'string') {
    return null;
  }
  // 贴纸类字段：缺省按 'text' 处理（旧会话无 kind 时向后兼容）；
  // 声明为 sticker 但姿态非法 → 降级为 'text'，避免渲染出空气泡（架构 §2.6 约定 3）
  const rawKind = m.kind === 'sticker' || m.kind === 'text' ? m.kind : undefined;
  const rawSticker = isMascotExpression(m.sticker) ? m.sticker : undefined;
  const kind = rawKind === 'sticker' && !rawSticker ? 'text' : rawKind;

  return {
    id: m.id,
    role,
    content: m.content,
    sources: Array.isArray(m.sources) ? (m.sources as SourceItem[]) : undefined,
    guesses: Array.isArray(m.guesses) ? (m.guesses as string[]) : undefined,
    contact: m.contact && typeof m.contact === 'object' ? (m.contact as FallbackContact) : undefined,
    status: 'done',
    messageId: typeof m.messageId === 'string' ? m.messageId : undefined,
    feedback: m.feedback === 'helpful' || m.feedback === 'reported' ? m.feedback : null,
    kind,
    sticker: kind === 'sticker' ? rawSticker : undefined,
    stopped: m.stopped === true ? true : undefined,
  };
}

/** 从 localStorage 读取某场景的历史会话；无数据或解析失败返回 null（保持空会话 + 新 conversationId） */
function loadConversation(scenarioId: string): StoredConversation | null {
  try {
    const raw = window.localStorage.getItem(CONV_STORAGE_PREFIX + scenarioId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { conversationId?: unknown; messages?: unknown };
    if (!Array.isArray(parsed.messages)) return null;
    const messages = parsed.messages
      .map(normalizeRestoredMessage)
      .filter((m): m is UIMessage => m !== null);
    return {
      conversationId:
        typeof parsed.conversationId === 'string' && parsed.conversationId.length > 0
          ? parsed.conversationId
          : `conv-${Date.now()}`,
      messages,
    };
  } catch {
    return null;
  }
}

function writeConversation(scenarioId: string, snap: StoredConversation): void {
  try {
    // UX-7 / Q10：落盘前按完整轮次裁剪到最近 HISTORY_MAX_MESSAGES 条（不切断 user/assistant 配对）。
    // trimStoredMessages 未超限时返回原引用，零拷贝零开销。
    const messages = trimStoredMessages(snap.messages, HISTORY_MAX_MESSAGES);
    window.localStorage.setItem(
      CONV_STORAGE_PREFIX + scenarioId,
      JSON.stringify({ conversationId: snap.conversationId, messages }),
    );
  } catch {
    /* 存储失败（隐私模式/配额）不影响对话 */
  }
}

// ---------------------------------------------------------------------------
// 单条消息行（PERF-3：React.memo + 稳定 key=m.id；外层再包 ErrorBoundary 局部降级）
// ---------------------------------------------------------------------------

interface MessageRowProps {
  m: UIMessage;
  remembered: boolean;
  onRemember: (m: UIMessage) => void;
  onFeedback: (msgId: string, type: 'helpful' | 'reported') => void;
  onHandoff: () => void;
  onPick: (text: string) => void;
  /** B5 UX-8：停止/错误草稿气泡的「继续生成」入口 */
  onContinue: () => void;
}

const MessageRow = memo(function MessageRow({
  m,
  remembered,
  onRemember,
  onFeedback,
  onHandoff,
  onPick,
  onContinue,
}: MessageRowProps) {
  return (
    <div className={m.role === 'user' ? 'msg-row user' : 'msg-row'}>
      <Avatar
        self={m.role === 'user'}
        expression={m.status === 'streaming' ? 'think' : 'calm'}
      />
      <div className="msg-body">
        {m.role === 'assistant' && <NameChip />}
        {m.kind === 'sticker' ? (
          <div
            className="bubble sticker"
            role="img"
            aria-label={m.sticker ? STICKER_LABELS[m.sticker] : m.content}
          >
            {m.sticker ? <Mascot size={48} expression={m.sticker} /> : m.content}
          </div>
        ) : m.status === 'streaming' && m.content === '' ? (
          <Bubble role="assistant">
            <TypingIndicator />
          </Bubble>
        ) : (
          <Bubble
            role={m.role}
            status={m.status === 'error' ? 'error' : undefined}
            /* UX-5：流式期间纯文本（不逐 token 重 parse Markdown），done 后一次性 Markdown */
            streaming={m.status === 'streaming'}
          >
            {m.content}
          </Bubble>
        )}

        {/* UX-1：用户主动停止的标记。不写进 content（避免污染 LLM 历史） */}
        {m.stopped && (
          <>
            <span className="msg-stopped">已停止</span>
            {/* B5 UX-8：停止草稿气泡的「继续生成」入口（同一气泡替换为完整答案，不重复） */}
            <div className="feedback-bar">
              <button className="btn btn-ghost" type="button" onClick={onContinue}>
                <Icon name="RefreshCw" size="inline" /> 继续生成
              </button>
            </div>
          </>
        )}

        {/* 「记住这条」：把用户自己说过的话存进本机记忆库，下次空态问候会回显 */}
        {m.role === 'user' && m.status === 'done' && (
          <div className="feedback-bar">
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => onRemember(m)}
              disabled={remembered}
            >
              <Icon name="Plus" size="inline" />
              {remembered ? '已记住' : '记住这条'}
            </button>
          </div>
        )}

        {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
          <SourceFold items={m.sources} />
        )}

        {m.role === 'assistant' && m.guesses && (
          <>
            {m.guesses.length > 0 && (
              <>
                <p className="fallback-note">
                  这个问题我还不太确定，建议联系{m.contact?.name}（{m.contact?.phone}），或看看：
                </p>
                <GuessChips guesses={m.guesses} onPick={onPick} />
              </>
            )}
            <div className="feedback-bar">
              <button className="btn btn-ghost" type="button" onClick={onHandoff}>
                <Icon name="Headset" size="inline" /> 转人工
              </button>
              {m.guesses.length === 0 && m.contact && (
                <a className="btn btn-ghost" href={`tel:${m.contact.phone}`}>
                  <Icon name="Phone" size="inline" /> {m.contact.name}：{m.contact.phone}
                </a>
              )}
            </div>
          </>
        )}

        {m.role === 'assistant' &&
          m.status === 'done' &&
          !m.guesses &&
          !m.stopped && (
            <FeedbackBar
              given={m.feedback ?? null}
              onFeedback={(type) => onFeedback(m.id, type)}
            />
          )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// ChatPage
// ---------------------------------------------------------------------------

export function ChatPage() {
  const [params] = useSearchParams();
  const scenarioId = params.get('scenario') || 'baodao';
  const navigate = useNavigate();

  // M-5.②：小程序 web-view 无浏览器返回键。小程序环境给顶部渲染返回控件，
  // 点击走 navigateBackInMiniProgram()（退出 web-view 页面栈）；普通浏览器不渲染
  // 返回键（onBack 为 undefined），保持既有行为（左上角品牌标）完全不变。
  const inMiniProgram = useMemo(() => isMiniProgram(), []);
  const handleBack = useCallback(() => {
    if (inMiniProgram) {
      navigateBackInMiniProgram();
    } else {
      navigate('/scenarios');
    }
  }, [inMiniProgram, navigate]);

  // 初始化：优先从 localStorage 按场景维度恢复，否则空会话 + 新 conversationId。
  // initial 保持原始读取（用于判断是否触发「配额满」提示），真正给 hook 的 initialMessages 先裁剪到 50 条。
  const initial = useMemo(() => loadConversation(scenarioId), [scenarioId]);
  const initialMessages = useMemo(() => trimStoredMessages(initial?.messages ?? [], HISTORY_MAX_MESSAGES), [initial]);
  const [convId, setConvId] = useState<string>(() => loadConversation(scenarioId)?.conversationId ?? `conv-${Date.now()}`);
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  const [featuresError, setFeaturesError] = useState(false);
  // 模块页「问吉小农」带来的 ?q= 只做预填，绝不自动发送——最后一下留给用户
  const [input, setInput] = useState<string>(() => params.get('q') ?? '');
  const [stickerOpen, setStickerOpen] = useState(false);

  const chat = useChatStream({ scenarioId, conversationId: convId, initialMessages });
  const { messages, updateMessages, isStreaming } = chat;

  // PERF-2：消息列表拆分 —— 最后一条若仍在流式，单独作为尾条渲染；其余归入已完成列表。
  const lastMsg = messages[messages.length - 1];
  const streamingTail = lastMsg && lastMsg.status === 'streaming' ? lastMsg : null;
  const completed = streamingTail ? messages.slice(0, -1) : messages;

  // 空态问候语：纯函数拼装，只进 JSX，绝不进 streamChat 的任何参数（PRD D5）
  const greeting = useMemo(() => buildGreeting(readProfile(), readMemory()), []);

  const { toastNode, showToast } = useToast();
  // 「已记住」是内存态：刷新后回到可点，再点会被 addMemory 的 duplicate 拦住（架构 §8 A4）
  const [rememberedIds, setRememberedIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  const rememberMessage = useCallback(
    (msg: UIMessage) => {
      const truncated = isMemoryTextTruncated(msg.content);
      const result = addMemory(msg.content, 'chat');
      if (result === 'ok') {
        setRememberedIds((prev) => {
          const next = new Set(prev);
          next.add(msg.id);
          return next;
        });
      }
      showToast(memoryToastText(result, truncated));
    },
    [showToast],
  );

  /**
   * 插入一张吉祥物贴纸。
   * 约束（架构 §2.6 / §6.5）：role:'user'、status:'done'、kind:'sticker'、sticker 合法姿态；
   * content 写可读回退文案 '[贴纸·<标签>]'，即使渲染退化成纯文本也不是空气泡。
   * 不得调用 streamChat、不得置 loading、不得创建 assistant 占位——
   * 靠既有 250ms 防抖落盘自动持久化，会话持久化逻辑零改动。
   */
  const insertSticker = useCallback(
    (expr: MascotExpression) => {
      updateMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'user',
          content: `[贴纸·${STICKER_LABELS[expr]}]`,
          status: 'done',
          kind: 'sticker',
          sticker: expr,
        },
      ]);
    },
    [updateMessages],
  );

  // —— 视觉视口 & 滚动跟随（MOB-1 × UX-2 咬合，R3）——
  const listRef = useRef<HTMLDivElement>(null);
  const vv = useVisualViewport();
  const scroll = useScrollFollow({ listRef, suppressUntilRef: vv.suppressUntilRef });

  // 内容变化后：pinned 时跟随 / 脱离时检测新内容（UX-2）
  useEffect(() => {
    scroll.follow();
  }, [messages, scroll.follow]);

  // —— 首次进入直接贴底（修复「打开停在对话中间」）——
  // 历史消息首帧渲染时 .msg-row 的 content-visibility:auto（PERF-6）让 scrollHeight
  // 是估算值（contain-intrinsic-size 120px），单次 follow() 会停在「估算底部」（对话中间）。
  // 这里在首帧绘制前（useLayoutEffect）强制真实布局并滚到真实底部，
  // 同时初始保护期 onScroll 不写 pinned，避免首帧滚动事件误判「用户上翻」。
  const didInitialSettleRef = useRef(false);
  useLayoutEffect(() => {
    if (didInitialSettleRef.current) return;
    didInitialSettleRef.current = true;
    scroll.scrollToBottomInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // —— 防抖持久化：流式 token 高频追加时 250ms 合并写入，避免卡顿；卸载前立即落盘 ——
  const saveTimerRef = useRef<number | null>(null);
  const snapshotRef = useRef<{ scenarioId: string; conversationId: string; messages: UIMessage[] }>({
    scenarioId,
    conversationId: convId,
    messages,
  });

  useEffect(() => {
    snapshotRef.current = { scenarioId, conversationId: convId, messages };
  }, [scenarioId, convId, messages]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    const flush = () => {
      saveTimerRef.current = null;
      const snap = snapshotRef.current;
      writeConversation(snap.scenarioId, { conversationId: snap.conversationId, messages: snap.messages });
    };
    // PERF-5：250ms 防抖后把落盘让给浏览器空闲期（requestIdleCallback），
    // 写 localStorage 完全移出渲染热路径；不支持 rIC 时直接落盘（等价既有行为）。
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const ric = (
        window as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number }
      ).requestIdleCallback;
      if (typeof ric === 'function') {
        ric(flush, { timeout: 2000 });
      } else {
        flush();
      }
    }, CONV_SAVE_DEBOUNCE_MS);
  }, []);

  // 每次 messages 变化都重新调度防抖保存（messages 每次 set 都是新引用，天然触发）：
  // 流式 token 高频追加期间只重置定时器，250ms 静默后统一落盘一次，避免卡顿。
  useEffect(() => {
    scheduleSave();
  }, [messages, scheduleSave]);

  // 卸载时无条件立即落盘（不依赖 timer 是否 pending），确保最后一条消息不丢。
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const snap = snapshotRef.current;
      writeConversation(snap.scenarioId, { conversationId: snap.conversationId, messages: snap.messages });
    };
  }, []);

  // —— ERR-6：?scenario= 变化时重置（清消息 + 换 conversation + 掐断旧流）——
  // 用 useLayoutEffect：在浏览器绘制前完成重置，避免旧场景消息闪一帧。
  const prevScenarioRef = useRef(scenarioId);
  useLayoutEffect(() => {
    if (prevScenarioRef.current === scenarioId) return;
    prevScenarioRef.current = scenarioId;
    const loaded = loadConversation(scenarioId);
    const nextConv = loaded?.conversationId ?? `conv-${Date.now()}`;
    setConvId(nextConv);
    // UX-7：切换场景同样按 50 条上限裁剪后再交给 hook
    chat.resetForScenario(scenarioId, nextConv, trimStoredMessages(loaded?.messages ?? [], HISTORY_MAX_MESSAGES));
    setInput(params.get('q') ?? '');
    track({ ev: 'page_view', scenario: scenarioId });
  }, [scenarioId, params, chat.resetForScenario]);

  // 首载也打一次 page_view（场景切换已在上方 effect 打）
  useEffect(() => {
    track({ ev: 'page_view', scenario: scenarioId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UX-7：历史超上限被裁剪时给一次可见提示（不打断对话）
  const historyCapHintedRef = useRef(false);
  useEffect(() => {
    if (historyCapHintedRef.current) return;
    if (initial && initial.messages.length > HISTORY_MAX_MESSAGES) {
      historyCapHintedRef.current = true;
      showToast(`历史记录较多，已自动保留最近 ${HISTORY_MAX_MESSAGES} 条`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 猜你想问（UX-6）：失败不再静默 —— 置 featuresError，UI 呈现占位+重试按钮
  const loadFeatures = useCallback((sid: string) => {
    let cancelled = false;
    getFeatures(sid)
      .then((r) => {
        if (cancelled) return;
        setFeatures(r.data);
        setFeaturesError(false);
      })
      .catch((e) => {
        console.warn('[features] 加载失败:', e instanceof Error ? e.message : String(e));
        if (!cancelled) setFeaturesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => loadFeatures(scenarioId), [scenarioId, loadFeatures]);

  const handleFeedback = useCallback(
    (msgId: string, type: 'helpful' | 'reported') => {
      updateMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, feedback: type } : m)));
      // A-2（方案 A）：仅「报错」携带问答快照（该条 AI 回答 + 其前一条用户提问）；
      // 「有帮助」不带（AC-A2.1）。快照构建/截断是纯函数（lib/feedback.ts），
      // 前端正常路径永不触发服务端 400（AC-A2.4）。
      const snapshot = type === 'reported' ? buildFeedbackSnapshot(messages, msgId) : undefined;
      postFeedback({ message_id: msgId, type, snapshot: snapshot ?? undefined }).catch((e) => {
        // 反馈失败不阻断对话，但不再纯静默（MAINT-4）
        console.warn('[feedback] 上报失败:', e instanceof Error ? e.message : String(e));
      });
    },
    // 增加 messages 依赖：保证点击时快照取自当前消息态（架构 §2.4.3）
    [updateMessages, messages],
  );

  const goHandoff = useCallback(() => navigate('/handoff'), [navigate]);

  return (
    <AppShell
      title="吉农 AI 助手"
      onBack={inMiniProgram ? handleBack : undefined}
      right={
        <>
          {/* AppShell 内部先渲染 ThemeToggle，故实际顺序为 [主题][模块中心][更多]（架构 §8 A2 默认方案） */}
          <button
            className="nav-action"
            type="button"
            aria-label="模块中心"
            onClick={() => navigate('/modules')}
          >
            <Icon name="LayoutGrid" size="button" />
          </button>
          <button
            className="nav-more"
            type="button"
            aria-label="更多"
            onClick={() => navigate('/scenarios')}
          >
            <Icon name="MoreHorizontal" size="button" />
          </button>
        </>
      }
    >
      <div className="page-scroll chat-list" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 && (
          <>
            {/* 空会话不是「出错了」，而是「还没开始」——用一张细线插画给开场留白 */}
            <div className="empty-state compact">
              <Illustration name="emptyChat" />
            </div>
            <div className="msg-row">
              <Avatar expression="happy" />
              <div className="msg-body">
                <NameChip />
                <Bubble role="assistant">{greeting}</Bubble>
                {featuresError ? (
                  /* UX-6：猜你想问加载失败 → 可见占位 + 重试（不再静默 setFeatures([])） */
                  <div className="feedback-bar">
                    <button className="btn btn-ghost" type="button" onClick={() => loadFeatures(scenarioId)}>
                      <Icon name="AlertCircle" size="inline" /> 猜你想问加载失败，点击重试
                    </button>
                  </div>
                ) : (
                  <GuessYouAsk items={features} onPick={chat.send} />
                )}
              </div>
            </div>
          </>
        )}

        {/*
          PERF-2：已完成列表与流式尾条分离渲染。
          已完成部分由 MessageRow(memo) 渲染；正在流式的那条单独放在尾部，
          token 合帧更新时只重渲染尾条，已完成消息的 DOM 与 memo 比较完全不参与热路径。
          两条 JSX 是同一父容器的兄弟节点，key=m.id 仍可跨区完成 reconciliation（PERF-3 保持）。
        */}
        {completed.map((m) => (
          <ErrorBoundary
            key={m.id}
            inline
            scenario={scenarioId}
            fallback={
              <div className="msg-row degraded">
                <div className="msg-body">
                  <p className="fallback-note">这条消息显示失败</p>
                </div>
              </div>
            }
          >
            <MessageRow
              m={m}
              remembered={rememberedIds.has(m.id)}
              onRemember={rememberMessage}
              onFeedback={handleFeedback}
              onHandoff={goHandoff}
              onPick={chat.send}
              onContinue={chat.continueGeneration}
            />
          </ErrorBoundary>
        ))}

        {streamingTail && (
          <ErrorBoundary
            key={streamingTail.id}
            inline
            scenario={scenarioId}
            fallback={
              <div className="msg-row degraded">
                <div className="msg-body">
                  <p className="fallback-note">这条消息显示失败</p>
                </div>
              </div>
            }
          >
            <MessageRow
              m={streamingTail}
              remembered={rememberedIds.has(streamingTail.id)}
              onRemember={rememberMessage}
              onFeedback={handleFeedback}
              onHandoff={goHandoff}
              onPick={chat.send}
              onContinue={chat.continueGeneration}
            />
          </ErrorBoundary>
        )}

        {/* 息屏/切后台把 SSE 挂起后的引导（既有语义保留：只提示，不自动重发） */}
        {isStreaming && chat.streamStalled && (
          <div className="msg-row" role="status" aria-live="polite">
            <div className="msg-body">
              <p className="fallback-note">连接似乎中断了，内容可能没有更新。</p>
              <div className="feedback-bar">
                <button className="btn btn-ghost" type="button" onClick={chat.regenerate}>
                  <Icon name="AlertCircle" size="inline" /> 重新生成
                </button>
              </div>
            </div>
          </div>
        )}

        {/* A3：SSE 帧降级提示（ERR-3）——不打断已生成内容，会话末追加一条提示 */}
        {chat.state.degradedFrames > 0 && chat.state.phase === 'done' && (
          <div className="msg-row" role="status" aria-live="polite">
            <div className="msg-body">
              <p className="fallback-note">这次回答可能不完整（部分内容传输中断），建议重新提问。</p>
            </div>
          </div>
        )}

        {/* UX-2：用户上翻后新消息到达 → 浮标回底 */}
        {scroll.hasNewContent && <NewContentPill onClick={scroll.scrollToBottom} />}
      </div>

      {/* UX-3/UX-4：六类分级错误卡 + 人工兜底卡（shouldRenderErrorCard 过滤用户主动停止） */}
      <ErrorNotice
        error={chat.state.error && shouldRenderErrorCard(chat.state.error) ? chat.state.error : null}
        showHandoff={chat.showHandoff}
        continueAvailable={chat.hasDraft}
        onRetry={chat.retry}
        onRephrase={chat.clearError}
        onHandoff={goHandoff}
        onContinue={chat.continueGeneration}
        scenario={scenarioId}
      />

      {stickerOpen && (
        <StickerPanel onPick={insertSticker} onClose={() => setStickerOpen(false)} />
      )}

      <InputBar
        value={input}
        onChange={setInput}
        onSend={() => chat.send(input)}
        streaming={isStreaming}
        onStop={chat.stop}
        onStickerClick={() => setStickerOpen((v) => !v)}
        stickerOpen={stickerOpen}
      />

      {toastNode}
    </AppShell>
  );
}
