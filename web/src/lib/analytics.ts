/**
 * 埋点 SDK（MAINT-1 / Q4）—— 手写，约 2KB，零第三方依赖。
 *
 * ## 为什么不用现成 RUM SDK
 * NG-11 建议「用现成 SDK」，但 Sentry ~25KB / ARMS ~30KB 会吃掉首屏预算的 20%
 * （总预算才 150KB），而 Q4 又要求「零文本、仅性能/状态字段」——
 * 现成 SDK 默认会抓 breadcrumb、DOM 快照、请求体，反而要花力气去关。自研更小也更可控。
 *
 * ## 隐私红线（Q4）
 * `AnalyticsEvent` **在类型层面就不存在** message / content / question / raw 字段。
 * 这不是靠自觉，是靠类型系统：想上报文本，TS 编译期就会红。
 * 运行时再加一道 `sanitize()` 白名单过滤，防止 `as any` 绕过类型检查。
 *
 * ## 副作用边界（架构 §7.1）
 * 本文件是内核层唯一允许碰 `navigator` 的例外，但纯逻辑（采样判定、字段白名单）
 * 都拆成了独立的可测函数，副作用集中在 `flush()` 一处。
 */

import type { AbortReason, ChatPhase } from '../types/chat-state';
import type { ErrorClass } from './errors';
import { RUM_BATCH_SIZE, RUM_ENDPOINT, RUM_SAMPLE_RATE } from './config';
import { newSessionId } from './requestId';

export type AnalyticsEventName =
  | 'page_view'
  | 'web_vital'
  | 'chat_send'
  | 'chat_first_token'
  | 'chat_done'
  | 'chat_abort'
  | 'chat_error'
  | 'chat_retry'
  | 'chat_continue' // B5：续接发起（字段与 chat_send 同构，架构 §2.2 约定 6）
  | 'handoff_shown'
  | 'handoff_click'
  | 'boundary_catch';

/** 字段白名单：只允许性能与状态字段，严禁任何消息文本 (Q4) */
export interface AnalyticsEvent {
  ev: AnalyticsEventName;
  ts: number; // 毫秒时间戳
  sid: string; // 会话 ID（sessionStorage 随机，非用户标识）
  scenario: string; // 场景 id，如 'baodao'
  rid?: string; // request_id (API-1)

  // —— 性能 ——
  ttfb_ms?: number;
  dur_ms?: number;
  token_n?: number;
  metric?: 'FCP' | 'LCP' | 'INP' | 'TTI';
  value?: number;

  // —— 状态 ——
  code?: number; // ErrorCode
  cls?: ErrorClass;
  phase?: ChatPhase;
  abort_reason?: AbortReason;
  retry_n?: number;
  degraded_n?: number;
}
// ⚠️ 结构上不存在 message/content/question 字段 —— 类型层面即杜绝文本外泄

/** 调用方传入的部分事件（ts / sid 由 SDK 补全）。 */
export type TrackInput = Omit<AnalyticsEvent, 'ts' | 'sid'> & { sid?: string };

/** 运行时白名单。与 AnalyticsEvent 的字段一一对应，多一个都不许出去。 */
const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'ev', 'ts', 'sid', 'scenario', 'rid',
  'ttfb_ms', 'dur_ms', 'token_n', 'metric', 'value',
  'code', 'cls', 'phase', 'abort_reason', 'retry_n', 'degraded_n',
]);

/**
 * 白名单过滤（纯函数，可单测）。
 * 第二道防线：即便调用方用 `as any` 塞进了 `{ question: '...' }`，也出不去。
 */
export function sanitize(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v === undefined || v === null) continue;
    // 字符串字段做长度硬截，杜绝有人把长文本塞进 scenario/rid
    out[k] = typeof v === 'string' ? v.slice(0, 64) : v;
  }
  return out;
}

/** 采样判定（纯函数，可单测）。rate<=0 全丢，rate>=1 全留。 */
export function shouldSample(rate: number, rand: () => number = Math.random): boolean {
  if (!Number.isFinite(rate) || rate <= 0) return false;
  if (rate >= 1) return true;
  return rand() < rate;
}

/** 全局静默开关（PRD B2 回滚预案）：`window.__RUM_OFF__ = true` 秒级关停。 */
function isDisabled(): boolean {
  if (typeof globalThis === 'undefined') return true;
  return (globalThis as Record<string, unknown>).__RUM_OFF__ === true;
}

// ---------------------------------------------------------------------------
// 有副作用的部分：队列 + 上报
// ---------------------------------------------------------------------------

let queue: Record<string, unknown>[] = [];
let sessionId = '';
let listenersBound = false;

/** 惰性获取会话 ID：优先 sessionStorage 复用，失败则退化为内存变量。 */
function getSessionId(): string {
  if (sessionId) return sessionId;
  const KEY = 'jlau_rum_sid';
  try {
    const ss = (globalThis as { sessionStorage?: Storage }).sessionStorage;
    if (ss) {
      const cached = ss.getItem(KEY);
      if (cached) {
        sessionId = cached;
        return sessionId;
      }
      sessionId = newSessionId();
      ss.setItem(KEY, sessionId);
      return sessionId;
    }
  } catch {
    // 隐私模式 / 存储被禁用：不是错误，降级为内存态即可，
    // 但绝不能让埋点异常冒泡打断业务链路
  }
  sessionId = newSessionId();
  return sessionId;
}

/** 绑定页面隐藏时的兜底 flush（只绑一次）。 */
function bindLifecycle(): void {
  if (listenersBound) return;
  const doc = (globalThis as { document?: Document }).document;
  if (!doc || typeof doc.addEventListener !== 'function') return;
  listenersBound = true;
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') flush();
  });
}

/**
 * 记录一个事件。永不抛错 —— 埋点失败绝不能影响学生问答。
 */
export function track(input: TrackInput): void {
  if (isDisabled()) return;
  if (!shouldSample(RUM_SAMPLE_RATE)) return;

  try {
    const evt: Record<string, unknown> = sanitize({
      ...input,
      ts: Date.now(),
      sid: input.sid ?? getSessionId(),
    });
    queue.push(evt);
    bindLifecycle();
    if (queue.length >= RUM_BATCH_SIZE) flush();
  } catch {
    // 兜底吞掉：这里是唯一允许静默的 catch，理由见函数注释
  }
}

/**
 * 立即上报并清空队列。
 * 优先 `sendBeacon`（页面卸载时仍可靠）；不可用时退回 keepalive fetch。
 */
export function flush(): void {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];

  const payload = JSON.stringify({ events: batch });

  try {
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    if (nav && typeof nav.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      const okSent = nav.sendBeacon(RUM_ENDPOINT, blob);
      if (okSent) return;
    }
    const f = (globalThis as { fetch?: typeof fetch }).fetch;
    if (typeof f === 'function') {
      void f(RUM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // 上报失败不重投：埋点丢几条无所谓，重投逻辑反而可能在弱网下放大问题
      });
    }
  } catch {
    // 同上：埋点异常一律不外溢
  }
}

/** 测试与调试用：读取当前待发队列。 */
export function peekQueue(): readonly Record<string, unknown>[] {
  return queue;
}

/** 测试用：重置模块内部状态。 */
export function resetAnalytics(): void {
  queue = [];
  sessionId = '';
  listenersBound = false;
}
