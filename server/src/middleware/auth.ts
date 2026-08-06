import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { config } from '../config';

/**
 * 匿名 HMAC 票据（SEC-1 / Q2）。
 *
 * ## 目标与非目标
 * 目标：让 `curl` 直接打 `/api/v1/chat` 刷 LLM 成本这件事不再零成本。
 * **非目标：识别用户身份。** 票据是完全匿名的，不含任何学号/姓名/设备指纹，
 * 只是一张「你确实先访问过页面」的短期凭证。这是 Q4 隐私要求下唯一合适的强度。
 *
 * ## 票据格式
 *   v1.<expMs>.<nonce>.<hmacBase64Url>
 * 签名内容为 `v1.<expMs>.<nonce>`，算法 HMAC-SHA256。自包含、无状态、无需存储。
 *
 * ## ⚠️ 风险 R5「鉴权误伤真新生」的三道防线
 *  1. **签发端点匿名可调**（`POST /api/v1/ticket` 不校验票据），任何人都能领；
 *  2. **默认灰度**：`AUTH_ENFORCE` 默认 0，校验失败只记录不拦截，观察 24h 再开；
 *  3. **密钥缺失即强制放行**：见下方 `secretOf()` 的说明 —— 这是最容易被忽略、
 *     一旦踩中就是全站 401 的坑。
 */

const PREFIX = 'v1';

/** 校验失败的原因分类，用于灰度期的日志观察。 */
export type TicketFailure =
  | 'missing' // 请求没带票据
  | 'malformed' // 格式不对
  | 'bad-signature' // 签名不匹配（伪造或密钥变更）
  | 'expired'; // 已过期

export interface TicketVerifyResult {
  ok: boolean;
  /** 票据的 nonce，用作限流维度；校验失败为 null */
  ticketId: string | null;
  reason?: TicketFailure;
}

/** 进程内兜底密钥。仅在未配置 TICKET_SECRET 时生成，且此时一定不会启用拦截。 */
let ephemeralSecret = '';

/**
 * 取签名密钥。
 *
 * ⚠️ 云函数是多实例的。如果每个实例各自生成随机密钥，
 * A 实例签发的票据打到 B 实例必然验签失败 —— 表现就是报到日随机大面积 401，
 * 而且因为是随机的，排查起来极其痛苦。
 * 所以：**密钥必须来自环境变量**；缺失时由 `isEnforcing()` 强制退回不拦截模式。
 */
function secretOf(): string {
  if (config.auth.ticketSecret) return config.auth.ticketSecret;
  if (!ephemeralSecret) ephemeralSecret = randomBytes(32).toString('hex');
  return ephemeralSecret;
}

/** 是否配置了持久密钥。 */
export function hasPersistentSecret(): boolean {
  return config.auth.ticketSecret !== '';
}

/**
 * 当前是否真的拦截。
 * 两个条件必须同时满足：显式开了 AUTH_ENFORCE，且配了持久密钥。
 * 少任何一个都只记录不拦截。
 */
export function isEnforcing(): boolean {
  return config.auth.enforce && hasPersistentSecret();
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', secretOf()).update(payload).digest());
}

/** 定时安全比较，避免签名比对被时序侧信道探测。 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export interface IssuedTicket {
  ticket: string;
  /** 过期时间戳（毫秒） */
  expiresAt: number;
}

/**
 * 签发一张匿名票据。
 *
 * @param nowMs 当前时间戳，显式传入便于单测
 */
export function issueTicket(nowMs: number = Date.now()): IssuedTicket {
  const expiresAt = nowMs + config.auth.ticketTtlMs;
  const nonce = randomBytes(9).toString('base64url'); // 12 字符，够用且不冗长
  const payload = `${PREFIX}.${expiresAt}.${nonce}`;
  return { ticket: `${payload}.${sign(payload)}`, expiresAt };
}

/**
 * 校验票据。**本函数只做判定，不决定是否拦截** —— 拦截与否交给调用方结合
 * `isEnforcing()` 决策，这样灰度开关只有一处生效点，不会散落。
 */
export function verifyTicket(raw: string | null | undefined, nowMs: number = Date.now()): TicketVerifyResult {
  if (!raw || raw.trim() === '') return { ok: false, ticketId: null, reason: 'missing' };

  const parts = raw.trim().split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    return { ok: false, ticketId: null, reason: 'malformed' };
  }

  const [, expStr, nonce, mac] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || nonce === '' || mac === '') {
    return { ok: false, ticketId: null, reason: 'malformed' };
  }

  const payload = `${PREFIX}.${expStr}.${nonce}`;
  if (!safeEqual(mac, sign(payload))) {
    return { ok: false, ticketId: null, reason: 'bad-signature' };
  }

  // 先验签再验时间：顺序反了会让攻击者用伪造票据探测服务端时钟
  if (exp <= nowMs) return { ok: false, ticketId: nonce, reason: 'expired' };

  return { ok: true, ticketId: nonce };
}

/** 从请求中提取票据：优先 `X-Ticket`，兼容 `Authorization: Bearer <ticket>`。 */
export function extractTicket(req: Request): string | null {
  const h = req.headers['x-ticket'];
  if (typeof h === 'string' && h.trim() !== '') return h.trim();

  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    const v = auth.slice(7).trim();
    if (v !== '') return v;
  }
  return null;
}

export interface AuthDecision {
  /** true = 应当拒绝该请求（仅在拦截模式下才可能为 true） */
  reject: boolean;
  /** 票据 nonce，用作限流维度；无有效票据时为 null */
  ticketId: string | null;
  result: TicketVerifyResult;
}

/**
 * 对一个请求做鉴权决策。
 *
 * 灰度期（默认）：无论校验结果如何都放行，只在日志里留一行观察记录。
 * 这行日志正是「观察 24h 无误伤再开启拦截」的数据来源 ——
 * 如果灰度期日志里全是 missing，说明前端还没接上领票逻辑，此时开拦截就是灾难。
 */
export function authorize(req: Request, nowMs: number = Date.now()): AuthDecision {
  const raw = extractTicket(req);
  const result = verifyTicket(raw, nowMs);
  const enforcing = isEnforcing();

  if (!result.ok) {
    // 只打印失败原因，不打印票据内容与任何请求体字段
    console.warn(
      `[auth] ticket ${result.reason} enforce=${enforcing ? 1 : 0}` +
        (hasPersistentSecret() ? '' : ' (TICKET_SECRET 未配置，已强制放行)'),
    );
  }

  return { reject: enforcing && !result.ok, ticketId: result.ticketId, result };
}
