// [QA 临时文件] 测试范围 4：food/data.ts 数据完整性
// 验收依据：PRD-P0-06 吃什么（≥8 条、askQuestion 非空、分类合法）

import { describe, it, expect } from 'vitest';
import { FOOD_ITEMS, FOOD_CATEGORIES, FOOD_DISCLAIMER } from '../src/modules/food/data';

describe('food/data.ts —— 数据量与结构', () => {
  it('【AC】FOOD_ITEMS 至少 8 条', () => {
    expect(FOOD_ITEMS.length).toBeGreaterThanOrEqual(8);
  });

  it('每条都有非空 id / name / category / askQuestion', () => {
    for (const item of FOOD_ITEMS) {
      expect(item.id, `id 缺失: ${JSON.stringify(item)}`).toBeTruthy();
      expect(item.name, `name 缺失: ${item.id}`).toBeTruthy();
      expect(item.category, `category 缺失: ${item.id}`).toBeTruthy();
      expect(item.askQuestion, `askQuestion 缺失: ${item.id}`).toBeTruthy();
      expect(item.askQuestion.trim().length, `askQuestion 为空白: ${item.id}`).toBeGreaterThan(0);
    }
  });

  it('id 全局唯一（避免 React key 冲突）', () => {
    const ids = FOOD_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('name 不重复（列表不出现同名两条）', () => {
    const names = FOOD_ITEMS.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('food/data.ts —— 分类合法性', () => {
  it('FOOD_CATEGORIES 非空且无重复', () => {
    expect(FOOD_CATEGORIES.length).toBeGreaterThan(0);
    expect(new Set(FOOD_CATEGORIES).size).toBe(FOOD_CATEGORIES.length);
  });

  it('【AC】每条食物的 category 必须落在 FOOD_CATEGORIES 内（无孤儿分类）', () => {
    for (const item of FOOD_ITEMS) {
      expect(FOOD_CATEGORIES, `未知分类 ${item.category} @ ${item.id}`).toContain(item.category);
    }
  });

  it('每个分类至少有一条食物（筛选后不出现空列表）', () => {
    for (const cat of FOOD_CATEGORIES) {
      const hit = FOOD_ITEMS.filter((i) => i.category === cat);
      expect(hit.length, `分类「${cat}」没有任何食物，筛选后会空屏`).toBeGreaterThan(0);
    }
  });
});

describe('food/data.ts —— askQuestion 可用性', () => {
  it('askQuestion 是中文自然语句（能直接投喂给对话）', () => {
    for (const item of FOOD_ITEMS) {
      expect(/[\u4e00-\u9fa5]/.test(item.askQuestion), `askQuestion 无中文: ${item.id}`).toBe(true);
      expect(item.askQuestion.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('askQuestion 经 encodeURIComponent 后可安全拼进 query（跳转链路不炸）', () => {
    for (const item of FOOD_ITEMS) {
      const url = `/chat?scenario=shenghuo&q=${encodeURIComponent(item.askQuestion)}`;
      expect(() => new URL(url, 'http://localhost')).not.toThrow();
      const parsed = new URL(url, 'http://localhost');
      expect(parsed.searchParams.get('q')).toBe(item.askQuestion);
    }
  });

  it('askQuestion 各不相同（不是复制粘贴的同一句）', () => {
    const qs = FOOD_ITEMS.map((i) => i.askQuestion);
    expect(new Set(qs).size).toBe(qs.length);
  });
});

describe('food/data.ts —— 免责声明', () => {
  it('FOOD_DISCLAIMER 存在且为中文说明（数据来源可追溯）', () => {
    expect(FOOD_DISCLAIMER.length).toBeGreaterThan(0);
    expect(/[\u4e00-\u9fa5]/.test(FOOD_DISCLAIMER)).toBe(true);
  });
});
