import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getStore, resetStoreForTest } from '../src/store';

const app = createApp();

describe('POST /api/v1/feedback', () => {
  it('helpful 成功 -> 200 code 0, data 含 fb- 前缀 id', async () => {
    const res = await request(app)
      .post('/api/v1/feedback')
      .send({ message_id: 'm-8f3a', type: 'helpful' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.id).toMatch(/^fb-/);
    expect(res.body.data.message_id).toBe('m-8f3a');
    expect(res.body.data.type).toBe('helpful');
    expect(res.body.message).toBe('ok');
  });

  it('reported + note 成功', async () => {
    const res = await request(app)
      .post('/api/v1/feedback')
      .send({ message_id: 'm-2b7c', type: 'reported', note: '来源链接已失效' });
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('reported');
  });

  it('缺 message_id -> 400 + code 4001', async () => {
    const res = await request(app).post('/api/v1/feedback').send({ type: 'helpful' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
  });

  it('非法 type -> 400 + code 4003', async () => {
    const res = await request(app).post('/api/v1/feedback').send({ message_id: 'm-1', type: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4003);
  });

  it('note 超长(>500) -> 400 + code 4001', async () => {
    const res = await request(app)
      .post('/api/v1/feedback')
      .send({ message_id: 'm-1', type: 'reported', note: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
  });
});

// ---------------------------------------------------------------------------
// A-2 问答快照（方案 A 增量，AC-A2.2/2.4/2.5）
// ---------------------------------------------------------------------------

describe('POST /api/v1/feedback 快照（A-2）', () => {
  it('携带合法 snapshot -> 200 落库，列表可见快照', async () => {
    resetStoreForTest();
    const res = await request(app)
      .post('/api/v1/feedback')
      .send({
        message_id: 'm-snap-1',
        type: 'reported',
        note: '答错了',
        snapshot: { question: '报到要交多少钱？', answer: '学费需在报到时现场缴纳。' },
      });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);

    const store = await getStore();
    const list = await store.listFeedback({ q: '答错了' });
    expect(list.total).toBe(1);
    expect(list.items[0].snapshot).toEqual({
      question: '报到要交多少钱？',
      answer: '学费需在报到时现场缴纳。',
    });
  });

  it('snapshot.question 超限(>2000) -> 400 + code 4004', async () => {
    const res = await request(app)
      .post('/api/v1/feedback')
      .send({
        message_id: 'm-snap-2',
        type: 'reported',
        snapshot: { question: 'q'.repeat(2001), answer: 'a' },
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4004);
  });

  it('snapshot.answer 超限(>20000) -> 400 + code 4004', async () => {
    const res = await request(app)
      .post('/api/v1/feedback')
      .send({
        message_id: 'm-snap-3',
        type: 'reported',
        snapshot: { question: 'q', answer: 'a'.repeat(20001) },
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4004);
  });

  it('snapshot 缺 question/answer 字段 -> 400 + code 4001', async () => {
    const res = await request(app)
      .post('/api/v1/feedback')
      .send({ message_id: 'm-snap-4', type: 'reported', snapshot: { question: '只有问题' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
  });

  it('snapshot 非对象 -> 400 + code 4001', async () => {
    const res = await request(app)
      .post('/api/v1/feedback')
      .send({ message_id: 'm-snap-5', type: 'reported', snapshot: 'not-object' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
  });

  it('A-2 回归锁：不传 snapshot 行为与改造前一致（响应形状 + 落库无 snapshot 字段）', async () => {
    resetStoreForTest();
    const res = await request(app)
      .post('/api/v1/feedback')
      .send({ message_id: 'm-legacy-1', type: 'reported', note: '旧客户端' });
    // 响应形状与旧版逐字一致：data 仅 id/message_id/type，不含 snapshot
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      code: 0,
      data: { id: expect.stringMatching(/^fb-/), message_id: 'm-legacy-1', type: 'reported' },
      message: 'ok',
    });
    // 落库记录无 snapshot 字段（旧记录天然缺失，管理端显示占位）
    const store = await getStore();
    const list = await store.listFeedback({ q: '旧客户端' });
    expect(list.items[0].snapshot).toBeUndefined();
  });

  it('snapshot 为 null -> 接受（与不传等价，AC-A2.2）', async () => {
    resetStoreForTest();
    const res = await request(app)
      .post('/api/v1/feedback')
      .send({ message_id: 'm-null-snap', type: 'reported', snapshot: null });
    expect(res.status).toBe(200);
    const store = await getStore();
    const list = await store.listFeedback({ q: '' });
    const rec = list.items.find((f) => f.message_id === 'm-null-snap');
    expect(rec?.snapshot).toBeUndefined();
  });
});
