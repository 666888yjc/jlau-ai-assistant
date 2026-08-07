import { createHash, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { ErrorCode, sendError } from '../errors';
import { extractAdminToken, issueAdminSession, verifyAdminSession } from '../middleware/auth';
import { clientKey } from '../middleware/rateLimit';
import { reloadKb } from '../kb/retrieve';
import { getStore } from '../store';
import type { FeedbackType } from '../types';
import { ok } from '../utils/response';

/**
 * 反馈管理后台端点（方案 A，A-1~A-4）。
 *
 * ## 鉴权模型（架构 §2.3.2 / §9 D1-D3）
 *  - `adminEnabled()` **运行时读取 `process.env.ADMIN_PASSWORD`**（非 config 单例缓存）：
 *    门禁正确性依赖「当前是否配置」这一事实，运行时读取最稳；且单测可直接
 *    set/delete 环境变量，无需 vi.resetModules 重建 config 单例。
 *  - 503 门禁两个判定点：loginHandler 入口 + requireAdmin 入口（先于令牌校验）。
 *    未配置 ADMIN_PASSWORD → 登录接口与数据接口一律 503 code 4011，
 *    **不存在空密码放行路径**（AC-A4.1）。
 *  - 登录失败计数用**独立 in-memory 计数器**（非令牌桶，架构 §2.1 C4 / §9 D3）：
 *    令牌桶会把「正确密码的第 6 次请求」也当限流拒掉，与 PRD「失败 ≥5 次才锁」语义不符。
 *    窗口 15min、阈值 5；第 1-5 次失败均返 401 code 4013，≥5 次后 429 code 4290
 *    （即使密码正确也拒，标准锁定语义）；窗口过期自动解锁。
 *  - 401/403/503 响应体不含任何反馈业务数据（AC-A4.5）。
 */

/** 运行时门禁：是否配置了 ADMIN_PASSWORD（D1：非 config 缓存）。 */
export function adminEnabled(): boolean {
  return typeof process.env.ADMIN_PASSWORD === 'string' && process.env.ADMIN_PASSWORD.trim() !== '';
}

// ---------------------------------------------------------------------------
// 登录失败计数器（in-memory 单实例态；多实例每实例独立，与 rateLimit.ts 同款取舍）
// ---------------------------------------------------------------------------

interface LoginFailState {
  count: number;
  windowStart: number;
}

const loginFails = new Map<string, LoginFailState>();

/** 窗口内失败次数是否达到锁定阈值。 */
function isLoginLocked(ip: string, now: number): { locked: boolean; retryAfterSec: number } {
  const st = loginFails.get(ip);
  if (!st) return { locked: false, retryAfterSec: 0 };
  if (now - st.windowStart >= config.admin.loginFailWindowMs) {
    // 窗口自然过期 → 自动解锁
    loginFails.delete(ip);
    return { locked: false, retryAfterSec: 0 };
  }
  if (st.count >= config.admin.loginFailMax) {
    const remainMs = st.windowStart + config.admin.loginFailWindowMs - now;
    return { locked: true, retryAfterSec: Math.max(1, Math.ceil(remainMs / 1000)) };
  }
  return { locked: false, retryAfterSec: 0 };
}

function recordLoginFail(ip: string, now: number): void {
  const st = loginFails.get(ip);
  if (!st || now - st.windowStart >= config.admin.loginFailWindowMs) {
    loginFails.set(ip, { count: 1, windowStart: now });
    return;
  }
  st.count += 1;
}

function clearLoginFails(ip: string): void {
  loginFails.delete(ip);
}

/** 测试用：清空登录失败计数。 */
export function resetAdminLoginFails(): void {
  loginFails.clear();
}

// ---------------------------------------------------------------------------
// 密码比对：sha256 摘要后 timingSafeEqual（避免长度侧信道与不等长异常）
// ---------------------------------------------------------------------------

function sha256Hex(s: string): Buffer {
  return createHash('sha256').update(s, 'utf-8').digest();
}

function passwordMatches(provided: string, expected: string): boolean {
  const a = sha256Hex(provided);
  const b = sha256Hex(expected);
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// requireAdmin 局部中间件（仅 admin 路由使用，不扩散到全局）
// ---------------------------------------------------------------------------

/** 校验点 2（先于令牌校验）：未配置 → 503；令牌无效/过期 → 401。 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!adminEnabled()) {
    sendError(res, ErrorCode.ADMIN_DISABLED, '管理后台未启用');
    return;
  }
  const token = extractAdminToken(req);
  const v = verifyAdminSession(token);
  if (!v.ok) {
    sendError(res, ErrorCode.ADMIN_UNAUTHORIZED, '登录已失效，请重新登录');
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// 端点
// ---------------------------------------------------------------------------

/** POST /api/v1/admin/login —— 校验密码，签发会话令牌（匿名可调，自身限流）。 */
export async function adminLoginHandler(req: Request, res: Response): Promise<void> {
  // 判定点 1：未配置 ADMIN_PASSWORD → 503，不校验密码（AC-A4.1）
  if (!adminEnabled()) {
    sendError(res, ErrorCode.ADMIN_DISABLED, '管理后台未启用');
    return;
  }

  const ip = clientKey(req);
  const now = Date.now();

  const lock = isLoginLocked(ip, now);
  if (lock.locked) {
    sendError(
      res,
      ErrorCode.RATE_LIMITED,
      '尝试次数过多，请稍后再试',
      null,
      { retryAfterSec: lock.retryAfterSec },
    );
    return;
  }

  const body = (req.body ?? {}) as { password?: unknown };
  const provided = typeof body.password === 'string' ? body.password : '';
  const expected = process.env.ADMIN_PASSWORD ?? '';

  if (!passwordMatches(provided, expected)) {
    recordLoginFail(ip, now);
    sendError(res, ErrorCode.ADMIN_PASSWORD_WRONG, '密码错误');
    return;
  }

  clearLoginFails(ip);
  const { ticket, expiresAt } = issueAdminSession(now);
  ok(res, { token: ticket, expires_at: expiresAt });
}

/** POST /api/v1/admin/logout —— 轻量对称端点（D5：不做全局黑名单，靠 TTL）。 */
export function adminLogoutHandler(_req: Request, res: Response): void {
  ok(res, { ok: true });
}

/**
 * GET /api/v1/admin/feedback —— 反馈列表（A-1/A-5/A-6/A-7）。
 * 查询参数：type / scenario_id / q（note 模糊）/ page / pageSize。
 */
export async function adminFeedbackListHandler(req: Request, res: Response): Promise<void> {
  const type = parseFeedbackType(req.query.type);
  if (req.query.type !== undefined && type === undefined) {
    sendError(res, ErrorCode.INVALID_REQUEST, 'type 仅支持 helpful / reported');
    return;
  }
  const scenarioId = typeof req.query.scenario_id === 'string' && req.query.scenario_id.trim() !== ''
    ? req.query.scenario_id.trim()
    : undefined;
  const q = typeof req.query.q === 'string' && req.query.q.trim() !== '' ? req.query.q.trim() : undefined;
  const page = parsePositiveInt(req.query.page, 1);
  const pageSize = parsePositiveInt(req.query.pageSize, 20);

  const store = await getStore();
  const result = await store.listFeedback({ type, scenario_id: scenarioId, q, page, pageSize });
  ok(res, result);
}

/** POST /api/v1/admin/kb/refresh —— 清 KB 缓存并强制重读（A-3）。 */
export function adminKbRefreshHandler(_req: Request, res: Response): void {
  const r = reloadKb();
  if (!r.ok) {
    sendError(res, ErrorCode.INTERNAL_ERROR, '知识库刷新失败：' + r.error);
    return;
  }
  ok(res, { cleared: true, doc_count: r.docCount });
}

// ---------------------------------------------------------------------------
// 私有工具
// ---------------------------------------------------------------------------

function parseFeedbackType(v: unknown): FeedbackType | undefined {
  if (v === undefined) return undefined;
  return v === 'helpful' || v === 'reported' ? v : undefined;
}

function parsePositiveInt(v: unknown, fallback: number): number {
  if (typeof v !== 'string' || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}
