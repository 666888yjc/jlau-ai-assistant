// [QA 独立验收] P2 三模块 —— 由 QA 依据权威规格独立编写，不复用工程师测试的断言。
// ------------------------------------------------------------------
// 目的：覆盖工程师自测遗漏的两块空白
//   ① 常用电话 13 条静态数据的逐字正确性（号码 / 分类 / source / tel 安全）；
//   ② 失物招领的排序与状态流转（工程师仅测了类型守卫）；
// 外加换算表与架构不变量的独立复核。
//
// 期望值全部来自权威规格，而非从源码反推 —— 否则测试只能证明「代码等于它自己」。
// ------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PHONE_CATEGORIES, PHONE_ITEMS, matchPhoneKeyword } from '../src/modules/phone/data';
import { GPA_SCALE } from '../src/modules/gpa/data';
import { calcGpa, formatGpaNumber, scoreToPoint } from '../src/lib/gpa';
import {
  addLostFoundItem,
  readLostFound,
  resolveLostFoundItem,
  reopenLostFoundItem,
  sortedLostFound,
} from '../src/lib/lostfound';
import { STORAGE_DESCRIPTORS } from '../src/lib/storage';
import { MODULE_REGISTRY, sortedModules } from '../src/modules/registry';
import type { LostFoundItem } from '../src/types/local';

/* ================================================================
   1. 常用电话 · 权威 13 条逐字核对
   ================================================================ */

/** 权威清单：[号码, 分类]。号码是唯一稳定标识（id 命名不参与断言） */
const AUTHORITATIVE_PHONES: ReadonlyArray<readonly [string, string]> = [
  ['110', '紧急求助'],
  ['119', '紧急求助'],
  ['120', '紧急求助'],
  ['122', '紧急求助'],
  ['96110', '紧急求助'],
  ['0431-84532980', '报到入学'],
  ['0431-84532752', '报到入学'],
  ['0431-84532820', '医疗健康'],
  ['0431-84533048', '升学深造'],
  ['0431-84533049', '升学深造'],
  ['0431-84533149', '升学深造'],
  ['0431-84533305', '升学深造'],
  ['12356', '心理支持'],
];

describe('常用电话 · 静态数据逐字核对', () => {
  it('恰好 13 条，不多不少', () => {
    expect(PHONE_ITEMS).toHaveLength(13);
  });

  it('号码与分类的对应关系与权威清单完全一致', () => {
    const actual = PHONE_ITEMS.map((i) => [i.phone, i.category] as const)
      .slice()
      .sort();
    const expected = AUTHORITATIVE_PHONES.slice().sort();
    expect(actual).toEqual(expected);
  });

  it('分类枚举恰为 5 个，且不含「后勤服务」这类空分类', () => {
    expect(PHONE_CATEGORIES).toEqual([
      '紧急求助',
      '报到入学',
      '医疗健康',
      '升学深造',
      '心理支持',
    ]);
    expect(PHONE_CATEGORIES).not.toContain('后勤服务');
  });

  it('每条都落在已声明的分类里（无游离分类）', () => {
    for (const item of PHONE_ITEMS) {
      expect(PHONE_CATEGORIES).toContain(item.category);
    }
  });

  it('id 全局唯一', () => {
    const ids = PHONE_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每条 source 非空（可溯源，AC②）', () => {
    for (const item of PHONE_ITEMS) {
      expect(item.source.trim().length).toBeGreaterThan(0);
    }
  });

  it('phone 字段 tel: 安全 —— 只含数字与短横线', () => {
    for (const item of PHONE_ITEMS) {
      expect(item.phone).toMatch(/^[0-9][0-9-]*[0-9]$/);
    }
  });

  it('name / purpose 非空，purpose ≤30 字', () => {
    for (const item of PHONE_ITEMS) {
      expect(item.name.trim().length).toBeGreaterThan(0);
      expect(item.purpose.trim().length).toBeGreaterThan(0);
      expect(item.purpose.length).toBeLessThanOrEqual(30);
    }
  });

  it('去横线搜索可命中（输入 84532980 能搜到招生处）', () => {
    const hit = PHONE_ITEMS.filter((i) => matchPhoneKeyword(i, '84532980'));
    expect(hit).toHaveLength(1);
    expect(hit[0].phone).toBe('0431-84532980');
  });

  it('空关键词返回全部；无关关键词返回空', () => {
    expect(PHONE_ITEMS.filter((i) => matchPhoneKeyword(i, '   '))).toHaveLength(13);
    expect(PHONE_ITEMS.filter((i) => matchPhoneKeyword(i, 'zzz-not-exist'))).toHaveLength(0);
  });
});

/* ================================================================
   2. GPA 换算表 · 独立复核
   ================================================================ */

const AUTHORITATIVE_SCALE = [
  { min: 90, point: 4.0 },
  { min: 85, point: 3.7 },
  { min: 82, point: 3.3 },
  { min: 78, point: 3.0 },
  { min: 75, point: 2.7 },
  { min: 72, point: 2.3 },
  { min: 68, point: 2.0 },
  { min: 64, point: 1.5 },
  { min: 60, point: 1.0 },
  { min: 0, point: 0 },
];

describe('GPA_SCALE · 换算表与边界', () => {
  it('换算表严格等于权威表', () => {
    expect(GPA_SCALE).toEqual(AUTHORITATIVE_SCALE);
  });

  it('min 严格降序（scoreToPoint 的扫描前提）', () => {
    for (let i = 1; i < GPA_SCALE.length; i += 1) {
      expect(GPA_SCALE[i].min).toBeLessThan(GPA_SCALE[i - 1].min);
    }
  });

  it.each([
    [100, 4.0],
    [90, 4.0],
    [89, 3.7],
    [89.5, 3.7],
    [85, 3.7],
    [60, 1.0],
    [59, 0],
    [59.9, 0],
    [0, 0],
  ])('scoreToPoint(%s) === %s', (score, point) => {
    expect(scoreToPoint(score)).toBe(point);
  });

  it('全分段扫描 0–100（步长 0.5）绝不产生 NaN / Infinity / undefined', () => {
    for (let s = 0; s <= 100; s += 0.5) {
      const p = scoreToPoint(s);
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(4.0);
    }
  });

  it('绩点随分数单调不减', () => {
    let prev = -1;
    for (let s = 0; s <= 100; s += 0.5) {
      const p = scoreToPoint(s);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});

describe('calcGpa · 页面绝不渲染 NaN', () => {
  const dirty = [
    { id: 'a', name: 'x', credit: NaN, score: 90, term: '', createdAt: 1 },
    { id: 'b', name: 'y', credit: 3, score: Infinity, term: '', createdAt: 2 },
    { id: 'c', name: 'z', credit: 0, score: 0, term: '', createdAt: 3 },
  ];

  it('全脏数据 → null → formatGpaNumber 渲染 "--"', () => {
    const r = calcGpa(dirty);
    expect(r.weightedGpa).toBeNull();
    expect(formatGpaNumber(r.weightedGpa)).toBe('--');
    expect(formatGpaNumber(r.weightedScore)).toBe('--');
  });

  it('空数组不抛错且返回 null', () => {
    const r = calcGpa([]);
    expect(r.courseCount).toBe(0);
    expect(r.weightedGpa).toBeNull();
  });

  it('加权口径正确：3 学分 90 + 2 学分 80 → 绩点 (4.0*3+3.0*2)/5 = 3.6', () => {
    const r = calcGpa([
      { id: 'a', name: 'A', credit: 3, score: 90, term: '', createdAt: 1 },
      { id: 'b', name: 'B', credit: 2, score: 80, term: '', createdAt: 2 },
    ]);
    expect(r.weightedGpa).toBeCloseTo(3.6, 10);
    expect(r.weightedScore).toBeCloseTo(86, 10);
    expect(formatGpaNumber(r.weightedGpa)).toBe('3.60');
  });
});

/* ================================================================
   3. 失物招领 · 排序与状态流转（工程师未覆盖）
   ================================================================ */

function makeItem(id: string, createdAt: number): LostFoundItem {
  return {
    id,
    kind: 'lost',
    title: `物品${id}`,
    place: '图书馆',
    date: '2026-01-01',
    contact: '微信 abc',
    note: '',
    status: 'open',
    createdAt,
    updatedAt: createdAt,
  };
}

describe('失物招领 · 列表排序', () => {
  it('sortedLostFound 按 createdAt 倒序（最新在前）', () => {
    const sorted = sortedLostFound([
      makeItem('old', 1000),
      makeItem('new', 3000),
      makeItem('mid', 2000),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['new', 'mid', 'old']);
  });

  it('不修改入参数组（纯函数）', () => {
    const input = [makeItem('a', 1), makeItem('b', 2)];
    sortedLostFound(input);
    expect(input.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('失物招领 · 状态流转与 updatedAt', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it('双通道：我丢了 / 我捡到 各自独立落库', () => {
    expect(
      addLostFoundItem({
        kind: 'lost',
        title: '校园卡',
        place: '三食堂',
        date: '2026-01-02',
        contact: '138',
        note: '',
      }),
    ).toBe('ok');
    expect(
      addLostFoundItem({
        kind: 'found',
        title: '雨伞',
        place: '图书馆',
        date: '2026-01-03',
        contact: '139',
        note: '',
      }),
    ).toBe('ok');

    const items = readLostFound().items;
    expect(items).toHaveLength(2);
    expect(items.filter((i) => i.kind === 'lost')).toHaveLength(1);
    expect(items.filter((i) => i.kind === 'found')).toHaveLength(1);
  });

  it('标记已解决会把 status 改为 done 并推进 updatedAt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    addLostFoundItem({
      kind: 'lost',
      title: '钥匙',
      place: '宿舍',
      date: '2026-01-01',
      contact: '137',
      note: '',
    });
    const before = readLostFound().items[0];
    expect(before.status).toBe('open');

    // 时间前进 1 分钟，确保 updatedAt 可区分
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
    expect(resolveLostFoundItem(before.id)).toBe(true);

    const after = readLostFound().items[0];
    expect(after.status).toBe('done');
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt);
    expect(after.createdAt).toBe(before.createdAt); // createdAt 不被改写
    vi.useRealTimers();
  });

  it('撤销已解决可回到 open；重复操作返回 false 不产生无谓写入', () => {
    addLostFoundItem({
      kind: 'found',
      title: '水杯',
      place: '教学楼',
      date: '2026-01-01',
      contact: '136',
      note: '',
    });
    const id = readLostFound().items[0].id;

    expect(resolveLostFoundItem(id)).toBe(true);
    expect(resolveLostFoundItem(id)).toBe(false); // 已是 done
    expect(reopenLostFoundItem(id)).toBe(true);
    expect(reopenLostFoundItem(id)).toBe(false); // 已是 open
    expect(readLostFound().items[0].status).toBe('open');
  });

  it('不存在的 id 静默返回 false，不抛错', () => {
    expect(resolveLostFoundItem('no-such-id')).toBe(false);
    expect(reopenLostFoundItem('no-such-id')).toBe(false);
  });

  it('标题为空白拒绝写入', () => {
    expect(
      addLostFoundItem({
        kind: 'lost',
        title: '   ',
        place: '',
        date: '',
        contact: '',
        note: '',
      }),
    ).toBe('empty');
    expect(readLostFound().items).toHaveLength(0);
  });
});

/* ================================================================
   4. 架构不变量
   ================================================================ */

describe('架构不变量 · 注册表与存储清单数据驱动', () => {
  it('模块注册表恰 5 个，order 升序且唯一', () => {
    expect(MODULE_REGISTRY).toHaveLength(5);
    const orders = sortedModules().map((m) => m.order);
    expect(orders).toEqual([10, 20, 30, 40, 50]);
    expect(new Set(orders).size).toBe(5);
  });

  it('P2 三模块字段合规：desc ≤14 字、默认开启、路径唯一', () => {
    for (const id of ['phone', 'lostfound', 'gpa']) {
      const m = MODULE_REGISTRY.find((x) => x.id === id);
      expect(m, `模块 ${id} 未注册`).toBeDefined();
      expect(m!.desc.length).toBeLessThanOrEqual(14);
      expect(m!.defaultEnabled).toBe(true);
      expect(m!.icon).toBe(id); // 自绘图标而非通用 scene
      expect(m!.path).toBe(`/modules/${id}`);
    }
    const paths = MODULE_REGISTRY.map((m) => m.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('存储清单登记了 lostfound / gpa 两个新键（隐私中心据此自动出条目）', () => {
    const lf = STORAGE_DESCRIPTORS.find((d) => d.id === 'lostfound');
    const gpa = STORAGE_DESCRIPTORS.find((d) => d.id === 'gpa');

    expect(lf).toBeDefined();
    expect(lf!.key).toBe('jxn-lostfound');
    expect(lf!.kind).toBe('exact');
    expect(lf!.managed).toBe(true);

    expect(gpa).toBeDefined();
    expect(gpa!.key).toBe('jxn-gpa');
    expect(gpa!.kind).toBe('exact');
    expect(gpa!.managed).toBe(true);
  });

  it('存储清单 id 与 key 均唯一（无重复登记）', () => {
    const ids = STORAGE_DESCRIPTORS.map((d) => d.id);
    const keys = STORAGE_DESCRIPTORS.map((d) => d.key);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('summarize 面对脏数据返回「数据异常」而不抛错', () => {
    const lf = STORAGE_DESCRIPTORS.find((d) => d.id === 'lostfound')!;
    const gpa = STORAGE_DESCRIPTORS.find((d) => d.id === 'gpa')!;
    expect(lf.summarize(['{not json'])).toBe('数据异常');
    expect(gpa.summarize(['{"version":9,"courses":"x"}'])).toBe('数据异常');
    expect(lf.summarize([])).toBe('0 条');
    expect(gpa.summarize([])).toBe('0 门');
  });
});
