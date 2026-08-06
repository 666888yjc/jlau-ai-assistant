import { Request, Response } from 'express';
import { getStore } from '../store';
import { ok } from '../utils/response';

/**
 * GET /api/v1/scenarios —— 分类入口列表（公开）。
 * 仅返回已启用场景（MVP 仅 baodao）；lucide_icon 由 scenarios.lucide_icon_name 映射。
 * 响应：{ code:0, data:[{ id, name, icon, lucide_icon }], message:"ok" }。
 */
export async function scenariosHandler(_req: Request, res: Response): Promise<void> {
  const store = await getStore();
  const list = await store.listScenarios(true);
  const data = list.map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    lucide_icon: s.lucide_icon_name,
  }));
  ok(res, data);
}
