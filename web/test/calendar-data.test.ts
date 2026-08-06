// [QA 临时文件] 测试范围 3：calendar/data.ts 倒计时算法
// 验收依据：架构 §2.4 时区处理 + B1~B7 边界用例表；PRD-P0-05

import { describe, it, expect } from 'vitest';
import {
  daysUntil,
  nextMilestone,
  sortedMilestones,
  formatMonthDay,
  MILESTONES,
  TIME_TABLE,
  CALENDAR_DATA_VERSION,
  CALENDAR_DISCLAIMER,
} from '../src/modules/calendar/data';
import type { Milestone } from '../src/modules/calendar/data';

/** 构造本地时间的「某天某时刻」，用于验证时分秒不影响天差 */
function localDate(y: number, m: number, d: number, h = 12, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

describe('daysUntil —— B1~B7 边界用例表', () => {
  it('B1 跨年：2026-12-31 → 2027-01-04 = 4 天', () => {
    expect(daysUntil('2027-01-04', localDate(2026, 12, 31))).toBe(4);
  });

  it('B1 跨年反向：2027-01-05 看 2027-01-04 = -1 天（已过）', () => {
    expect(daysUntil('2027-01-04', localDate(2027, 1, 5))).toBe(-1);
  });

  it('B2 跨月：2026-08-31 → 2026-09-01 = 1 天', () => {
    expect(daysUntil('2026-09-01', localDate(2026, 8, 31))).toBe(1);
  });

  it('B2 跨月（31 天月末）：2026-10-31 → 2026-11-09 = 9 天', () => {
    expect(daysUntil('2026-11-09', localDate(2026, 10, 31))).toBe(9);
  });

  it('B3 今天：目标日期 = 今天 → 0（非 1、非 -1）', () => {
    expect(daysUntil('2026-09-01', localDate(2026, 9, 1))).toBe(0);
  });

  it('B3 今天：一天内任意时刻（00:00 / 12:00 / 23:59）结果都是 0', () => {
    expect(daysUntil('2026-09-01', localDate(2026, 9, 1, 0, 0))).toBe(0);
    expect(daysUntil('2026-09-01', localDate(2026, 9, 1, 12, 30))).toBe(0);
    expect(daysUntil('2026-09-01', localDate(2026, 9, 1, 23, 59))).toBe(0);
  });

  it('B3 明天：23:59 看明天仍是 1 天（不因时分秒串天）', () => {
    expect(daysUntil('2026-09-02', localDate(2026, 9, 1, 23, 59))).toBe(1);
    expect(daysUntil('2026-09-02', localDate(2026, 9, 1, 0, 1))).toBe(1);
  });

  it('B4 全部已过：今天晚于最后一个里程碑 → nextMilestone 返回 null', () => {
    expect(nextMilestone(MILESTONES, localDate(2027, 3, 1))).toBeNull();
    expect(nextMilestone(MILESTONES, localDate(2030, 1, 1))).toBeNull();
  });

  it('B5 非法日期：格式错 / 月日越界 / 空串 → 返回 null，不抛错', () => {
    const bad = ['', '2026-13-01', '2026-00-10', '2026-09-32', '2026-09-00', '20260901', '2026/09/01', 'abc', '2026-9-1'];
    for (const s of bad) {
      expect(daysUntil(s, localDate(2026, 9, 1))).toBeNull();
    }
  });

  it('B5 非法日期（回环校验）：2026-02-31 被 Date 归一成 3 月，必须拒绝', () => {
    expect(daysUntil('2026-02-31', localDate(2026, 2, 1))).toBeNull();
    expect(daysUntil('2027-02-29', localDate(2027, 2, 1))).toBeNull(); // 2027 非闰年
  });

  it('B5 合法闰日：2028-02-29 是闰日，应正常计算', () => {
    expect(daysUntil('2028-02-29', localDate(2028, 2, 28))).toBe(1);
  });

  it('B6 空数组：nextMilestone([]) 返回 null，sortedMilestones([]) 返回 []', () => {
    expect(nextMilestone([], localDate(2026, 9, 1))).toBeNull();
    expect(sortedMilestones([])).toEqual([]);
  });

  it('B7 【关键·off-by-one】9 月 1 日 00:00 本地时区看 2026-09-01 必须是 0 而不是 -1', () => {
    // 若代码用 new Date('2026-09-01')，会被解析为 UTC 零点；
    // 东八区本地 9/1 00:00 = UTC 8/31 16:00，天差算出来会是 0 或 -1 抖动。
    // 用 new Date(y, m-1, d) 则恒为 0。
    expect(daysUntil('2026-09-01', localDate(2026, 9, 1, 0, 0))).toBe(0);
    expect(daysUntil('2026-09-01', localDate(2026, 9, 1, 7, 59))).toBe(0);
    expect(daysUntil('2026-09-01', localDate(2026, 9, 1, 8, 1))).toBe(0);
  });

  it('B7 【关键·证明使用本地构造】UTC 解析与本地解析结果不同，代码取本地', () => {
    const target = '2026-09-01';
    const today = localDate(2026, 8, 31, 20, 0); // 本地 8/31 20:00
    // 本地语义：距 9/1 还有 1 天
    expect(daysUntil(target, today)).toBe(1);

    // 反证：如果实现用 new Date('2026-09-01')（UTC 零点），
    // 在 UTC+8 环境下 target.getTime() 会比本地零点早 8 小时，
    // Math.round((utcTarget - localMidnight)/86400000) 在 8/31 会得到 1（凑巧），
    // 但在 9/1 当天会得到 0 或 -1。下面这条在 UTC 解析下必然失败：
    expect(daysUntil(target, localDate(2026, 9, 1, 23, 30))).toBe(0);
    // 且往前一天必须严格是 1，往后一天必须严格是 -1，形成连续单调
    expect(daysUntil(target, localDate(2026, 8, 31, 23, 30))).toBe(1);
    expect(daysUntil(target, localDate(2026, 9, 2, 0, 30))).toBe(-1);
  });

  it('B7 连续性：连续 7 天逐日递减 1，无跳变无重复', () => {
    const target = '2026-09-10';
    const seq = [4, 5, 6, 7, 8, 9, 10].map((d) => daysUntil(target, localDate(2026, 9, d, 15, 0)));
    expect(seq).toEqual([6, 5, 4, 3, 2, 1, 0]);
  });

  it('跨越夏令时/月份的长跨度仍精确（2026-08-29 → 2027-02-22）', () => {
    // 2026-08-29 到 2027-02-22 共 177 天
    expect(daysUntil('2027-02-22', localDate(2026, 8, 29))).toBe(177);
  });
});

describe('nextMilestone —— 选取逻辑', () => {
  it('返回第一条 daysUntil >= 0 的节点（今天优先于未来）', () => {
    const m = nextMilestone(MILESTONES, localDate(2026, 9, 1));
    expect(m?.id).toBe('class-start'); // 9-01 当天 diff=0，命中
  });

  it('今天刚好过完某节点，顺延到下一条', () => {
    const m = nextMilestone(MILESTONES, localDate(2026, 9, 2));
    expect(m?.id).toBe('training-start'); // 9-07
  });

  it('学期开始前返回第一条（新生报到）', () => {
    expect(nextMilestone(MILESTONES, localDate(2026, 7, 1))?.id).toBe('checkin');
  });

  it('跨年场景：2026-12-31 返回 2027-01-04 期末考试周开始', () => {
    expect(nextMilestone(MILESTONES, localDate(2026, 12, 31))?.id).toBe('final-start');
  });

  it('乱序录入的数据源仍能正确选出最近节点（排序收敛在 sortedMilestones）', () => {
    const shuffled: Milestone[] = [
      { id: 'c', date: '2026-12-01', name: 'C' },
      { id: 'a', date: '2026-10-01', name: 'A' },
      { id: 'b', date: '2026-11-01', name: 'B' },
    ];
    expect(nextMilestone(shuffled, localDate(2026, 9, 1))?.id).toBe('a');
    expect(sortedMilestones(shuffled).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('含非法日期的数据源：非法条目被过滤，不影响选取', () => {
    const withBad: Milestone[] = [
      { id: 'bad', date: '2026-02-31', name: '坏数据' },
      { id: 'good', date: '2026-10-01', name: '好数据' },
    ];
    expect(sortedMilestones(withBad)).toHaveLength(1);
    expect(nextMilestone(withBad, localDate(2026, 9, 1))?.id).toBe('good');
  });

  it('全部非法 → null，页面不渲染横幅', () => {
    const allBad: Milestone[] = [{ id: 'x', date: 'oops', name: 'X' }];
    expect(nextMilestone(allBad, localDate(2026, 9, 1))).toBeNull();
  });
});

describe('calendar 数据完整性', () => {
  it('MILESTONES 每条都有 id / date / name，且日期全部合法', () => {
    expect(MILESTONES.length).toBeGreaterThan(0);
    for (const m of MILESTONES) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(daysUntil(m.date, localDate(2026, 1, 1))).not.toBeNull();
    }
  });

  it('MILESTONES 的 id 唯一', () => {
    const ids = MILESTONES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('MILESTONES 覆盖跨年（存在 2026 与 2027 两个年份）', () => {
    const years = new Set(MILESTONES.map((m) => m.date.slice(0, 4)));
    expect(years.has('2026')).toBe(true);
    expect(years.has('2027')).toBe(true);
  });

  it('TIME_TABLE 非空且每节课有 id / period / label / 起始时间', () => {
    expect(TIME_TABLE.length).toBeGreaterThan(0);
    for (const s of TIME_TABLE) {
      expect(s.id, `id 缺失: ${JSON.stringify(s)}`).toBeTruthy();
      expect(['上午', '下午', '晚上', '起居'], `period 非法: ${s.period}`).toContain(s.period);
      expect(s.label, `label 缺失: ${s.id}`).toBeTruthy();
      expect(s.start, `start 格式错: ${s.id}`).toMatch(/^\d{2}:\d{2}$/);
      // end 可选（熄灯 / 门禁这类时点没有结束时间）
      if (s.end !== undefined) {
        expect(s.end, `end 格式错: ${s.id}`).toMatch(/^\d{2}:\d{2}$/);
        expect(s.end > s.start, `${s.id} 结束时间不晚于开始时间`).toBe(true);
      }
    }
  });

  it('TIME_TABLE 的 id 唯一', () => {
    const ids = TIME_TABLE.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('数据版本与免责声明存在且明确标注占位（避免误导用户）', () => {
    expect(CALENDAR_DATA_VERSION).toContain('占位');
    expect(CALENDAR_DISCLAIMER.length).toBeGreaterThan(0);
    expect(/[\u4e00-\u9fa5]/.test(CALENDAR_DISCLAIMER)).toBe(true);
  });
});

describe('formatMonthDay', () => {
  it('YYYY-MM-DD → MM-DD', () => {
    expect(formatMonthDay('2026-09-01')).toBe('09-01');
    expect(formatMonthDay('2027-02-22')).toBe('02-22');
  });

  it('非法值原样返回，绝不抛出', () => {
    expect(() => formatMonthDay('oops')).not.toThrow();
    expect(formatMonthDay('oops')).toBe('oops');
    expect(formatMonthDay('')).toBe('');
  });
});
