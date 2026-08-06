import { Response } from 'express';

/** openapi.yaml 错误码（code 字段，0=成功）。 */
export const ErrorCode = {
  SUCCESS: 0,
  INVALID_REQUEST: 4001,
  SCENARIO_NOT_FOUND: 4002,
  INVALID_FEEDBACK_TYPE: 4003,
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
  if (code === ErrorCode.RATE_LIMITED) return 429;
  return 500;
}

/** 统一错误响应（仅当响应头未发送时可用，SSE 流内不可调用）。 */
export function sendError(res: Response, code: number, message: string, data: unknown = null): void {
  if (res.headersSent) return;
  const status = httpStatusFor(code);
  res.status(status).json({ code, data, message });
}
