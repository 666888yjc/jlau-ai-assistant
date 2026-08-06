import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

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
