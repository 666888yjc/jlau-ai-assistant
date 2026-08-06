import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { parseSSE, SseEvent } from './helpers';

const app = createApp();

describe('POST /api/v1/chat (SSE mock)', () => {
  it('成功流：命中知识库 -> token + sources + done(stop)', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({ scenario_id: 'baodao', message: '报到要带什么', history: [], conversation_id: 'test-001' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const events: SseEvent[] = parseSSE(res.text);
    const types = events.map((e) => e.event);
    expect(types).toContain('token');
    expect(types).toContain('sources');
    expect(types).toContain('done');

    const done = events.find((e) => e.event === 'done')!.data;
    expect(done.finish_reason).toBe('stop');
    expect(done.conversation_id).toBe('test-001');
    expect(done.message_id).toMatch(/^m-/);

    const sources = events.find((e) => e.event === 'sources')!.data;
    expect(sources.items[0].title).toContain('新生入学须知');

    const joined = events.filter((e) => e.event === 'token').map((e) => e.data.content).join('');
    expect(joined).toContain('录取通知书');
    expect(joined).toContain('身份证');
  });

  it('兜底流：知识库无答案 -> fallback + done(no_answer)', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({ scenario_id: 'baodao', message: '吉农保研率多少', history: [], conversation_id: 'test-002' });

    expect(res.status).toBe(200);
    const events = parseSSE(res.text);
    const fallback = events.find((e) => e.event === 'fallback')!.data;
    expect(fallback.guesses.length).toBeGreaterThan(0);
    expect(fallback.contact.phone).toBe('0431-84532980');

    const done = events.find((e) => e.event === 'done')!.data;
    expect(done.finish_reason).toBe('no_answer');
  });

  it('支持多轮 history 透传（不影响 mock 判定）', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({
        scenario_id: 'baodao',
        message: '宿舍怎么分配',
        history: [{ role: 'user', content: '从长春站怎么去学校' }, { role: 'assistant', content: '可乘公交...' }],
        conversation_id: 'test-003',
      });
    expect(res.status).toBe(200);
    const events = parseSSE(res.text);
    expect(events.some((e) => e.event === 'done')).toBe(true);
  });

  it('缺 scenario_id -> 400 + code 4001 (JSON，非 SSE)', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({ message: '报到要带什么', conversation_id: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
  });

  it('缺 conversation_id -> 400 + code 4001', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({ scenario_id: 'baodao', message: '报到要带什么' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
  });

  it('场景不存在 -> 400 + code 4002', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({ scenario_id: 'nope', message: '你好', conversation_id: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4002);
  });

  it('message 超长(>2000) -> 400 + code 4001', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({ scenario_id: 'baodao', message: 'x'.repeat(2001), conversation_id: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
  });
});

describe('POST /api/v1/chat (转人工意图)', () => {
  it('命中转人工：不调 LLM，SSE 返回 token + fallback(空 guesses) + done(stop)', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({ scenario_id: 'baodao', message: '我要转人工', history: [], conversation_id: 'test-004' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const events = parseSSE(res.text);
    const types = events.map((e) => e.event);
    expect(types).toContain('token');
    expect(types).toContain('fallback');
    expect(types).toContain('done');
    expect(types).not.toContain('error');

    const joined = events.filter((e) => e.event === 'token').map((e) => e.data.content).join('');
    expect(joined).toContain('值班电话');
    expect(joined).toContain('0431-84533110');

    const fallback = events.find((e) => e.event === 'fallback')!.data;
    expect(fallback.guesses).toEqual([]);
    expect(fallback.contact.phone).toBe('0431-84533110');
    expect(fallback.contact.name).toBe('保卫处（24小时值班）');

    const done = events.find((e) => e.event === 'done')!.data;
    expect(done.finish_reason).toBe('stop');
    expect(done.conversation_id).toBe('test-004');
    expect(done.message_id).toMatch(/^m-/);
  });

  it('转人工命中时不再走知识库/兜底（普通 mock 流被拦截）', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({ scenario_id: 'baodao', message: '投诉，帮我找辅导员', history: [], conversation_id: 'test-006' });

    const events = parseSSE(res.text);
    const fallback = events.find((e) => e.event === 'fallback')!.data;
    // 空 guesses 表示「转人工引导」，而非普通兜底的猜你想问
    expect(fallback.guesses).toEqual([]);
  });

  it('普通问题不触发转人工（仍走正常流）', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({ scenario_id: 'baodao', message: '报到要带什么', history: [], conversation_id: 'test-005' });

    const events = parseSSE(res.text);
    expect(events.some((e) => e.event === 'token')).toBe(true);
    // 命中知识库 -> 无 fallback 事件
    expect(events.some((e) => e.event === 'fallback')).toBe(false);
  });
});
