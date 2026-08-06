import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { rateLimit, resetRateLimit } from '../src/middleware/rateLimit';

describe('rateLimit 单元', () => {
  it('固定窗口内超过上限后拒绝', () => {
    resetRateLimit();
    const key = 'unit:' + Math.random().toString(36).slice(2);
    expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    rateLimit(key, 3, 60_000);
    rateLimit(key, 3, 60_000);
    const over = rateLimit(key, 3, 60_000);
    expect(over.ok).toBe(false);
    expect(over.remaining).toBe(0);
  });
});

describe('POST /api/v1/feedback 触发 429', () => {
  // 注：resetModules 会触发整图重编译，故放宽超时
  it(
    '超过 RATE_DATA_MAX 后返回 429 + code 4290',
    async () => {
      process.env.RATE_DATA_MAX = '3';
      process.env.RATE_WINDOW_MS = '60000';
      process.env.STORE_KIND = 'memory';
      process.env.COZE_MOCK = 'true';
      vi.resetModules();

      const { createApp } = await import('../src/app');
      const { resetStoreForTest } = await import('../src/store');
      resetStoreForTest();
      const app = createApp();

      let lastStatus = 0;
      let lastCode = 0;
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/v1/feedback')
          .send({ message_id: `m-${i}`, type: 'helpful' });
        lastStatus = res.status;
        lastCode = res.body.code;
      }
      expect(lastStatus).toBe(429);
      expect(lastCode).toBe(4290);
    },
    20000,
  );
});
