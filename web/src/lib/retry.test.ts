import { describe, it, expect } from 'vitest';
import { backoffMs, parseRetryAfter, remainingRetries, shouldRetry } from './retry';
import {
  MAX_RETRY,
  RETRY_BASE_429_MS,
  RETRY_BASE_MS,
  RETRY_JITTER_MS,
  RETRY_MAX_BACKOFF_MS,
} from './config';

/**
 * 重试策略单测（T02 验收③）。
 *
 * 验收要求「400/404 不产生第二次请求」。这里用纯函数层等价断言：
 * shouldRetry 返回 false 即调用方不会发起第二次请求 —— 决策与执行分离的好处正在于此，
 * 不用起 mock server 就能把策略钉死。
 *
 * 随机源统一注入，退避值断言到精确毫秒。
 */

const noJitter = () => 0;
const maxJitter = () => 0.999999;

describe('retry: 4xx 永不重试（ERR-2 核心改动）', () => {
  it('1. 400 不重试 —— 不产生第二次请求', () => {
    expect(shouldRetry(400, 0)).toBe(false);
  });

  it('2. 404 不重试 —— 不产生第二次请求', () => {
    expect(shouldRetry(404, 0)).toBe(false);
  });

  it('3. 全部常见 4xx（429 除外）一律不重试', () => {
    for (const s of [400, 401, 403, 404, 405, 409, 410, 415, 422]) {
      expect(shouldRetry(s, 0), `status=${s}`).toBe(false);
    }
  });

  it('4. 即使 attempt=0 且在线，4xx 也不重试（原实现在此处一视同仁地重试）', () => {
    expect(shouldRetry(400, 0, false)).toBe(false);
    expect(shouldRetry(422, 0, false)).toBe(false);
  });
});

describe('retry: 429 遵循 Retry-After', () => {
  it('5. 429 可重试', () => {
    expect(shouldRetry(429, 0)).toBe(true);
    expect(shouldRetry(429, 1)).toBe(true);
  });

  it('6. 有 Retry-After 时退避 ≥ 服务端要求的秒数', () => {
    const wait = backoffMs(0, 8, 429, noJitter);
    expect(wait).toBe(8000);
    expect(wait).toBeGreaterThanOrEqual(8 * 1000);
  });

  it('7. Retry-After 之上仍叠加抖动，防 5000 人同秒回冲', () => {
    const w0 = backoffMs(0, 5, 429, noJitter);
    const w1 = backoffMs(0, 5, 429, maxJitter);
    expect(w0).toBe(5000);
    expect(w1).toBeGreaterThan(w0);
    expect(w1).toBeLessThan(5000 + RETRY_JITTER_MS + 1);
  });

  it('8. 429 缺 Retry-After 时以 5s 为基准指数退避（Q7 默认值）', () => {
    expect(backoffMs(0, undefined, 429, noJitter)).toBe(RETRY_BASE_429_MS);
    expect(backoffMs(1, undefined, 429, noJitter)).toBe(RETRY_BASE_429_MS * 2);
  });

  it('9. 超长 Retry-After 被 30s 上限截断（避免 UI 假死）', () => {
    expect(backoffMs(0, 300, 429, noJitter)).toBe(RETRY_MAX_BACKOFF_MS);
  });

  it('10. Retry-After: 0 合法，表示可立即重试', () => {
    expect(backoffMs(0, 0, 429, noJitter)).toBe(0);
  });
});

describe('retry: 网络错误与 5xx 最多 2 次', () => {
  it('11. 无响应（网络错误）可重试', () => {
    expect(shouldRetry(undefined, 0)).toBe(true);
    expect(shouldRetry(undefined, 1)).toBe(true);
  });

  it('12. 5xx 可重试', () => {
    for (const s of [500, 502, 503, 504]) {
      expect(shouldRetry(s, 0), `status=${s}`).toBe(true);
    }
  });

  it('13. 达到上限后停手：attempt=MAX_RETRY 一律 false', () => {
    expect(MAX_RETRY).toBe(2);
    expect(shouldRetry(500, MAX_RETRY)).toBe(false);
    expect(shouldRetry(undefined, MAX_RETRY)).toBe(false);
    expect(shouldRetry(429, MAX_RETRY)).toBe(false);
  });

  it('14. 完整生命周期：一次首发 + 两次重试后不再重试（共 3 次尝试）', () => {
    const decisions = [0, 1, 2].map((attempt) => shouldRetry(503, attempt));
    expect(decisions).toEqual([true, true, false]);
  });

  it('15. 离线时视为网络错误，仍给重试机会（连接可能在退避窗口内恢复）', () => {
    expect(shouldRetry(undefined, 0, true)).toBe(true);
    expect(shouldRetry(500, 0, true)).toBe(true);
  });

  it('16. 2xx/3xx 不该走到重试路径', () => {
    expect(shouldRetry(200, 0)).toBe(false);
    expect(shouldRetry(204, 0)).toBe(false);
    expect(shouldRetry(304, 0)).toBe(false);
  });
});

describe('retry: 指数退避与抖动边界', () => {
  it('17. 5xx/网络错误按 800ms 基数指数增长', () => {
    expect(backoffMs(0, undefined, 500, noJitter)).toBe(RETRY_BASE_MS);
    expect(backoffMs(1, undefined, 500, noJitter)).toBe(RETRY_BASE_MS * 2);
    expect(backoffMs(2, undefined, 500, noJitter)).toBe(RETRY_BASE_MS * 4);
  });

  it('18. 不传 status 时按非限流基数处理', () => {
    expect(backoffMs(0, undefined, undefined, noJitter)).toBe(RETRY_BASE_MS);
  });

  it('19. 抖动严格落在 [0, RETRY_JITTER_MS) 区间内', () => {
    const base = backoffMs(0, undefined, 500, noJitter);
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const v = backoffMs(0, undefined, 500, () => r);
      expect(v).toBeGreaterThanOrEqual(base);
      expect(v).toBeLessThan(base + RETRY_JITTER_MS);
    }
  });

  it('20. 退避单调不减，且永不超过 30s 硬上限', () => {
    let prev = -1;
    for (let a = 0; a < 12; a++) {
      const v = backoffMs(a, undefined, 500, maxJitter);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(RETRY_MAX_BACKOFF_MS);
      prev = v;
    }
  });

  it('21. 负数/小数 attempt 被规整，不产生 NaN 或负延迟', () => {
    expect(backoffMs(-3, undefined, 500, noJitter)).toBe(RETRY_BASE_MS);
    expect(backoffMs(1.7, undefined, 500, noJitter)).toBe(RETRY_BASE_MS * 2);
  });

  it('22. 默认随机源可用（不注入 rand 时不报错且在合理区间）', () => {
    const v = backoffMs(0, undefined, 500);
    expect(v).toBeGreaterThanOrEqual(RETRY_BASE_MS);
    expect(v).toBeLessThan(RETRY_BASE_MS + RETRY_JITTER_MS);
  });
});

describe('retry: Retry-After 头解析', () => {
  const NOW = Date.parse('2026-08-07T00:00:00Z');

  it('23. delta-seconds 形式', () => {
    expect(parseRetryAfter('120', NOW)).toBe(120);
    expect(parseRetryAfter('  7  ', NOW)).toBe(7);
    expect(parseRetryAfter('0', NOW)).toBe(0);
  });

  it('24. HTTP-date 形式换算为相对秒数', () => {
    expect(parseRetryAfter('Fri, 07 Aug 2026 00:00:30 GMT', NOW)).toBe(30);
  });

  it('25. 已过期的 HTTP-date 归零而非负数', () => {
    expect(parseRetryAfter('Thu, 06 Aug 2026 23:59:00 GMT', NOW)).toBe(0);
  });

  it('26. 缺失或无法解析时返回 undefined，交由指数退避兜底', () => {
    expect(parseRetryAfter(null, NOW)).toBeUndefined();
    expect(parseRetryAfter(undefined, NOW)).toBeUndefined();
    expect(parseRetryAfter('', NOW)).toBeUndefined();
    expect(parseRetryAfter('soon', NOW)).toBeUndefined();
    expect(parseRetryAfter('-5', NOW)).toBeUndefined();
  });

  it('27. 解析结果可直接喂给 backoffMs 形成完整链路', () => {
    const sec = parseRetryAfter('3', NOW);
    expect(backoffMs(0, sec, 429, noJitter)).toBe(3000);
  });
});

describe('retry: 剩余次数展示', () => {
  it('28. remainingRetries 随 attempt 递减且不为负', () => {
    expect(remainingRetries(0)).toBe(2);
    expect(remainingRetries(1)).toBe(1);
    expect(remainingRetries(2)).toBe(0);
    expect(remainingRetries(99)).toBe(0);
    expect(remainingRetries(-1)).toBe(2);
  });
});
