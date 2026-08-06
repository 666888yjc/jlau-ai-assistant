import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('POST /api/v1/human-handoff', () => {
  it('成功登记 -> 200 code 0, data 含 hh- 前缀 id、status=pending', async () => {
    const res = await request(app)
      .post('/api/v1/human-handoff')
      .send({ scenario_id: 'baodao', question: '吉农保研率多少', contact: '微信：xiaoming2026' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.id).toMatch(/^hh-/);
    expect(res.body.data.scenario_id).toBe('baodao');
    expect(res.body.data.status).toBe('pending');
    expect(res.body.message).toBe('ok');
  });

  it('无 contact 也成功', async () => {
    const res = await request(app)
      .post('/api/v1/human-handoff')
      .send({ scenario_id: 'baodao', question: '报到流程是什么' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.status).toBe('pending');
  });

  it('contact 含手机号 -> 400 + code 4001（隐私合规拦截，不落库）', async () => {
    const res = await request(app)
      .post('/api/v1/human-handoff')
      .send({ scenario_id: 'baodao', question: '问题', contact: '手机13800138000' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
  });

  it('contact 含身份证号 -> 400 + code 4001', async () => {
    const res = await request(app)
      .post('/api/v1/human-handoff')
      .send({ scenario_id: 'baodao', question: '问题', contact: '身份证220104199001011234' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
  });

  it('缺 scenario_id -> 400 + code 4001', async () => {
    const res = await request(app).post('/api/v1/human-handoff').send({ question: '问题' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
  });

  it('场景不存在 -> 400 + code 4002', async () => {
    const res = await request(app)
      .post('/api/v1/human-handoff')
      .send({ scenario_id: 'nope', question: '问题' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4002);
  });
});
