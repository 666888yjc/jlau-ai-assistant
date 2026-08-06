import { Request, Response } from 'express';
import { getStore } from '../store';
import { sendError } from '../errors';
import { clientKey, rateLimit } from '../middleware/rateLimit';
import { validateHandoffBody } from '../middleware/validate';
import { ok } from '../utils/response';
import { config } from '../config';

/**
 * POST /api/v1/human-handoff —— 兜底转人工登记，写入 human_handoff 集合。
 * 响应：{ code:0, data:{ id, scenario_id, status }, message:"ok" }。
 * 隐私合规：contact 含手机号/身份证号时直接拒（4001），不落库（SPEC §10）。
 * scenario_id 必须在注册表内，否则 4002。
 */
export async function handoffHandler(req: Request, res: Response): Promise<void> {
  const v = validateHandoffBody(req.body);
  if (!v.ok) {
    sendError(res, v.code, v.message);
    return;
  }

  const rl = rateLimit(`handoff:${clientKey(req)}`, config.rateLimit.dataMax, config.rateLimit.windowMs);
  if (!rl.ok) {
    sendError(res, 4290, '请求过于频繁，请稍后再试');
    return;
  }

  const store = await getStore();
  const scenario = await store.getScenario(v.value.scenario_id);
  if (!scenario) {
    sendError(res, 4002, '场景不存在');
    return;
  }

  const rec = await store.createHandoff({
    scenario_id: v.value.scenario_id,
    question: v.value.question,
    contact: v.value.contact,
  });

  ok(res, { id: rec._id, scenario_id: rec.scenario_id, status: rec.status });
}
