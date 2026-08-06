import { config } from '../config';

/**
 * request_id 幂等去重（API-1）—— LRU + TTL，无外部依赖。
 *
 * ## 要解决的问题
 * 前端重试会**复用同一个 request_id**（这是 ERR-2 的设计）。如果服务端不去重，
 * 一次「首发 + 2 次重试」就是 3 倍 LLM 调用，报到日峰值下这笔成本很实在。
 *
 * ## 但去重不能做成「一律拒绝重复」
 * 这里有个反直觉的坑：**最需要重试的场景，恰恰是服务端已经跑完了的场景**——
 * 流到一半客户端断网，服务端视角是「正常完成」，客户端视角是「什么都没收到」。
 * 若无脑按 request_id 拒绝，学生就再也拿不到这个回答了，
 * 于是「省成本」变成了「答不出来」，得不偿失。
 *
 * ## 所以按结束方式区分
 * | 上一次的结局 | 再次提交 | 理由 |
 * |---|---|---|
 * | 正在处理中 (`in-flight`) | 拒绝 4009 | 真·并发重复提交，拦掉纯赚 |
 * | 正常完成 (`completed`)   | TTL 内拒绝 4009 | 满足「LLM 只被调用一次」 |
 * | 处理失败 (`failed`)      | 放行 | 上游抖动，理应重试 |
 * | 客户端中断 (`aborted`)   | 放行 | 学生没收到内容，必须给他第二次机会 |
 */

type Outcome = 'completed' | 'failed' | 'aborted';

interface Entry {
  /** true = 仍在处理中 */
  inFlight: boolean;
  /** 结束方式；inFlight 时为 null */
  outcome: Outcome | null;
  /** 最后一次状态变更时间 */
  at: number;
}

const store = new Map<string, Entry>();

export type ClaimResult =
  | { ok: true }
  /** 被拒绝：同一 request_id 正在处理或刚刚正常完成 */
  | { ok: false; reason: 'in-flight' | 'recently-completed' };

/** 惰性清理过期条目 + LRU 容量控制。 */
function sweep(now: number): void {
  const ttl = config.idempotency.ttlMs;
  for (const [k, e] of store) {
    // in-flight 条目也要设兜底过期，否则进程异常时会永久占位（俗称幂等键泄漏）
    const limit = e.inFlight ? Math.max(ttl, 120_000) : ttl;
    if (now - e.at > limit) store.delete(k);
  }

  const max = config.idempotency.maxEntries;
  if (store.size > max) {
    // Map 保持插入顺序，从头删即最旧
    const drop = store.size - max;
    let i = 0;
    for (const k of store.keys()) {
      if (i++ >= drop) break;
      store.delete(k);
    }
  }
}

/**
 * 占用一个 request_id。返回 ok=false 时调用方应回 4009 且**不得调用 LLM**。
 *
 * @param requestId 前端生成的 UUID v4；为空时直接放行（老客户端兼容，不因缺字段而拒服务）
 */
export function claim(requestId: string | null | undefined, now: number = Date.now()): ClaimResult {
  if (!requestId || requestId.trim() === '') return { ok: true };
  const key = requestId.trim();

  sweep(now);

  const prev = store.get(key);
  if (prev) {
    if (prev.inFlight) return { ok: false, reason: 'in-flight' };
    if (prev.outcome === 'completed' && now - prev.at <= config.idempotency.ttlMs) {
      return { ok: false, reason: 'recently-completed' };
    }
    // failed / aborted / 已过期的 completed：允许重新占用
  }

  // 重新插入以刷新 LRU 顺序
  store.delete(key);
  store.set(key, { inFlight: true, outcome: null, at: now });
  return { ok: true };
}

/**
 * 结算一个 request_id。**必须在响应结束时调用**（含异常路径），
 * 否则该 ID 会一直挂在 in-flight，前端重试全被 4009 挡住。
 */
export function settle(
  requestId: string | null | undefined,
  outcome: Outcome,
  now: number = Date.now(),
): void {
  if (!requestId || requestId.trim() === '') return;
  const key = requestId.trim();

  if (outcome === 'failed' || outcome === 'aborted') {
    // 直接删除，让后续重试走全新流程
    store.delete(key);
    return;
  }
  store.set(key, { inFlight: false, outcome, at: now });
}

/** 从请求中提取 request_id：优先 `X-Request-Id` 头，回落到请求体字段。 */
export function extractRequestId(headers: Record<string, unknown>, body: unknown): string | null {
  const h = headers['x-request-id'];
  if (typeof h === 'string' && h.trim() !== '') return h.trim().slice(0, 64);

  if (typeof body === 'object' && body !== null) {
    const v = (body as Record<string, unknown>).request_id;
    if (typeof v === 'string' && v.trim() !== '') return v.trim().slice(0, 64);
  }
  return null;
}

/** 测试用：清空去重表。 */
export function resetIdempotency(): void {
  store.clear();
}

/** 测试/观测用：当前表内条目数。 */
export function idempotencySize(): number {
  return store.size;
}
