import { Response } from 'express';

/**
 * openapi.yaml 错误码（code 字段，0=成功）。
 *
 * ⚠️ 4xxx/5xxx 码值与 `web/src/lib/errors.ts` **逐一对齐**，新增码值必须两边同时加
 * （架构 §7.2）。前端 `errors.test.ts` 有一组断言专门锁死这几个数字，
 * 单边改动会让前端单测立刻变红。
 */
export const ErrorCode = {
  SUCCESS: 0,
  INVALID_REQUEST: 4001,
  SCENARIO_NOT_FOUND: 4002,
  INVALID_FEEDBACK_TYPE: 4003,
  /** 幂等键重复：同一 request_id 正在处理或刚处理完（API-1） */
  DUPLICATE_REQUEST: 4009,
  /** 票据无效 / 过期（SEC-1） */
  TICKET_INVALID: 4010,
  RATE_LIMITED: 4290,
  UPSTREAM_UNAVAILABLE: 5001,
  INTERNAL_ERROR: 5002,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export class ApiError extends Error {
  constructor(public code: ErrorCodeValue, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 错误码 -> HTTP 状态码。 */
export function httpStatusFor(code: number): number {
  if (code === ErrorCode.INVALID_REQUEST || code === ErrorCode.SCENARIO_NOT_FOUND || code === ErrorCode.INVALID_FEEDBACK_TYPE) {
    return 400;
  }
  if (code === ErrorCode.TICKET_INVALID) return 401;
  if (code === ErrorCode.DUPLICATE_REQUEST) return 409;
  if (code === ErrorCode.RATE_LIMITED) return 429;
  return 500;
}

/** sendError 的可选项。 */
export interface SendErrorOptions {
  /**
   * 429 专用：`Retry-After` 响应头的秒数。
   *
   * 这个头之前完全没有下发，直接卡住了前端 ERR-2（重试退避）与 UX-3（倒计时文案）——
   * 前端只能瞎猜等多久。补上之后前端才能「按服务端说的等」，而不是自己拍一个数。
   */
  retryAfterSec?: number;
}

/** 统一错误响应（仅当响应头未发送时可用，SSE 流内不可调用）。 */
export function sendError(
  res: Response,
  code: number,
  message: string,
  data: unknown = null,
  options: SendErrorOptions = {},
): void {
  if (res.headersSent) return;
  const status = httpStatusFor(code);

  const { retryAfterSec } = options;
  if (retryAfterSec !== undefined && Number.isFinite(retryAfterSec) && retryAfterSec >= 0) {
    // RFC 9110：delta-seconds 形式，必须是非负整数
    res.setHeader('Retry-After', String(Math.max(0, Math.ceil(retryAfterSec))));
  }

  res.status(status).json({ code, data, message });
}
