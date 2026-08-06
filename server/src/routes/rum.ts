import { Request, Response } from 'express';
import { config } from '../config';
import { clientKey, rateLimit } from '../middleware/rateLimit';
import { ok } from '../utils/response';

/**
 * POST /api/v1/rum —— 埋点收集端点（MAINT-1 / 架构 A2）。
 *
 * ## 设计取向：只做「不拒绝」，不做「保证送达」
 * 前端用 `navigator.sendBeacon` 上报，它本身就不看响应。所以本端点的首要职责是
 * **永远快速返回 200**，绝不因为埋点问题拖慢或阻断学生的问答链路。
 * 任何解析异常都吞掉并计入丢弃计数，不回错误码。
 *
 * ## 隐私（Q4）
 * 服务端做第三道字段白名单过滤（前端已有类型层 + 运行时两道）。
 * 即便某个版本的前端上报了不该带的字段，这里也会在落日志前剥掉。
 * **禁止把 events 原样打进日志**，只输出结构化的计数与事件名分布。
 */

/** 与 web/src/lib/analytics.ts 的 AnalyticsEvent 严格对齐。 */
const ALLOWED_KEYS = new Set([
  'ev', 'ts', 'sid', 'scenario', 'rid',
  'ttfb_ms', 'dur_ms', 'token_n', 'metric', 'value',
  'code', 'cls', 'phase', 'abort_reason', 'retry_n', 'degraded_n',
]);

/** 单批最多接收的事件数，超出部分丢弃。 */
const MAX_EVENTS_PER_BATCH = 50;

function sanitizeEvent(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') {
      out[k] = v.slice(0, 64);
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    }
    // 其它类型（对象/数组/函数）一律丢弃：它们是文本外泄最可能的载体
  }
  return typeof out.ev === 'string' ? out : null;
}

export function rumHandler(req: Request, res: Response): void {
  // 限流维度用 IP，阈值复用 dataMax。被限流时也返回 200 —— 埋点不值得让客户端重试
  const rl = rateLimit(`rum:${clientKey(req)}`, config.rateLimit.dataMax, config.rateLimit.windowMs);
  if (!rl.ok) {
    ok(res, { accepted: 0, dropped: 0, throttled: true });
    return;
  }

  let accepted = 0;
  let dropped = 0;
  const byEvent: Record<string, number> = {};

  try {
    const body = req.body as { events?: unknown } | undefined;
    const list = Array.isArray(body?.events) ? body!.events : [];

    for (const raw of list.slice(0, MAX_EVENTS_PER_BATCH)) {
      const evt = sanitizeEvent(raw);
      if (!evt) {
        dropped += 1;
        continue;
      }
      accepted += 1;
      const name = String(evt.ev);
      byEvent[name] = (byEvent[name] ?? 0) + 1;
    }
    dropped += Math.max(0, list.length - MAX_EVENTS_PER_BATCH);

    if (accepted > 0) {
      // ⚠️ 只打印聚合计数，绝不打印事件明细
      console.log(`[rum] accepted=${accepted} dropped=${dropped} dist=${JSON.stringify(byEvent)}`);
    }
  } catch {
    // 埋点解析失败不回错误：客户端拿不到也不会处理，回 200 让它安静结束
    dropped += 1;
  }

  ok(res, { accepted, dropped, throttled: false });
}
