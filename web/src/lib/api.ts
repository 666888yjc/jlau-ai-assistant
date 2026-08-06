import type {
  ApiResponse,
  ChatRequest,
  FeatureItem,
  FeedbackRequest,
  HumanHandoffRequest,
  ScenarioItem,
  SSEEvent,
} from '../types/api';
import { createParser, feed, finish } from './sse';
import { backoffMs, parseRetryAfter, shouldRetry } from './retry';
import { classifyError, ErrorCode, type ClassifiedError } from './errors';
import { newRequestId } from './requestId';
import { MAX_RETRY } from './config';

/**
 * API 客户端（T04 重写）。
 *
 * 相比旧实现（ERR-2 / ERR-3 / API-1 / API-2）：
 *  - SSE 解析交给 `sse.ts`（兼容 CRLF、畸形帧计数上报而非静默丢弃）；
 *  - 重试决策交给 `retry.ts`（4xx 不重试、429 遵循 Retry-After、5xx/网络错误最多 2 次、
 *    指数退避 + 抖动、可被 AbortSignal 中断 —— 用户点停止时无需等完退避）；
 *  - 每轮携带 `request_id`（首发与重试复用同一个，服务端幂等去重）；
 *  - 失败统一抛 `AppError`（携带 `ClassifiedError`），由调用方消费；
 *  - 自动领取匿名票据（SEC-1 前端侧）：灰度期失败也继续（服务器默认不拦截）。
 *
 * 本文件是副作用编排层，允许碰 fetch / navigator / window ——
 * 纯决策逻辑在 sse/retry/errors 里保持零副作用可单测（架构 §7.1）。
 */

const BASE = '/api/v1';

/** 携带分类信息的统一错误。调用方（useChatStream）据此驱动 UI，不再散落错误字面量。 */
export class AppError extends Error {
  readonly classified: ClassifiedError;
  readonly httpStatus?: number;

  constructor(classified: ClassifiedError, opts?: { httpStatus?: number }) {
    super(classified.title);
    this.name = 'AppError';
    this.classified = classified;
    this.httpStatus = opts?.httpStatus;
  }
}

async function jsonPost<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ApiResponse<T>;
}

export async function postFeedback(req: FeedbackRequest): Promise<ApiResponse<unknown>> {
  return jsonPost('/feedback', req);
}

export async function postHumanHandoff(
  req: HumanHandoffRequest,
): Promise<ApiResponse<{ id: string; scenario_id: string; status: string }>> {
  return jsonPost('/human-handoff', req);
}

export async function getScenarios(): Promise<ApiResponse<ScenarioItem[]>> {
  const res = await fetch(BASE + '/scenarios');
  return (await res.json()) as ApiResponse<ScenarioItem[]>;
}

export async function getFeatures(
  scenarioId?: string,
): Promise<ApiResponse<FeatureItem[]>> {
  const qs = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : '';
  const res = await fetch(BASE + '/features' + qs);
  return (await res.json()) as ApiResponse<FeatureItem[]>;
}

// ---------------------------------------------------------------------------
// 匿名票据（SEC-1 前端侧）
// ---------------------------------------------------------------------------

interface CachedTicket {
  ticket: string;
  expiresAt: number;
}

let cachedTicket: CachedTicket | null = null;
let ticketFetching: Promise<string | null> | null = null;

/**
 * 领取匿名票据（POST /api/v1/ticket，匿名可调）。
 * 领取失败返回 null（灰度期服务端不拦截，不带票据也能走通）。
 * 票据在过期前 30s 自动续领；并发只发起一次请求。
 */
async function ensureTicket(): Promise<string | null> {
  const now = Date.now();
  if (cachedTicket && cachedTicket.expiresAt - now > 30_000) return cachedTicket.ticket;

  if (!ticketFetching) {
    ticketFetching = (async () => {
      try {
        const res = await fetch(BASE + '/ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) return null;
        const j = (await res.json()) as { data?: { ticket?: string; expires_at?: number } };
        const t = j.data?.ticket;
        if (t) {
          cachedTicket = {
            ticket: t,
            expiresAt: j.data?.expires_at ?? Date.now() + 30 * 60_000,
          };
          return t;
        }
        return null;
      } catch {
        // 票据拿不到不阻断问答：AUTH_ENFORCE=0 时服务器本来就不拦
        return null;
      }
    })().finally(() => {
      ticketFetching = null;
    });
  }
  return ticketFetching;
}

// ---------------------------------------------------------------------------
// 可中断的退避等待
// ---------------------------------------------------------------------------

function isAbortError(e: unknown): boolean {
  if (typeof DOMException !== 'undefined' && e instanceof DOMException) return e.name === 'AbortError';
  return (e as { name?: string } | null)?.name === 'AbortError';
}

/**
 * 等待 ms 毫秒；若期间 signal 被 abort，立即以 AbortError 拒绝。
 * 这是「点停止 300ms 内停」的兜底：即便 api 正处在重试退避的 setTimeout 里，
 * abort 也能立刻打断，而不是等完整个退避才把错误抛给 hook。
 */
function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// ---------------------------------------------------------------------------
// 流式对话（API-1/2 · ERR-2/3）
// ---------------------------------------------------------------------------

export interface StreamChatCallbacks {
  /** 每个解析成功的事件 */
  onEvent: (ev: SSEEvent) => void;
  /** SSE 解析失败帧（内容可能不完整）。调用方据此计数 + 上报，绝不静默（ERR-3） */
  onDegraded?: (count: number) => void;
  /** 每次自动重试前回调（attempt 从 0 起） */
  onRetry?: (attempt: number, status: number | undefined, backoffMs: number) => void;
}

/**
 * 流式对话（保留 signal 既有签名与传参，API-3 已对）。
 *
 * 重试策略（与 retry.ts 一致）：
 *  - 4xx（429 除外）永不重试；
 *  - 429 遵循 Retry-After，缺失则以 5s 为基准指数退避；
 *  - 仅网络错误与 5xx 重试，最多 2 次；
 *  - 流已经开始吐 token 后中途断裂（STREAM_BROKEN）**不自动重试**：
 *    已生成的内容是学生能看到的事实，重发会造成重复，且服务端幂等可能已把
 *    这个 request_id 记为完成 → 重试会撞上 4009。交给 UI 让用户决定。
 */
export async function streamChat(
  req: ChatRequest,
  cb: StreamChatCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const { onEvent, onDegraded, onRetry } = cb;

  const requestId = req.request_id || newRequestId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
  };
  const ticket = await ensureTicket();
  if (ticket) headers['X-Ticket'] = ticket;

  // request_id 只进请求体与头，不进 history；服务端校验时忽略未知字段
  const body = JSON.stringify({ ...req, request_id: requestId });

  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let status: number | undefined;
    let receivedAny = false;

    try {
      const res = await fetch(BASE + '/chat', {
        method: 'POST',
        headers,
        body,
        signal,
      });
      status = res.status;

      // —— 非 2xx：按策略决定是否重试 ——
      if (!res.ok || !res.body) {
        const retryAfterSec = parseRetryAfter(res.headers.get('Retry-After'), Date.now());
        if (!shouldRetry(status, attempt, !isOnline())) {
          throw new AppError(classifyError({ httpStatus: status, retryAfterSec }), { httpStatus: status });
        }
        const waitMs = backoffMs(attempt, retryAfterSec, status);
        onRetry?.(attempt, status, waitMs);
        await sleepAbortable(waitMs, signal);
        attempt += 1;
        continue;
      }

      // —— 2xx：消费 SSE 流 ——
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = createParser();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const r = feed(parser, chunk);
          if (r.events.length > 0) receivedAny = true;
          for (const ev of r.events) onEvent(ev);
          if (r.degradedCount > 0) onDegraded?.(r.degradedCount);
        }
        const tail = finish(parser);
        if (tail.events.length > 0) receivedAny = true;
        for (const ev of tail.events) onEvent(ev);
        if (tail.degradedCount > 0) onDegraded?.(tail.degradedCount);
      } finally {
        reader.releaseLock();
      }

      return; // 完整消费成功
    } catch (e) {
      // 用户/超时主动中止：原样上抛，由 hook 读 abortReason 分流
      if (signal?.aborted) throw e;
      if (isAbortError(e)) throw e;

      // 流中途断裂：已吐过内容，不自动重试（理由见函数注释）
      if (receivedAny) {
        throw new AppError(classifyError({ code: ErrorCode.STREAM_BROKEN }), { httpStatus: status });
      }

      // 网络层失败 / 上游 5xx：按策略重试
      if (shouldRetry(status, attempt, !isOnline()) && attempt < MAX_RETRY) {
        const waitMs = backoffMs(attempt, undefined, status);
        onRetry?.(attempt, status, waitMs);
        await sleepAbortable(waitMs, signal);
        attempt += 1;
        continue;
      }

      // 重试耗尽：分类上抛
      if (status !== undefined) {
        throw new AppError(classifyError({ httpStatus: status }), { httpStatus: status });
      }
      if (!isOnline()) {
        throw new AppError(classifyError({ offline: true }));
      }
      throw new AppError(classifyError({ code: ErrorCode.STREAM_BROKEN }));
    }
  }
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}
