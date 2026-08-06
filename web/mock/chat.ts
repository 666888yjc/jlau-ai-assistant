import type { IncomingMessage, ServerResponse } from 'node:http';

export type ChatEvent =
  | { type: 'token'; content: string }
  | { type: 'sources'; items: { title: string; url: string; updated_at: string }[] }
  | { type: 'fallback'; guesses: string[]; contact: { name: string; phone: string } }
  | { type: 'done'; conversation_id: string; message_id: string; finish_reason: 'stop' | 'no_answer' }
  | { type: 'error'; code: number; message: string };

function sse(event: string, data: ChatEvent): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw));
  });
}

// 命中「新生报到」域关键词 → 走知识库成功流；否则 → 兜底转人工（不编造）
function isBaodaoScope(q: string): boolean {
  return /报到|材料|通知书|档案|户口|迁移|宿舍|住宿|学费|缴费|校园卡|一卡通|军训|食堂|饮食|交通|长春|火车站|地图|导航|校历|图书馆|开放时间|迎新|绿色通道|助学贷款|专业|学院/i.test(
    q,
  );
}

// 按 openapi.yaml 的 SSE 事件序列生成桩数据
function buildEvents(message: string, conversationId: string): ChatEvent[] {
  if (isBaodaoScope(message)) {
    return [
      { type: 'token', content: '新生报到需携带以下材料：\n' },
      { type: 'token', content: '· 录取通知书、身份证原件\n' },
      { type: 'token', content: '· 档案、户口迁移证（如需迁移户口）\n' },
      { type: 'token', content: '· 小 2 寸证件照 10 张\n' },
      { type: 'token', content: '· 缴费单据 / 助学贷款材料（如需）' },
      {
        type: 'sources',
        items: [
          {
            title: '2026 新生入学须知',
            url: 'https://www.jlau.edu.cn/notice/2026',
            updated_at: '2026-07-20',
          },
        ],
      },
      {
        type: 'done',
        conversation_id: conversationId,
        message_id: 'm-8f3a',
        finish_reason: 'stop',
      },
    ];
  }
  return [
    {
      type: 'fallback',
      guesses: ['报到流程是什么', '宿舍怎么分配', '学费怎么交'],
      contact: { name: '学工处', phone: '0431-84532980' },
    },
    {
      type: 'done',
      conversation_id: conversationId,
      message_id: 'm-2b7c',
      finish_reason: 'no_answer',
    },
  ];
}

export async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let raw = '';
  try {
    raw = await readBody(req);
  } catch {
    raw = '';
  }
  let conversationId = 'test-001';
  let message = '';
  try {
    const body = JSON.parse(raw || '{}');
    conversationId = body.conversation_id || 'test-001';
    message = String(body.message || '');
  } catch {
    // 忽略解析错误，使用默认
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const events = buildEvents(message, conversationId);
  for (const ev of events) {
    if (ev.type === 'token') {
      res.write(sse('token', ev));
      await delay(90);
    } else if (ev.type === 'sources') {
      res.write(sse('sources', ev));
      await delay(60);
    } else if (ev.type === 'fallback') {
      res.write(sse('fallback', ev));
      await delay(60);
    } else if (ev.type === 'done') {
      res.write(sse('done', ev));
    } else if (ev.type === 'error') {
      res.write(sse('error', ev));
    }
  }
  res.end();
}
