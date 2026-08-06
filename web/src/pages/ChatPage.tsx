import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { getFeatures, postFeedback, streamChat } from '../lib/api';
import { addMemory, buildGreeting, isMemoryTextTruncated, readMemory, readProfile } from '../lib/profile';
// 记忆写入的五种结果文案（架构 §2.9）在 ProfilePage 里定义并导出，
// 这里直接复用，避免同一套提示语在两个页面各写一份、日后改一处漏一处。
import { memoryToastText } from './ProfilePage';
import type { FallbackContact, FeatureItem, SourceItem, SSEEvent } from '../types/api';
import type { UIMessage } from '../types/chat';

// ---- 会话本地持久化（刷新不丢聊天）----
// 按场景维度存 localStorage：jxn-conv-<scenarioId> -> { conversationId, messages }
const CONV_STORAGE_PREFIX = 'jxn-conv-';
const CONV_SAVE_DEBOUNCE_MS = 250;

// 手机息屏 / 切到别的 App 时，浏览器可能把 SSE 流挂起：回到前台后 loading 还亮着，内容却不再增长。
// 回前台那一刻若距最后一个 token 已超过这个阈值，就认定流已经死了，给用户一个「重新生成」的出口。
const STREAM_STALL_THRESHOLD_MS = 8000;

interface StoredConversation {
  conversationId: string;
  messages: UIMessage[];
}

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
    window.localStorage.setItem(
      CONV_STORAGE_PREFIX + scenarioId,
      JSON.stringify({ conversationId: snap.conversationId, messages: snap.messages }),
    );
  } catch {
    /* 存储失败（隐私模式/配额）不影响对话 */
  }
}

let seq = 0;
const nextId = () => `m${Date.now()}-${seq++}`;

export function ChatPage() {
  const [params] = useSearchParams();
  const scenarioId = params.get('scenario') || 'baodao';
  const navigate = useNavigate();

  // 初始化：优先从 localStorage 按场景维度恢复，否则空会话 + 新 conversationId
  const [convId] = useState<string>(() => loadConversation(scenarioId)?.conversationId ?? `conv-${Date.now()}`);
  const [messages, setMessages] = useState<UIMessage[]>(() => loadConversation(scenarioId)?.messages ?? []);
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  // 模块页「问吉小农」带来的 ?q= 只做预填，绝不自动发送——最后一下留给用户
  const [input, setInput] = useState<string>(() => params.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // SSE 被息屏/切后台挂起的提示态。只有 loading 仍为 true 时才有意义，渲染处会一起判断。
  const [streamStalled, setStreamStalled] = useState(false);

  // 空态问候语：纯函数拼装，只进 JSX，绝不进 streamChat 的任何参数（PRD D5）
  const greeting = useMemo(() => buildGreeting(readProfile(), readMemory()), []);

  const { toastNode, showToast } = useToast();
  // 「已记住」是内存态：刷新后回到可点，再点会被 addMemory 的 duplicate 拦住（架构 §8 A4）
  const [rememberedIds, setRememberedIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  // 贴纸面板开关态（P1）：仅在用户点输入栏贴纸按钮时展开，不存会话
  const [stickerOpen, setStickerOpen] = useState(false);

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
      setMessages((prev) => [
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
    [],
  );

  const listRef = useRef<HTMLDivElement>(null);
  const activeAssistantId = useRef<string | null>(null);

  // —— SSE 挂起检测 & 主动中断（流控制层，不参与请求构造、不参与持久化）——
  /** 最后一个 token 文本到达的时刻；0 表示本轮还没收到过任何 token */
  const lastTokenAtRef = useRef<number>(0);
  /** streamStalled 的镜像，供高频 token 回调里免 re-render 地判断，避免每个 token 都触发一次 setState */
  const streamStalledRef = useRef<boolean>(false);
  /** 当前在途请求的中断器；「重新生成」时先掐掉这条已经死掉的流 */
  const abortRef = useRef<AbortController | null>(null);
  /** 待重发的问题：regenerate 只负责记下来，等 loading 落回 false 后由 effect 真正发出去 */
  const pendingRetryRef = useRef<string | null>(null);

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
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const snap = snapshotRef.current;
      writeConversation(snap.scenarioId, { conversationId: snap.conversationId, messages: snap.messages });
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

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  useEffect(() => {
    getFeatures(scenarioId)
      .then((r) => setFeatures(r.data))
      .catch(() => setFeatures([]));
  }, [scenarioId]);

  useEffect(scrollToBottom, [messages, loading]);

  // 从后台/息屏回到前台：还在 loading 但已经很久没有新 token，就是被浏览器挂起了。
  // 只做提示，不自动重发——自动重发会在用户不知情时多消耗一次额度。
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!loading) return;
      if (Date.now() - lastTokenAtRef.current <= STREAM_STALL_THRESHOLD_MS) return;
      streamStalledRef.current = true;
      setStreamStalled(true);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loading]);

  const appendToken = useCallback((content: string) => {
    const id = activeAssistantId.current;
    if (!id) return;
    // 真正的 token 文本到达 → 刷新活跃时刻，并解除可能已经亮起的挂起提示
    lastTokenAtRef.current = Date.now();
    if (streamStalledRef.current) {
      streamStalledRef.current = false;
      setStreamStalled(false);
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: m.content + content } : m)),
    );
  }, []);

  const handleEvent = useCallback(
    (ev: SSEEvent) => {
      if (ev.type === 'token') {
        appendToken(ev.content);
      } else if (ev.type === 'sources') {
        const id = activeAssistantId.current;
        if (id) setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, sources: ev.items } : m)));
      } else if (ev.type === 'fallback') {
        const id = activeAssistantId.current;
        if (id)
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, guesses: ev.guesses, contact: ev.contact } : m)),
          );
      } else if (ev.type === 'done') {
        const id = activeAssistantId.current;
        if (id)
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, status: 'done', messageId: ev.message_id } : m)),
          );
        activeAssistantId.current = null;
        setLoading(false);
      } else if (ev.type === 'error') {
        const id = activeAssistantId.current;
        if (id)
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, status: 'error', content: ev.message } : m)),
          );
        activeAssistantId.current = null;
        setLoading(false);
        setError(null);
      }
    },
    [appendToken],
  );

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || loading) return;
      setError(null);
      setInput('');

      // 贴纸消息不得进入 LLM 上下文（N5 / 架构 §2.6 约定 4）；
      // 请求体字段结构不变，只是过滤掉既有的 history 内容
      const history = messages
        .filter((m) => m.status === 'done' && m.kind !== 'sticker')
        .map((m) => ({ role: m.role, content: m.content }));

      const userMsg: UIMessage = { id: nextId(), role: 'user', content: question, status: 'done' };
      const assistantId = nextId();
      const assistantMsg: UIMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        feedback: null,
      };
      activeAssistantId.current = assistantId;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setLoading(true);

      // 新一轮流开始：把挂起检测的基线拨到此刻，并清掉上一轮可能残留的提示
      lastTokenAtRef.current = Date.now();
      streamStalledRef.current = false;
      setStreamStalled(false);

      // 只新增流控制层：请求体字段结构与顺序逐字节不变，signal 是 streamChat 既有的第三个可选参数
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChat(
          { scenario_id: scenarioId, message: question, history, conversation_id: convId },
          handleEvent,
          controller.signal,
        );
      } catch {
        // 用户点「重新生成」主动掐流不算故障，UI 已由 regenerate 接管，这里不能再写回错误态
        if (controller.signal.aborted) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, status: 'error', content: '网络开小差，点此重发' }
              : m,
          ),
        );
        activeAssistantId.current = null;
        setLoading(false);
        setError('网络开小差，请稍后重试');
      } finally {
        // 只清理自己那一个，避免把后一轮请求的中断器误清空
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [loading, messages, scenarioId, convId, handleEvent],
  );

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) send(lastUser.content);
    setError(null);
  }, [messages, send]);

  /**
   * 「重新生成」：SSE 被息屏挂起后的自救出口。
   * 先 abort 掉那条已经死掉的流，再把本轮未完成的「提问 + 空回答」摘出列表，
   * 然后交给 pendingRetryRef 在 loading 落回 false 后原样重发一次——
   * 这样重发时算出来的 history 与首次发送完全一致，请求体结构也不变；不新增任何持久化代码。
   */
  const regenerate = useCallback(() => {
    const stalledAssistantId = activeAssistantId.current;
    abortRef.current?.abort();
    abortRef.current = null;
    activeAssistantId.current = null;

    // 贴纸不是提问（架构 §2.6 约定 4），找最后一条真正的用户问句
    const lastUser = [...messages].reverse().find((m) => m.role === 'user' && m.kind !== 'sticker');
    const question = lastUser?.content.trim() ?? '';
    const lastUserId = lastUser?.id ?? null;

    setMessages((prev) => prev.filter((m) => m.id !== stalledAssistantId && m.id !== lastUserId));
    streamStalledRef.current = false;
    setStreamStalled(false);
    setError(null);
    setLoading(false);
    pendingRetryRef.current = question.length > 0 ? question : null;
  }, [messages]);

  // regenerate 里不能直接调 send：send 闭包里捕获的 loading 此刻仍是 true，会被它自己的守卫挡回去。
  // 所以等这一帧渲染完、send 拿到 loading=false 的新闭包后，再由这个 effect 发出去。
  useEffect(() => {
    if (loading) return;
    const question = pendingRetryRef.current;
    if (question === null) return;
    pendingRetryRef.current = null;
    void send(question);
  }, [loading, send]);

  const onFeedback = useCallback(
    async (type: 'helpful' | 'reported', messageId?: string) => {
      if (!messageId) return;
      try {
        await postFeedback({ message_id: messageId, type });
      } catch {
        /* 反馈失败不阻断对话 */
      }
    },
    [],
  );

  const goHandoff = useCallback(() => navigate('/handoff'), [navigate]);

  return (
    <AppShell
      title="吉农 AI 助手"
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
      <div className="page-scroll chat-list" ref={listRef}>
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
                <GuessYouAsk items={features} onPick={send} />
              </div>
            </div>
          </>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'msg-row user' : 'msg-row'}>
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
                <Bubble role={m.role} status={m.status === 'error' ? 'error' : undefined}>
                  {m.content}
                </Bubble>
              )}

              {/* 「记住这条」：把用户自己说过的话存进本机记忆库，下次空态问候会回显 */}
              {m.role === 'user' && m.status === 'done' && (
                <div className="feedback-bar">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => rememberMessage(m)}
                    disabled={rememberedIds.has(m.id)}
                  >
                    <Icon name="Plus" size="inline" />
                    {rememberedIds.has(m.id) ? '已记住' : '记住这条'}
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
                      <GuessChips guesses={m.guesses} onPick={send} />
                    </>
                  )}
                  <div className="feedback-bar">
                    <button className="btn btn-ghost" type="button" onClick={goHandoff}>
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

              {m.role === 'assistant' && m.status === 'done' && !m.guesses && (
                <FeedbackBar
                  given={m.feedback ?? null}
                  onFeedback={(type) => {
                    void onFeedback(type, m.messageId);
                    setMessages((prev) =>
                      prev.map((x) => (x.id === m.id ? { ...x, feedback: type } : x)),
                    );
                  }}
                />
              )}

              {m.role === 'assistant' && m.status === 'error' && (
                <div className="feedback-bar">
                  <button className="btn btn-ghost" type="button" onClick={retryLast}>
                    <Icon name="AlertCircle" size="inline" /> 点击重发
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* 息屏/切后台把 SSE 挂起后的引导。复用既有 fallback-note + feedback-bar 样式，零新增 CSS。 */}
        {loading && streamStalled && (
          <div className="msg-row" role="status" aria-live="polite">
            <div className="msg-body">
              <p className="fallback-note">连接似乎中断了，内容可能没有更新。</p>
              <div className="feedback-bar">
                <button className="btn btn-ghost" type="button" onClick={regenerate}>
                  <Icon name="AlertCircle" size="inline" /> 重新生成
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="error-banner" onClick={retryLast} role="button">
          <Icon name="AlertCircle" size="inline" />
          <span>{error}（点击重发）</span>
        </div>
      )}

      {stickerOpen && (
        <StickerPanel onPick={insertSticker} onClose={() => setStickerOpen(false)} />
      )}

      <InputBar
        value={input}
        onChange={setInput}
        onSend={() => send(input)}
        loading={loading}
        onStickerClick={() => setStickerOpen((v) => !v)}
        stickerOpen={stickerOpen}
      />

      {toastNode}
    </AppShell>
  );
}
