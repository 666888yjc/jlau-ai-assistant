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
  /** A-2：快照超限（question>2000 / answer>20000） */
  SNAPSHOT_TOO_LONG: 4004,
  /** 幂等键重复：同一 request_id 正在处理或刚处理完（API-1） */
  DUPLICATE_REQUEST: 4009,
  /** 票据无效 / 过期（SEC-1） */
  TICKET_INVALID: 4010,
  /** A-4：管理后台未启用（未配置 ADMIN_PASSWORD）——故意放 4xxx 而非 5xxx，见 httpStatusFor 注 */
  ADMIN_DISABLED: 4011,
  /** A-4：未登录 / 管理员令牌无效或过期 */
  ADMIN_UNAUTHORIZED: 4012,
  /** A-4：密码错误 */
  ADMIN_PASSWORD_WRONG: 4013,
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
  if (
    code === ErrorCode.INVALID_REQUEST ||
    code === ErrorCode.SCENARIO_NOT_FOUND ||
    code === ErrorCode.INVALID_FEEDBACK_TYPE ||
    code === ErrorCode.SNAPSHOT_TOO_LONG
  ) {
    return 400;
  }
  if (code === ErrorCode.TICKET_INVALID || code === ErrorCode.ADMIN_UNAUTHORIZED || code === ErrorCode.ADMIN_PASSWORD_WRONG) {
    return 401;
  }
  if (code === ErrorCode.DUPLICATE_REQUEST) return 409;
  if (code === ErrorCode.RATE_LIMITED) return 429;
  /**
   * ADMIN_DISABLED 故意映射 HTTP 503 而非 4xx（架构 §2.3.3 / §9 D6）：
   * 语义是「服务当前不可用（后台未启用）」，且前端 classifyError 对 5xxx 的默认
   * 行为是「可重试」——但管理页有专属文案映射（lib/admin.ts），不依赖 classifyError，
   * 因此不会误导。放 4xxx 码值则让任何「按码段统计」的监控都不会把未启用误算成上游故障。
   */
  if (code === ErrorCode.ADMIN_DISABLED) return 503;
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
