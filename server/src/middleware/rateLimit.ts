import { Request } from 'express';

/**
 * 令牌桶限流（SEC-3 补差量）。
 *
 * ## 相比原固定窗口改了什么
 * 1. **固定窗口 → 令牌桶**。固定窗口在窗口交界处会放行 2 倍流量
 *    （窗口末尾打满 + 新窗口开头再打满），报到日峰值下这个毛刺很要命。
 *    令牌桶按时间连续补充，天然平滑。
 * 2. **返回 `retryAfterSec`**。原实现只回 `{ok, remaining}`，调用方没法告诉用户等多久，
 *    于是前端只能瞎猜退避时长 —— 这正是 ERR-2 / UX-3 卡住的根因。
 * 3. **支持票据维度**。原来只按 IP，校园网大量学生共用出口 IP 会被连坐误伤。
 *
 * 内存态实现，无外部依赖。云函数多实例下每实例独立计数，
 * 属于「宁可放宽也不误杀」的取舍：实例数 × max 才是真实上限，这对防刷仍然够用。
 */

interface Bucket {
  /** 当前剩余令牌（可为小数，按时间连续补充） */
  tokens: number;
  /** 上次补充时间戳 */
  last: number;
}

const buckets = new Map<string, Bucket>();

/** 桶数量上限，防止被伪造 key 打爆内存。超限时清理最久未用的一半。 */
const MAX_BUCKETS = 10_000;

export interface RateResult {
  ok: boolean;
  /** 剩余令牌数（向下取整） */
  remaining: number;
  /**
   * 被拒时建议等待的秒数（至少 1）。放行时为 0。
   * 直接用于 `sendError(..., { retryAfterSec })` 下发 Retry-After 头。
   */
  retryAfterSec: number;
}

/** 桶太多时按 last 时间淘汰最旧的一半。 */
function evictIfNeeded(now: number): void {
  if (buckets.size <= MAX_BUCKETS) return;
  const entries = [...buckets.entries()].sort((a, b) => a[1].last - b[1].last);
  const drop = Math.floor(entries.length / 2);
  for (let i = 0; i < drop; i++) buckets.delete(entries[i][0]);
  // 顺带清掉已经满桶且长期未用的（等价于从未访问过）
  for (const [k, b] of buckets) {
    if (now - b.last > 10 * 60_000) buckets.delete(k);
  }
}

/**
 * 消费一个令牌。
 *
 * @param key      限流维度键（建议 `端点:维度:标识`）
 * @param max      桶容量，同时也是每个 windowMs 的补充总量
 * @param windowMs 补满一整桶所需的时间
 */
export function rateLimit(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();

  if (max <= 0) return { ok: false, remaining: 0, retryAfterSec: Math.ceil(windowMs / 1000) };

  // 每毫秒补充的令牌数
  const refillPerMs = max / windowMs;

  let b = buckets.get(key);
  if (!b) {
    b = { tokens: max, last: now };
    buckets.set(key, b);
    evictIfNeeded(now);
  } else {
    const elapsed = Math.max(0, now - b.last);
    b.tokens = Math.min(max, b.tokens + elapsed * refillPerMs);
    b.last = now;
  }

  if (b.tokens < 1) {
    // 攒够 1 个令牌还需要多久
    const needMs = (1 - b.tokens) / refillPerMs;
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil(needMs / 1000)),
    };
  }

  b.tokens -= 1;
  return { ok: true, remaining: Math.floor(b.tokens), retryAfterSec: 0 };
}

/** 取客户端 IP（兼容反向代理 X-Forwarded-For；本地回环记为 localhost）。 */
export function clientKey(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (typeof fwd === 'string' ? fwd.split(',')[0].trim() : req.socket?.remoteAddress) || 'unknown';
  return ip;
}

/**
 * 复合限流维度（SEC-3 ②）：优先按票据，无票据回落到 IP。
 *
 * 为什么优先票据：校园网/宿舍网大量学生共用一个 NAT 出口 IP，
 * 纯 IP 维度会让一个人的高频提问把整栋楼一起限掉 —— 这正是「误伤真新生」的典型形态。
 * 票据是匿名的、每个浏览器会话一份，粒度刚好。
 *
 * @param ticketId 票据的 nonce 部分（不含签名），无票据传 null
 */
export function subjectKey(req: Request, ticketId: string | null): string {
  return ticketId ? `t:${ticketId}` : `ip:${clientKey(req)}`;
}

/** 测试用：清空所有限流桶。 */
export function resetRateLimit(): void {
  buckets.clear();
}
