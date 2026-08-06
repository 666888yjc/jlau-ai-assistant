import { Request, Response } from 'express';
import { config } from '../config';
import { getStore } from '../store';
import { sendError } from '../errors';
import { clientKey, rateLimit } from '../middleware/rateLimit';
import { validateFeedbackBody } from '../middleware/validate';
import { ok } from '../utils/response';

/**
 * POST /api/v1/feedback —— 记录「有帮助 / 报错」事件，写入 feedback 集合。
 * 响应：{ code:0, data:{ id, message_id, type }, message:"ok" }。
 * scenario_id 为可选；缺省归属 MVP 默认场景（baodao），以保证 db-schema 索引字段存在。
 */
export async function feedbackHandler(req: Request, res: Response): Promise<void> {
  const v = validateFeedbackBody(req.body);
  if (!v.ok) {
    sendError(res, v.code, v.message);
    return;
  }

  const rl = rateLimit(`feedback:${clientKey(req)}`, config.rateLimit.dataMax, config.rateLimit.windowMs);
  if (!rl.ok) {
    sendError(res, 4290, '请求过于频繁，请稍后再试');
    return;
  }

  const store = await getStore();
  const scenarioId = v.value.scenario_id || config.defaultScenario;
  const rec = await store.createFeedback({
    message_id: v.value.message_id,
    type: v.value.type,
    note: v.value.note,
    scenario_id: scenarioId,
  });

  ok(res, { id: rec._id, message_id: rec.message_id, type: rec.type });
}
