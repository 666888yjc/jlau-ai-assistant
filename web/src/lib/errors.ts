/**
 * 前端统一错误枚举与六类分级映射（MAINT-3 / UX-3）—— 纯函数，零副作用。
 *
 * ## 两条硬规则
 * 1. **4xxx/5xxx 码值必须与 `server/src/errors.ts` 逐一对齐**，新增码值两边同时加。
 *    前后端各写一套错误码是这类项目最经典的腐化起点。
 * 2. **任何面向用户的错误文案都必须从 `classifyError()` 拿**，
 *    禁止在组件里写错误字面量（MAINT-3 验收标准：grep 无字面量散落）。
 *    尤其禁用旧文案「网络开小差」（PRD §7.3 明令）—— 它把断网、超时、限流、
 *    参数错误四种完全不同的处境混成一句废话，用户既不知道发生了什么，也不知道该做什么。
 *
 * 本文件禁止 import react / 碰 window。
 */

import type { AbortReason } from '../types/chat-state';

export const ErrorCode = {
  // —— 1xxx 前端传输层（本次新增）——
  NETWORK_OFFLINE: 1001, // 断网 / fetch 直接 reject
  TTFB_TIMEOUT: 1002, // 首 token 超时 15s
  IDLE_TIMEOUT: 1003, // 流中空闲 30s
  STREAM_BROKEN: 1004, // 流中途断裂
  PARSE_DEGRADED: 1005, // SSE 帧解析失败（内容可能不完整）
  USER_ABORTED: 1006, // 用户主动停止（非错误，不展示错误卡）

  // —— 4xxx/5xxx 服务端，对齐 server/src/errors.ts ——
  INVALID_REQUEST: 4001,
  SCENARIO_NOT_FOUND: 4002,
  INVALID_FEEDBACK_TYPE: 4003,
  /** A-2：快照超限（question>2000 / answer>20000） */
  SNAPSHOT_TOO_LONG: 4004,
  DUPLICATE_REQUEST: 4009, // 新增：幂等键重复
  TICKET_INVALID: 4010, // 新增：票据无效/过期
  ADMIN_DISABLED: 4011, // 新增：管理后台未启用（HTTP 503）
  ADMIN_UNAUTHORIZED: 4012, // 新增：未登录 / 管理员令牌无效或过期
  ADMIN_PASSWORD_WRONG: 4013, // 新增：密码错误
  RATE_LIMITED: 4290,
  UPSTREAM_UNAVAILABLE: 5001,
  INTERNAL_ERROR: 5002,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** UX-3 六类分级 */
export type ErrorClass =
  | 'offline' // 网络不可用
  | 'timeout' // 回答超时可重试（TTFB/IDLE 合并展示）
  | 'server' // 服务繁忙请稍候（5xx）
  | 'rate-limited' // 请求过快（429，带倒计时）
  | 'client' // 请求有误（4xx，不可重试）
  | 'degraded'; // 内容可能不完整，请重新提问

export interface ClassifiedError {
  code: number;
  cls: ErrorClass;
  /** 面向用户文案。禁用「网络开小差」(PRD §7.3) */
  title: string;
  /** 主按钮：重试 / 换个问法 / 转人工 / 无 */
  action: 'retry' | 'rephrase' | 'handoff' | 'none';
  /** 429 专用，秒。用于倒计时 */
  retryAfterSec?: number;
  /** 是否允许自动重试 (ERR-2) */
  retryable: boolean;
}

export interface ClassifyInput {
  httpStatus?: number;
  code?: number;
  abortReason?: AbortReason | null;
  offline?: boolean;
  retryAfterSec?: number;
}

/** 六类文案表（PRD §7.3 指定）。rate-limited 的 {n} 由 classifyError 填充。 */
const TITLES: Record<ErrorClass, string> = {
  offline: '网络不可用，请检查连接后重试',
  timeout: '回答超时了，可以重试一次',
  server: '服务繁忙，请稍候再试',
  'rate-limited': '提问太快啦，{n} 秒后可继续',
  client: '这个问题我没法处理，换个问法试试',
  degraded: '内容可能不完整，建议重新提问',
};

function make(
  code: number,
  cls: ErrorClass,
  action: ClassifiedError['action'],
  retryable: boolean,
  retryAfterSec?: number,
): ClassifiedError {
  const title =
    cls === 'rate-limited'
      ? TITLES[cls].replace('{n}', String(Math.max(1, Math.ceil(retryAfterSec ?? 5))))
      : TITLES[cls];
  const out: ClassifiedError = { code, cls, title, action, retryable };
  if (retryAfterSec !== undefined) out.retryAfterSec = retryAfterSec;
  return out;
}

/**
 * 唯一分类入口。三处引用同枚举，禁止字面量散落（MAINT-3 验收标准）。
 *
 * 判定优先级（从强到弱）：
 *   中止原因 > 离线 > HTTP 状态码 > 业务错误码 > 兜底
 * 中止原因排第一，是因为它代表「我们主动掐断了连接」，此时 httpStatus 往往是
 * 上一次尝试的残留值，先看它才不会把用户点停止误报成服务器错误。
 */
export function classifyError(input: ClassifyInput): ClassifiedError {
  const { httpStatus, code, abortReason, offline, retryAfterSec } = input;

  // —— ① 中止原因 ——
  if (abortReason) {
    switch (abortReason) {
      case 'user':
        // 非错误。保留 action:'none' 且由 shouldRenderErrorCard() 过滤掉卡片，
        // 这样调用方即便误传也不会给用户弹一张莫名其妙的红卡。
        return { code: ErrorCode.USER_ABORTED, cls: 'client', title: '已停止生成', action: 'none', retryable: false };
      case 'ttfb-timeout':
        return make(ErrorCode.TTFB_TIMEOUT, 'timeout', 'retry', true);
      case 'idle-timeout':
        return make(ErrorCode.IDLE_TIMEOUT, 'timeout', 'retry', true);
      case 'unmount':
      case 'scenario-change':
        // 生命周期中止，静默处理，不应走到 UI
        return { code: ErrorCode.USER_ABORTED, cls: 'client', title: '', action: 'none', retryable: false };
    }
  }

  // —— ② 离线 ——
  if (offline) return make(ErrorCode.NETWORK_OFFLINE, 'offline', 'retry', true);

  // —— ③ 前端传输层错误码 ——
  if (code === ErrorCode.PARSE_DEGRADED) {
    return make(ErrorCode.PARSE_DEGRADED, 'degraded', 'rephrase', false);
  }
  if (code === ErrorCode.STREAM_BROKEN) {
    // 归到 timeout：对用户而言「答到一半断了」和「超时」的处置动作完全相同（重试一次），
    // 强行为它单开一类只会让六类分级变七类，违背 UX-3 的收敛初衷。
    return make(ErrorCode.STREAM_BROKEN, 'timeout', 'retry', true);
  }
  if (code === ErrorCode.NETWORK_OFFLINE) {
    return make(ErrorCode.NETWORK_OFFLINE, 'offline', 'retry', true);
  }
  if (code === ErrorCode.USER_ABORTED) {
    return { code: ErrorCode.USER_ABORTED, cls: 'client', title: '已停止生成', action: 'none', retryable: false };
  }

  // —— ④ 限流（HTTP 429 或业务码 4290）——
  if (httpStatus === 429 || code === ErrorCode.RATE_LIMITED) {
    return make(ErrorCode.RATE_LIMITED, 'rate-limited', 'retry', true, retryAfterSec ?? 5);
  }

  // —— ⑤ 票据失效：可自动恢复（重新领票再发），故 retryable=true ——
  if (code === ErrorCode.TICKET_INVALID || httpStatus === 401) {
    return make(ErrorCode.TICKET_INVALID, 'client', 'retry', true);
  }

  // —— ⑥ 幂等重复：上一次请求已在处理，重复提交不是用户的错，也不该再重试 ——
  if (code === ErrorCode.DUPLICATE_REQUEST) {
    return { code: ErrorCode.DUPLICATE_REQUEST, cls: 'client', title: '这条正在处理中，请稍候', action: 'none', retryable: false };
  }

  // —— ⑦ 其余 4xx：一律不可重试（ERR-2 核心改动）——
  if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) {
    return make(code ?? ErrorCode.INVALID_REQUEST, 'client', 'rephrase', false);
  }
  if (code !== undefined && code >= 4000 && code < 5000) {
    return make(code, 'client', 'rephrase', false);
  }

  // —— ⑧ 5xx：可重试 ——
  if (httpStatus !== undefined && httpStatus >= 500) {
    const c =
      httpStatus === 502 || httpStatus === 503 || httpStatus === 504
        ? ErrorCode.UPSTREAM_UNAVAILABLE
        : ErrorCode.INTERNAL_ERROR;
    return make(code ?? c, 'server', 'retry', true);
  }
  if (code !== undefined && code >= 5000) {
    return make(code, 'server', 'retry', true);
  }

  // —— ⑨ 兜底：未知异常按服务端问题处理（给重试按钮，好过给死路）——
  return make(ErrorCode.INTERNAL_ERROR, 'server', 'retry', true);
}

/**
 * 是否需要给用户渲染错误卡。
 * 用户主动停止、生命周期中止属于「预期内的中止」，弹卡片反而是打扰。
 */
export function shouldRenderErrorCard(err: ClassifiedError): boolean {
  return err.code !== ErrorCode.USER_ABORTED && err.title !== '';
}

/**
 * 连续失败是否应升级到人工兜底（UX-4）。
 * 只有「终态失败」才计数：用户主动停止不算失败，否则学生连点两次停止就被推去转人工。
 */
export function isTerminalFailure(err: ClassifiedError): boolean {
  return err.code !== ErrorCode.USER_ABORTED;
}
