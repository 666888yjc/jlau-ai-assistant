import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config';
import { streamSiliconFlow } from '../src/llm/siliconflow';
import type { ChatInput } from '../src/coze/client';

/**
 * streamSiliconFlow 限流健壮性回归。
 * 覆盖：429/5xx/200-JSON-错误体 的重试退避、401/400 的立即致命降级、
 * 真实 SSE 成功不误降级、以及降级文案为「▸ 标题」资料摘录且绝不抛 error 事件。
 * 全程 stub 全局 fetch，不发真实网络请求；retrieve() 走 server/kb 真实 .md（只读、无副作用）。
 */

/** 能稳定命中 KB「宿舍与住宿」且不触发高德地图意图的问题 */
const KB_HIT_MESSAGE = '宿舍怎么分配';
/** KB 检索原文的块前缀（降级后必须被 formatKbExcerpt 改写掉） */
const RAW_KB_BLOCK = '【宿舍与住宿】';
/** 整理后的资料摘录前缀 */
const EXCERPT_BULLET = '▸ 宿舍与住宿';

interface CapturedEvent {
  e: string;
  d: Record<string, unknown>;
}

function createCollector() {
  const events: CapturedEvent[] = [];
  const emit = (e: string, d: unknown) => {
    events.push({ e, d: (d ?? {}) as Record<string, unknown> });
  };
  return { events, emit };
}

function eventNames(events: CapturedEvent[]): string[] {
  return events.map((x) => x.e);
}

function tokenText(events: CapturedEvent[]): string {
  return events
    .filter((x) => x.e === 'token')
    .map((x) => String(x.d.content ?? ''))
    .join('');
}

function makeInput(message = KB_HIT_MESSAGE): ChatInput {
  return { scenario_id: 'baodao', message, conversation_id: 'conv-sf-test', history: [] };
}

/** HTTP 响应工厂：每次调用生成新 Response（body 只能被消费一次） */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sseResponse(payload: string): Response {
  return new Response(payload, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function sseChunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

const SSE_HELLO = `${sseChunk('你好')}data: [DONE]\n\n`;

/**
 * 用假定时器跑完整条链路：退避 sleep（800ms）瞬时到期，避免真实等待。
 * 模型降级链已收敛为 2 次尝试（主模型 + 备用模型各 1 次），只存在一次 800ms 退避。
 */
async function runStream(input: ChatInput, emit: (e: string, d: unknown) => void): Promise<void> {
  vi.useFakeTimers();
  try {
    const running = streamSiliconFlow(input, emit);
    await vi.runAllTimersAsync();
    await running;
  } finally {
    vi.useRealTimers();
  }
}

/** 断言：降级路径的通用形态（有摘录 token + sources + done，且绝无 error） */
function expectKbFallback(events: CapturedEvent[]): void {
  const names = eventNames(events);
  expect(names).not.toContain('error');
  expect(names).toContain('token');
  expect(names).toContain('sources');
  expect(names).toContain('done');
  expect(names[names.length - 1]).toBe('done');

  const text = tokenText(events);
  expect(text).toContain('AI 大模型暂时繁忙');
  expect(text).toContain(EXCERPT_BULLET);
  expect(text).not.toContain(RAW_KB_BLOCK);

  const done = events.find((x) => x.e === 'done')!.d;
  expect(done.finish_reason).toBe('stop');
  expect(done.conversation_id).toBe('conv-sf-test');
}

describe('streamSiliconFlow 限流重试与降级', () => {
  let originalApiKey: string;

  beforeEach(() => {
    originalApiKey = config.siliconflowApiKey;
    // config 在 import 期已定型，直接改字段绕过 env
    config.siliconflowApiKey = 'test-key';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    config.siliconflowApiKey = originalApiKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('用例1：连续 2 次 429 -> 重试满 2 次后降级为资料摘录，无 error 事件', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(429, { code: 50609, message: 'rate limit' }));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectKbFallback(events);
  });

  it('用例2：401 鉴权失败 -> 只调用 1 次即致命降级，不浪费重试', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { message: 'invalid api key' }));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectKbFallback(events);
  });

  it('用例3：HTTP 200 但 JSON 限流错误体(50609) -> 判可重试，2 次后降级，无 error 事件', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { code: 50609, message: 'rate limit' }));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectKbFallback(events);
  });

  it('用例4：200 + text/event-stream 真实流 -> 一次成功，输出真实内容且不误降级', async () => {
    const fetchMock = vi.fn(async () => sseResponse(SSE_HELLO));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const names = eventNames(events);
    expect(names).not.toContain('error');
    expect(names).toContain('sources');
    expect(names[names.length - 1]).toBe('done');

    const text = tokenText(events);
    expect(text).toBe('你好');
    expect(text).not.toContain('▸');
    expect(text).not.toContain('AI 大模型暂时繁忙');
    expect(text).not.toContain('资料库原文摘录');
  });

  it('用例5：前 1 次 429、第 2 次 SSE 成功 -> 拿到真实内容，不降级', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => jsonResponse(429, { code: 50609, message: 'rate limit' }))
      .mockImplementationOnce(async () => sseResponse(`${sseChunk('你好')}${sseChunk('，同学')}data: [DONE]\n\n`));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const text = tokenText(events);
    expect(text).toBe('你好，同学');
    expect(eventNames(events)).not.toContain('error');
    expect(text).not.toContain('AI 大模型暂时繁忙');
  });

  it('指数退避：首发失败后重试前等待 800ms（重试链仅 2 次，只有一次退避）', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(429, { code: 50609, message: 'rate limit' }));
    vi.stubGlobal('fetch', fetchMock);
    const { emit } = createCollector();

    vi.useFakeTimers();
    try {
      const running = streamSiliconFlow(makeInput(), emit);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(799);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await vi.runAllTimersAsync();
      await running;
    } finally {
      vi.useRealTimers();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('边界：5xx 视为可重试，耗尽后降级', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(503, { message: 'service unavailable' }));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectKbFallback(events);
  });

  it('边界：400 参数错误不再立即致命，主/备用模型各试 1 次后降级', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(400, { message: 'model not found' }));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectKbFallback(events);
  });

  it('降级链：主模型 50609 限流 -> 自动切备用模型出真回答，不降级', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => jsonResponse(200, { code: 50609, message: 'System is too busy now' }))
      .mockImplementationOnce(async () => sseResponse(`${sseChunk('备用模型')}${sseChunk('的回答')}data: [DONE]\n\n`));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const text = tokenText(events);
    expect(text).toBe('备用模型的回答');
    expect(eventNames(events)).not.toContain('error');
    expect(text).not.toContain('AI 大模型暂时繁忙');
  });

  it('降级链：主模型 404 模型不可用 -> 切备用模型成功', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => jsonResponse(404, { message: 'model not found' }))
      .mockImplementationOnce(async () => sseResponse(`${sseChunk('你好')}data: [DONE]\n\n`));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokenText(events)).toBe('你好');
    expect(eventNames(events)).not.toContain('error');
  });

  it('降级链：主/备用模型都 50609 -> 2 次尝试后降级，无 error 事件', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { code: 50609, message: 'System is too busy now' }));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectKbFallback(events);
  });

  it('边界：fetch 抛网络异常 -> 按抖动重试 2 次后降级，不向前端抛 error', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectKbFallback(events);
  });

  it('边界：200 且无 body -> 不误判为成功，重试耗尽后降级', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectKbFallback(events);
  });

  it('边界：200 SSE 但全程无 token（空流）-> 降级而非空回复', async () => {
    const fetchMock = vi.fn(async () => sseResponse('data: [DONE]\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectKbFallback(events);
  });

  it('边界：KB 未命中且上游持续 429 -> 走无资料兜底话术，仍不抛 error', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(429, { code: 50609, message: 'rate limit' }));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput('zzzqqqxxx'), emit);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const names = eventNames(events);
    expect(names).not.toContain('error');
    expect(names).not.toContain('sources'); // 无命中则不发来源
    expect(names[names.length - 1]).toBe('done');
    expect(tokenText(events)).toContain('0431-84532980');
  });

  it('未配置 api key -> 保持原有 5001 错误语义（不进入重试）', async () => {
    config.siliconflowApiKey = '';
    const fetchMock = vi.fn(async () => sseResponse(SSE_HELLO));
    vi.stubGlobal('fetch', fetchMock);
    const { events, emit } = createCollector();

    await runStream(makeInput(), emit);

    expect(fetchMock).not.toHaveBeenCalled();
    const err = events.find((x) => x.e === 'error');
    expect(err).toBeTruthy();
    expect(err!.d.code).toBe(5001);
  });
});
