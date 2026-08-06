import { Request, Response } from 'express';
import { config } from '../config';
import { ErrorCode, sendError } from '../errors';
import { hasPersistentSecret, isEnforcing, issueTicket } from '../middleware/auth';
import { clientKey, rateLimit } from '../middleware/rateLimit';
import { ok } from '../utils/response';

/**
 * POST /api/v1/ticket —— 签发匿名短期票据（SEC-1 / Q2）。
 *
 * ## 本端点**故意不做鉴权**
 * 这是风险 R5 的第一道防线：任何人打开页面就能领到票，不需要登录、不需要学号。
 * 如果连领票都要凭证，那就是把「防刷」做成了「防新生」，方向就错了。
 *
 * 端点自身按 IP 限流（默认 10 次/分钟），防止有人循环刷票绕过 chat 限流 ——
 * 阈值取得比 chat 更宽松，因为正常用户一个会话只领一次，
 * 而 30 分钟 TTL 到期后的续领也不会频繁。
 */
export function ticketHandler(req: Request, res: Response): void {
  const rl = rateLimit(`ticket:${clientKey(req)}`, config.rateLimit.ticketMax, config.rateLimit.windowMs);
  if (!rl.ok) {
    sendError(res, ErrorCode.RATE_LIMITED, '领取过于频繁，请稍后再试', null, {
      retryAfterSec: rl.retryAfterSec,
    });
    return;
  }

  const { ticket, expiresAt } = issueTicket();

  ok(res, {
    ticket,
    expires_at: expiresAt,
    /**
     * 告诉前端当前是否真的在拦截。
     * 灰度期为 false，前端据此可以决定「领票失败要不要打断用户」——
     * 灰度期显然不该打断（没票也能用），拦截期才需要提示重试。
     */
    enforced: isEnforcing(),
    /** 未配置持久密钥时为 true，运维可据此发现「票据形同虚设」的配置遗漏 */
    degraded: !hasPersistentSecret(),
  });
}
