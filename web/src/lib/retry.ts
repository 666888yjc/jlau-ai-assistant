/**
 * 重试决策（ERR-2）—— 纯函数，零副作用，不含任何 setTimeout。
 *
 * ## 修的是什么
 * 原实现 `api.ts:52-77` 有三个问题：
 *  1. `for (attempt = 0; attempt <= 2; attempt++)` 对**任何** `!res.ok` 都重试，
 *     包括 400/404 这类必然再失败的请求 —— 白白让用户多等 1.8 秒才看到错误；
 *  2. 429 也照样立即重试，等于在服务端已经喊「太快了」的时候继续加压；
 *  3. 线性退避 600/1200ms 且无抖动，报到日几千人同时重试会形成同步尖峰。
 *
 * ## 新策略
 *  - 4xx（429 除外）**永不重试**；
 *  - 429 遵循 `Retry-After`，缺失则以 5s 为基准指数退避；
 *  - 仅网络错误与 5xx 重试，最多 2 次；
 *  - 指数退避 + 抖动，并设 30s 硬上限。
 *
 * 所有随机性通过 `rand` 参数注入，因此退避值在单测里完全可确定 —— 这是把
 * 「退避策略」和「等待动作」分开的主要理由。等待由调用方 (T04) 负责。
 */

import {
  MAX_RETRY,
  RETRY_BASE_429_MS,
  RETRY_BASE_MS,
  RETRY_JITTER_MS,
  RETRY_MAX_BACKOFF_MS,
} from './config';

/**
 * 是否应该再试一次。
 *
 * @param status   HTTP 状态码；`undefined` 表示请求根本没拿到响应（网络错误 / fetch reject）
 * @param attempt  **已完成**的尝试次数。首次失败后调用时传 0，第二次失败传 1，以此类推
 * @param offline  调用方探测到的离线状态（navigator.onLine === false）
 * @returns        true = 值得再试
 */
export function shouldRetry(status: number | undefined, attempt: number, offline = false): boolean {
  // 次数耗尽：无条件停手
  if (attempt >= MAX_RETRY) return false;

  // 没有响应 = 网络层失败（含离线）。连接可能在退避窗口内恢复，值得再试。
  if (status === undefined) return true;
  if (offline) return true;

  // 429：可重试，但必须配合 backoffMs 给出的长退避，否则等于没限流
  if (status === 429) return true;

  // 其余 4xx：请求本身有问题，重发一百次也是同样结果
  if (status >= 400 && status < 500) return false;

  // 5xx：上游抖动，值得重试
  if (status >= 500) return true;

  // 2xx/3xx 不该走到重试路径
  return false;
}

/**
 * 计算下一次重试前应等待的毫秒数。
 *
 * @param attempt        已完成的尝试次数（0 = 第一次退避）
 * @param retryAfterSec  服务端 `Retry-After` 解析出的秒数，缺失传 undefined
 * @param status         HTTP 状态码，用于选择退避基数（429 用 5s，其余用 800ms）
 * @param rand           随机源，默认 Math.random；单测注入固定值以断言精确结果
 */
export function backoffMs(
  attempt: number,
  retryAfterSec?: number,
  status?: number,
  rand: () => number = Math.random,
): number {
  const jitter = Math.floor(rand() * RETRY_JITTER_MS);
  const safeAttempt = Math.max(0, Math.floor(attempt));

  // 服务端明确给了 Retry-After：以它为准。
  // 仍叠加抖动 —— 5000 名新生收到同一个 "Retry-After: 5" 会在同一毫秒一起回来，
  // 抖动是这里唯一能防止二次雪崩的手段。
  if (retryAfterSec !== undefined && Number.isFinite(retryAfterSec) && retryAfterSec >= 0) {
    return Math.min(Math.round(retryAfterSec * 1000) + jitter, RETRY_MAX_BACKOFF_MS);
  }

  const base = status === 429 ? RETRY_BASE_429_MS : RETRY_BASE_MS;
  const exp = base * Math.pow(2, safeAttempt);
  return Math.min(exp + jitter, RETRY_MAX_BACKOFF_MS);
}

/**
 * 解析 `Retry-After` 响应头。规范允许两种形式：
 *   - delta-seconds：`Retry-After: 120`
 *   - HTTP-date：   `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT`
 *
 * @param headerValue 原始头部值，缺失传 null
 * @param nowMs       当前时间戳，用于计算 HTTP-date 形式的差值（显式传入以保持纯函数）
 * @returns           秒数；无法解析或为负则返回 undefined
 */
export function parseRetryAfter(
  headerValue: string | null | undefined,
  nowMs: number,
): number | undefined {
  if (headerValue === null || headerValue === undefined) return undefined;
  const raw = headerValue.trim();
  if (raw === '') return undefined;

  // delta-seconds。
  // 带符号的纯数字要在这里就地否决：`Date.parse('-5')` 会把它当成公元前 5 年解析成功，
  // 于是非法值悄悄退化成 0 秒 —— 等于「立刻重试」，在限流场景下是最坏的结果。
  if (/^[+-]?\d+$/.test(raw)) {
    return /^\d+$/.test(raw) ? Number(raw) : undefined;
  }

  // HTTP-date
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return undefined;
  const deltaSec = Math.ceil((t - nowMs) / 1000);
  return deltaSec > 0 ? deltaSec : 0;
}

/** 供 UI 展示用：本轮还剩几次自动重试机会。 */
export function remainingRetries(attempt: number): number {
  return Math.max(0, MAX_RETRY - Math.max(0, Math.floor(attempt)));
}
