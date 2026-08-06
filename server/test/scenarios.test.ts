import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * 场景 / 猜你想问接口回归。
 * 期望值以 src/store/seed.ts 为唯一事实源：
 * 07-31 起种子由「1 场景 6 功能」扩为 4 场景（baodao/xuanke/kaoyan/shenghuo，全部 enabled）
 * 共 16 条功能引导；本测试断言随之对齐。
 */

/** 与 SEED_SCENARIOS 一一对应（顺序即 sort 顺序） */
const EXPECTED_SCENARIOS = [
  { id: 'baodao', name: '新生报到', icon: 'MapPin', lucide_icon: 'MapPin' },
  { id: 'xuanke', name: '选课', icon: 'BookOpen', lucide_icon: 'BookOpen' },
  { id: 'kaoyan', name: '考研', icon: 'GraduationCap', lucide_icon: 'GraduationCap' },
  { id: 'shenghuo', name: '生活', icon: 'Coffee', lucide_icon: 'Coffee' },
];

/** 与 SEED_FEATURES 的分布一致，合计 16 条 */
const FEATURE_COUNT_BY_SCENARIO: Record<string, number> = {
  baodao: 6,
  xuanke: 3,
  kaoyan: 3,
  shenghuo: 4,
};
const TOTAL_FEATURES = 16;

const app = createApp();

describe('GET /api/v1/scenarios', () => {
  it('返回 4 个启用场景，含 Lucide 图标映射', async () => {
    const res = await request(app).get('/api/v1/scenarios');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(EXPECTED_SCENARIOS.length);
    expect(res.body.data).toEqual(EXPECTED_SCENARIOS);
  });

  it('每个场景都带非空 lucide_icon（前端图标映射不缺失）', async () => {
    const res = await request(app).get('/api/v1/scenarios');
    expect(res.body.data.every((s: any) => typeof s.lucide_icon === 'string' && s.lucide_icon.length > 0)).toBe(true);
  });
});

describe('GET /api/v1/features', () => {
  it('返回报到域 6 条猜你想问', async () => {
    const res = await request(app).get('/api/v1/features').query({ scenario_id: 'baodao' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveLength(FEATURE_COUNT_BY_SCENARIO.baodao);
    expect(res.body.data.every((f: any) => f.scenario_id === 'baodao')).toBe(true);
    expect(res.body.data[0]).toMatchObject({ id: 'f1', text: '报到要带什么材料', scenario_id: 'baodao' });
    expect(res.body.data[5].id).toBe('f6');
  });

  it.each(Object.entries(FEATURE_COUNT_BY_SCENARIO))('场景 %s 返回 %i 条功能引导', async (scenarioId, count) => {
    const res = await request(app).get('/api/v1/features').query({ scenario_id: scenarioId });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(count);
    expect(res.body.data.every((f: any) => f.scenario_id === scenarioId)).toBe(true);
  });

  it(`无 scenario_id 过滤返回全部 ${TOTAL_FEATURES} 条（4 个场景合计）`, async () => {
    const res = await request(app).get('/api/v1/features');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(TOTAL_FEATURES);
    const ids = new Set(res.body.data.map((f: any) => f.scenario_id));
    expect([...ids].sort()).toEqual(Object.keys(FEATURE_COUNT_BY_SCENARIO).sort());
  });

  it('未知 scenario_id -> 200 空数组（不报错）', async () => {
    const res = await request(app).get('/api/v1/features').query({ scenario_id: 'unknown' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
