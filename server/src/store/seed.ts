import type { Feature, Scenario } from '../types';

/**
 * 种子数据（对齐 db-schema.md §1/§4 + openapi.yaml 示例）。
 * scenarios：MVP 仅 baodao 启用；其余 3 条为 v2 预置且 enabled=false，
 *   图标映射（lucide_icon_name）作为唯一事实源锁定在库内。
 * features：报到域 6 条真实校园问题（非占位）。
 */
export const SEED_SCENARIOS: Scenario[] = [
  {
    _id: 's_baodao',
    id: 'baodao',
    name: '新生报到',
    lucide_icon_name: 'MapPin',
    icon: 'MapPin',
    kb_ref: 'coze:kb_baodao_v1',
    sort: 1,
    enabled: true,
    created_at: '2026-07-30T08:00:00Z',
  },
  {
    _id: 's_xuanke',
    id: 'xuanke',
    name: '选课',
    lucide_icon_name: 'BookOpen',
    icon: 'BookOpen',
    kb_ref: 'coze:kb_xuanke_v1',
    sort: 2,
    enabled: true,
    created_at: '2026-07-30T08:00:00Z',
  },
  {
    _id: 's_kaoyan',
    id: 'kaoyan',
    name: '考研',
    lucide_icon_name: 'GraduationCap',
    icon: 'GraduationCap',
    kb_ref: 'coze:kb_kaoyan_v1',
    sort: 3,
    enabled: true,
    created_at: '2026-07-30T08:00:00Z',
  },
  {
    _id: 's_shenghuo',
    id: 'shenghuo',
    name: '生活',
    lucide_icon_name: 'Coffee',
    icon: 'Coffee',
    kb_ref: 'coze:kb_shenghuo_v1',
    sort: 4,
    enabled: true,
    created_at: '2026-07-30T08:00:00Z',
  },
];

export const SEED_FEATURES: Feature[] = [
  { _id: 'f1', scenario_id: 'baodao', text: '报到要带什么材料', sort: 1 },
  { _id: 'f2', scenario_id: 'baodao', text: '从长春站怎么去学校', sort: 2 },
  { _id: 'f3', scenario_id: 'baodao', text: '宿舍怎么分配', sort: 3 },
  { _id: 'f4', scenario_id: 'baodao', text: '学费怎么交', sort: 4 },
  { _id: 'f5', scenario_id: 'baodao', text: '校园卡怎么激活', sort: 5 },
  { _id: 'f6', scenario_id: 'baodao', text: '军训要准备什么', sort: 6 },
  { _id: 'f7', scenario_id: 'xuanke', text: '怎么选课、课表在哪看', sort: 1 },
  { _id: 'f8', scenario_id: 'xuanke', text: '培养方案怎么查', sort: 2 },
  { _id: 'f9', scenario_id: 'xuanke', text: '绩点怎么算、挂科了怎么办', sort: 3 },
  { _id: 'f10', scenario_id: 'kaoyan', text: '保研政策是什么、怎么申请', sort: 1 },
  { _id: 'f11', scenario_id: 'kaoyan', text: '考研怎么准备、什么时候开始', sort: 2 },
  { _id: 'f12', scenario_id: 'kaoyan', text: '学校保研率大概多少', sort: 3 },
  { _id: 'f13', scenario_id: 'shenghuo', text: '学校有几个食堂、哪个好吃', sort: 1 },
  { _id: 'f14', scenario_id: 'shenghuo', text: '宿舍怎么分配、几人间', sort: 2 },
  { _id: 'f15', scenario_id: 'shenghuo', text: '快递在哪取、校医室在哪', sort: 3 },
  { _id: 'f16', scenario_id: 'shenghuo', text: '洗澡热水怎么用、洗衣房在哪', sort: 4 },
];

/** 深拷贝种子，避免调用方修改原始常量。 */
export function cloneScenarios(): Scenario[] {
  return SEED_SCENARIOS.map((s) => ({ ...s }));
}

export function cloneFeatures(): Feature[] {
  return SEED_FEATURES.map((f) => ({ ...f }));
}
