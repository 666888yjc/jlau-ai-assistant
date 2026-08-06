import { config } from '../config';
import { newMessageId } from '../utils/id';

/** SSE 事件推送回调（event: token/sources/fallback/done/error）。 */
export type Emit = (event: string, data: unknown) => void;

export interface ChatInput {
  scenario_id: string;
  message: string;
  conversation_id: string;
  history: { role: 'user' | 'assistant'; content: string }[];
}

/**
 * 命中关键词集合：覆盖新生报到域真实问题，决定 mock 走「有答案」还是「兜底」。
 * SPEC §12 断言：『报到要带什么』-> 有答案；『吉农保研率多少』-> 兜底。
 */
const KNOWN_KEYWORDS = [
  '报到', '带', '材料', '录取', '宿舍', '住', '学费', '交', '校园卡', '军训',
  '长春', '去学校', '去吉农', '交通', '档案', '户口', '迁移', '激活', '流程',
  '食堂', '校园', '地图', '位置', '几点', '电话', '联系',
];

function isKnown(message: string): boolean {
  return KNOWN_KEYWORDS.some((k) => message.includes(k));
}

const MOCK_DELAY_MS = 40;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Mock 流（无真实 Coze token 时启用）。
 * 输出严格对齐 openapi.yaml 的 SSE 事件序列，便于本地测试与前端联调。
 */
export async function streamMock(input: ChatInput, emit: Emit): Promise<void> {
  await sleep(MOCK_DELAY_MS);

  if (isKnown(input.message)) {
    emit('token', { type: 'token', content: '新生报到需携带以下材料：' });
    await sleep(MOCK_DELAY_MS);
    emit('token', {
      type: 'token',
      content: '1. 录取通知书；2. 身份证；3. 档案；4. 户口迁移证（如需）；5. 10 张小 2 寸照。',
    });
    await sleep(MOCK_DELAY_MS);
    emit('sources', {
      type: 'sources',
      items: [
        {
          title: '2026 新生入学须知',
          url: 'https://www.jlau.edu.cn/notice/2026',
          updated_at: '2026-07-20',
        },
      ],
    });
    await sleep(MOCK_DELAY_MS);
    emit('done', {
      type: 'done',
      conversation_id: input.conversation_id,
      message_id: newMessageId(),
      finish_reason: 'stop',
    });
  } else {
    emit('fallback', {
      type: 'fallback',
      guesses: ['报到流程是什么', '宿舍怎么分配', '学费怎么交'],
      contact: { name: '学工处', phone: '0431-84532980' },
    });
    await sleep(MOCK_DELAY_MS);
    emit('done', {
      type: 'done',
      conversation_id: input.conversation_id,
      message_id: newMessageId(),
      finish_reason: 'no_answer',
    });
  }
}

/** 解析单段 Coze SSE（event: <name>\ndata: <json>）。 */
function parseCozeEvent(chunk: string): { event: string; data: any } | null {
  let event = '';
  let dataStr = '';
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataStr = line.slice(5).trim();
  }
  if (!event) return null;
  let data: any = null;
  if (dataStr) {
    try {
      data = JSON.parse(dataStr);
    } catch {
      data = null;
    }
  }
  return { event, data };
}

/**
 * 真实 Coze 代理：调用 POST /v3/chat (stream:true)，将上游 SSE 转译为
 * openapi.yaml 定义的事件序列。前端不持有 Coze token（服务端注入）。
 *
 * 事件映射（Coze -> 吉小农）：
 *  - message.delta / message.completed (type=answer) -> token
 *  - message (type=knowledge) -> 累积到 sources，done 前统一发出
 *  - done -> done(stop)
 *  - error / chat.failed -> error(5001)
 */
export async function streamRealCoze(input: ChatInput, emit: Emit): Promise<void> {
  const token = config.cozeToken;
  const botId = config.cozeBotId;
  if (!token || !botId) {
    emit('error', { type: 'error', code: 5001, message: '对话服务未配置' });
    return;
  }

  const messages = [
    ...input.history.map((h) => ({ role: h.role, content: h.content, content_type: 'text' })),
    { role: 'user', content: input.message, content_type: 'text' },
  ];

  let resp: Response;
  try {
    resp = await fetch(`${config.cozeApiBase.replace(/\/$/, '')}/v3/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        bot_id: botId,
        user_id: config.cozeUserId,
        stream: true,
        auto_save_history: true,
        additional_messages: messages,
      }),
    });
  } catch {
    emit('error', { type: 'error', code: 5001, message: '对话服务暂不可用' });
    return;
  }

  if (!resp.ok || !resp.body) {
    emit('error', { type: 'error', code: 5001, message: '对话服务暂不可用' });
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let conversationId = input.conversation_id;
  const sources: { title: string; url: string; updated_at?: string }[] = [];
  let errored = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseCozeEvent(chunk);
        if (!parsed) continue;
        const { event, data } = parsed;

        if (event === 'done') {
          emit('done', {
            type: 'done',
            conversation_id: conversationId,
            message_id: newMessageId(),
            finish_reason: 'stop',
          });
        } else if (event === 'error' || event === 'conversation.chat.failed') {
          emit('error', { type: 'error', code: 5001, message: data?.msg || '对话服务暂不可用' });
          errored = true;
        } else if (data && data.type === 'answer' && typeof data.content === 'string') {
          emit('token', { type: 'token', content: data.content });
        } else if (data && data.type === 'knowledge') {
          try {
            const refs = JSON.parse(data.content).references || [];
            for (const r of refs) {
              sources.push({ title: r.document_name || r.title || '', url: r.url || '', updated_at: r.updated_at });
            }
          } catch {
            /* 忽略无法解析的引用 */
          }
        } else if (data && data.conversation_id) {
          conversationId = data.conversation_id;
        }
      }
    }
  } catch {
    if (!errored) emit('error', { type: 'error', code: 5001, message: '对话服务暂不可用' });
    return;
  }

  if (!errored && sources.length > 0) {
    emit('sources', { type: 'sources', items: sources });
  }
}
