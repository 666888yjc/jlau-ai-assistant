// [QA] P2 模块 · 纯函数与类型守卫测试
// 验收依据：PRD-P2-03 §4 计算口径、AC④（0 学分不出现 NaN）、E-1~E-9 边界；types/local 守卫不信任脏数据

import { describe, it, expect } from 'vitest';
import {
  calcGpa,
  scoreToPoint,
  formatGpaNumber,
  formatCredit,
  isValidCredit,
  isValidScore,
} from '../src/lib/gpa';
import type { GpaCourse } from '../src/types/local';
import { isGpaCourse, isGpaData, isLostFoundData } from '../src/types/local';

let seq = 0;
/** 构造一门课程；credit / score 直接喂数，便于边界测试 */
function course(credit: number, score: number, over: Partial<GpaCourse> = {}): GpaCourse {
  seq += 1;
  return {
    id: `t-${seq}`,
    name: `课${seq}`,
    credit,
    score,
    term: '',
    createdAt: seq,
    ...over,
  };
}

describe('scoreToPoint · 换算表边界（PRD-P2-03 §5 Q2）', () => {
  const cases: Array<[number, number]> = [
    [100, 4.0],
    [90, 4.0],
    [89.9, 3.7],
    [85, 3.7],
    [84, 3.3],
    [82, 3.3],
    [81, 3.0],
    [78, 3.0],
    [77, 2.7],
    [75, 2.7],
    [74, 2.3],
    [72, 2.3],
    [71, 2.0],
    [68, 2.0],
    [67, 1.5],
    [64, 1.5],
    [63, 1.0],
    [60, 1.0],
    [59.9, 0],
    [59, 0],
    [0, 0],
  ];
  it.each(cases)('scoreToPoint(%s) === %s', (s, p) => {
    expect(scoreToPoint(s)).toBeCloseTo(p, 6);
  });

  it('非有限数（NaN / Infinity）回落 0，不产生 undefined', () => {
    expect(scoreToPoint(NaN)).toBe(0);
    expect(scoreToPoint(Infinity)).toBe(0);
    expect(scoreToPoint(-Infinity)).toBe(0);
  });

  it('负分（如 -5）落在最低段，回落 0', () => {
    expect(scoreToPoint(-5)).toBe(0);
  });
});

describe('calcGpa · 边界（E-1 ~ E-9）', () => {
  // E-1 空数组
  it('E-1 空课程表：courseCount=0、两项均为 null（不出现 NaN）', () => {
    const r = calcGpa([]);
    expect(r.courseCount).toBe(0);
    expect(r.totalCredit).toBe(0);
    expect(r.weightedScore).toBeNull();
    expect(r.weightedGpa).toBeNull();
  });

  // E-2 全部学分 0
  it('E-2 所有学分填 0：总学分 0，两项仍 null（AC④：绝不 NaN）', () => {
    const r = calcGpa([course(0, 90), course(0, 60)]);
    expect(r.courseCount).toBe(2);
    expect(r.totalCredit).toBe(0);
    expect(r.weightedScore).toBeNull();
    expect(r.weightedGpa).toBeNull();
  });

  // E-3 单门
  it('E-3 单门 90 分：加权分 90、绩点 4.0', () => {
    const r = calcGpa([course(3, 90)]);
    expect(r.totalCredit).toBe(3);
    expect(r.weightedScore).toBeCloseTo(90, 6);
    expect(r.weightedGpa).toBeCloseTo(4.0, 6);
  });

  // E-4 加权（不同学分）
  it('E-4 两门不同学分加权：3 学分的 90 与 2 学分的 80', () => {
    // 90→4.0, 80→3.0；加权绩点 = (4.0*3 + 3.0*2)/5 = 3.6；加权分 = (90*3 + 80*2)/5 = 86
    const r = calcGpa([course(3, 90), course(2, 80)]);
    expect(r.totalCredit).toBe(5);
    expect(r.weightedScore).toBeCloseTo(86, 6);
    expect(r.weightedGpa).toBeCloseTo(3.6, 6);
  });

  // E-5 脏数据过滤：credit / score 非有限数整条剔除
  it('E-5 NaN / Infinity 的课程被剔除，仅以有效课参与计算', () => {
    const dirty: GpaCourse[] = [course(3, 90), course(NaN, 80), course(2, Infinity), course(1, 70)];
    const r = calcGpa(dirty);
    expect(r.courseCount).toBe(2); // 有效：3/90 与 1/70
    expect(r.totalCredit).toBe(4);
    expect(r.weightedScore).toBeCloseTo((90 * 3 + 70 * 1) / 4, 6);
    // 90→4.0，70→2.0（70≥68 落入 2.0 段）；加权绩点 = (4.0*3 + 2.0*1)/4 = 3.5
    expect(r.weightedGpa).toBeCloseTo((4.0 * 3 + 2.0 * 1) / 4, 6);
  });

  // E-6 全是脏数据 → null，不抛
  it('E-6 全是脏数据：回落 null，不抛错', () => {
    const r = calcGpa([course(NaN, 90), course(2, Infinity)]);
    expect(r.courseCount).toBe(0);
    expect(r.weightedScore).toBeNull();
    expect(r.weightedGpa).toBeNull();
  });

  // E-7 越界成绩（如 120）仍参与计算，守卫不拦截业务区间
  it('E-7 成绩 120（越界）仍换算并参与加权，不丢弃', () => {
    const r = calcGpa([course(2, 120)]);
    expect(r.totalCredit).toBe(2);
    expect(r.weightedGpa).toBeCloseTo(4.0, 6); // 120≥90 → 4.0
  });

  // E-8 负学分按 0 计（不拉低/拉高加权分母）
  it('E-8 负学分按 0 处理：仅有效正学分计入总学分', () => {
    const r = calcGpa([course(3, 90), course(-2, 80)]);
    expect(r.totalCredit).toBe(3);
    expect(r.weightedGpa).toBeCloseTo(4.0, 6);
  });

  // E-9 总学分 0 → null
  it('E-9 credit 全为负 → 总学分 0 → null', () => {
    const r = calcGpa([course(-1, 90), course(-2, 80)]);
    expect(r.totalCredit).toBe(0);
    expect(r.weightedGpa).toBeNull();
  });
});

describe('formatGpaNumber / formatCredit', () => {
  it('null → "--"，避免页面出现 NaN', () => {
    expect(formatGpaNumber(null)).toBe('--');
    expect(formatGpaNumber(null, 1)).toBe('--');
  });
  it('非有限数 → "--"', () => {
    expect(formatGpaNumber(NaN)).toBe('--');
    expect(formatGpaNumber(Infinity)).toBe('--');
  });
  it('数字按指定位数格式化', () => {
    expect(formatGpaNumber(3.6, 2)).toBe('3.60');
    expect(formatGpaNumber(4, 1)).toBe('4.0');
  });
  it('formatCredit：整数不带小数点，0.5 步长保留一位', () => {
    expect(formatCredit(4)).toBe('4');
    expect(formatCredit(4.5)).toBe('4.5');
    expect(formatCredit(0)).toBe('0');
    expect(formatCredit(NaN)).toBe('--');
  });
});

describe('isValidCredit / isValidScore', () => {
  it('学分 0–20 合法（含边界与 0.5 步长）；越界 / 非有限非法', () => {
    expect(isValidCredit(0)).toBe(true);
    expect(isValidCredit(20)).toBe(true);
    expect(isValidCredit(0.5)).toBe(true);
    expect(isValidCredit(-0.1)).toBe(false);
    expect(isValidCredit(20.1)).toBe(false);
    expect(isValidCredit(NaN)).toBe(false);
  });
  it('成绩 0–100 合法（含边界）；越界 / 非有限非法', () => {
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(100)).toBe(true);
    expect(isValidScore(-1)).toBe(false);
    expect(isValidScore(101)).toBe(false);
    expect(isValidScore(NaN)).toBe(false);
  });
});

describe('类型守卫 · 不信任脏数据', () => {
  it('isGpaCourse 拒绝缺字段 / 错类型 / 非有限数', () => {
    expect(isGpaCourse({ id: 'a', name: 'x', credit: 3, score: 90, term: '', createdAt: 1 })).toBe(true);
    expect(isGpaCourse(null)).toBe(false);
    expect(isGpaCourse({ id: '', name: 'x', credit: 3, score: 90, term: '', createdAt: 1 })).toBe(false);
    expect(isGpaCourse({ id: 'a', name: 'x', credit: '3', score: 90, term: '', createdAt: 1 })).toBe(false);
    expect(isGpaCourse({ id: 'a', name: 'x', credit: 3, score: NaN, term: '', createdAt: 1 })).toBe(false);
    expect(isGpaCourse({ id: 'a', name: 'x', credit: 3, score: 90, term: 5, createdAt: 1 })).toBe(false);
  });

  it('isGpaData 拒绝非数组 / 版本错 / 含坏课程', () => {
    expect(isGpaData({ version: 1, courses: [] })).toBe(true);
    expect(
      isGpaData({
        version: 1,
        courses: [{ id: 'a', name: 'x', credit: 3, score: 90, term: '', createdAt: 1 }],
      }),
    ).toBe(true);
    expect(isGpaData({ version: 2, courses: [] })).toBe(false);
    expect(isGpaData({ version: 1, courses: 'no' })).toBe(false);
    expect(isGpaData({ version: 1, courses: [null] })).toBe(false);
    expect(isGpaData('nope')).toBe(false);
  });

  it('isLostFoundData 拒绝非数组 / 坏条目 / 错 status', () => {
    expect(isLostFoundData({ version: 1, items: [] })).toBe(true);
    expect(
      isLostFoundData({
        version: 1,
        items: [
          {
            id: 'l',
            kind: 'lost',
            title: 't',
            place: '',
            date: '2026-01-01',
            contact: '',
            note: '',
            status: 'open',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
    ).toBe(true);
    expect(
      isLostFoundData({
        version: 1,
        items: [
          {
            id: 'l',
            kind: 'lost',
            title: 't',
            place: '',
            date: '2026-01-01',
            contact: '',
            note: '',
            status: 'weird',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
    ).toBe(false);
    expect(isLostFoundData({ version: 1, items: [null] })).toBe(false);
    expect(isLostFoundData(null)).toBe(false);
  });
});
