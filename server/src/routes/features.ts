import { Request, Response } from 'express';
import { getStore } from '../store';
import { ok } from '../utils/response';

/**
 * GET /api/v1/features —— 猜你想问卡片（公开）。
 * 支持 ?scenario_id 过滤；缺省返回全部场景卡片。MVP 报到域 6 条真实问题。
 * 响应：{ code:0, data:[{ id, text, scenario_id }], message:"ok" }。
 */
export async function featuresHandler(req: Request, res: Response): Promise<void> {
  const store = await getStore();
  const scenarioId = typeof req.query.scenario_id === 'string' ? req.query.scenario_id : undefined;
  const list = await store.listFeatures(scenarioId);
  const data = list.map((f) => ({
    id: f._id,
    text: f.text,
    scenario_id: f.scenario_id,
  }));
  ok(res, data);
}
