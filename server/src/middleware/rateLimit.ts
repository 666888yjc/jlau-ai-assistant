import { Request } from 'express';

/**
 * 极简固定窗口限流（无外部依赖），防刷用。
 * key 维度：IP + 端点，窗口内超过 max 即拒绝（返回 4290）。
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateResult {
  ok: boolean;
  remaining: number;
}

export function rateLimit(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  if (b.count >= max) {
    return { ok: false, remaining: 0 };
  }
  b.count += 1;
  return { ok: true, remaining: max - b.count };
}

/** 取客户端 IP（兼容反向代理 X-Forwarded-For；本地回环记为 localhost）。 */
export function clientKey(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (typeof fwd === 'string' ? fwd.split(',')[0].trim() : req.socket?.remoteAddress) || 'unknown';
  return ip;
}

/** 测试用：清空所有限流桶。 */
export function resetRateLimit(): void {
  buckets.clear();
}
