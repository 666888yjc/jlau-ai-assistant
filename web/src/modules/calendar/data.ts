// 校历作息 · 静态数据与倒计时算法
// ------------------------------------------------------------------
// ⚠️ [占位·待官方校历校准]
// 现有本地知识库中没有校历 / 作息条目，本迭代采用中国高校秋季学期「通用模式」
// 生成占位数据集，并在页面底部、版本号、免责文案三处显式标注。
//
// 替换协议（架构 §5.1）：拿到官方校历后，
//   只需替换 TIME_TABLE / MILESTONES 两个数组字面量 + 更新 CALENDAR_DATA_VERSION，
//   页面代码零改动。Milestone.date 必须保持 'YYYY-MM-DD'（含年份），条目无需预排序。
//
// 时区硬约束（架构 §2.4）：
//   一律用 new Date(y, m - 1, d) 本地时区构造，
//   禁止 new Date('2026-09-01') —— 后者按 UTC 解析，东八区会整体偏移一天。
// ------------------------------------------------------------------

export const CALENDAR_DATA_VERSION = '2026-07 [占位·待官方校历校准]';

export const CALENDAR_DISCLAIMER =
  '本页时间为通用模板占位，尚未经学校官方校准，请以吉林农业大学教务处 / 学院官方通知为准。';

export interface TimeSlot {
  id: string;
  period: '上午' | '下午' | '晚上' | '起居';
  /** '1-2节' / '午休' / '熄灯' */
  label: string;
  /** 'HH:MM' */
  start: string;
  /** 无结束时间（如熄灯）时省略 */
  end?: string;
}

export interface Milestone {
  id: string;
  /** 'YYYY-MM-DD'，必须含年份（跨年先后关系依赖它） */
  date: string;
  name: string;
  note?: string;
}

/** 占位作息表（8 条） */
export const TIME_TABLE: readonly TimeSlot[] = [
  { id: 'am-1', period: '上午', label: '1-2 节', start: '08:00', end: '09:40' },
  { id: 'am-2', period: '上午', label: '3-4 节', start: '10:00', end: '11:40' },
  { id: 'noon', period: '起居', label: '午休', start: '12:00', end: '13:30' },
  { id: 'pm-1', period: '下午', label: '5-6 节', start: '13:30', end: '15:10' },
  { id: 'pm-2', period: '下午', label: '7-8 节', start: '15:30', end: '17:10' },
  { id: 'night-1', period: '晚上', label: '9-10 节', start: '18:30', end: '20:10' },
  { id: 'gate', period: '起居', label: '宿舍门禁', start: '22:30' },
  { id: 'lights-out', period: '起居', label: '熄灯', start: '23:00' },
];

/** 占位学期节点（10 条，覆盖跨年） */
export const MILESTONES: readonly Milestone[] = [
  { id: 'checkin', date: '2026-08-29', name: '新生报到', note: '带齐录取通知书与身份证' },
  { id: 'class-start', date: '2026-09-01', name: '正式上课' },
  { id: 'training-start', date: '2026-09-07', name: '军训开始' },
  { id: 'training-end', date: '2026-09-25', name: '军训结束' },
  { id: 'holiday-start', date: '2026-10-01', name: '国庆假期开始' },
  { id: 'holiday-end', date: '2026-10-07', name: '国庆假期结束' },
  { id: 'midterm', date: '2026-11-09', name: '期中教学检查' },
  { id: 'final-start', date: '2027-01-04', name: '期末考试周开始' },
  { id: 'winter-start', date: '2027-01-16', name: '寒假开始' },
  { id: 'spring-checkin', date: '2027-02-22', name: '春季学期报到' },
];

/* ================================================================
   倒计时算法（架构 §2.4）
   ================================================================ */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 把任意 Date 归一到本地零点，消除时分秒对天差的干扰 */
function atLocalMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * 严格解析 'YYYY-MM-DD' 为「本地零点」的 Date。
 * 非法格式（'2026-13-45' / '2026-02-31' / 空串）一律返回 null，调用方过滤该条目。
 */
function parseLocalDate(dateStr: string): Date | null {
  if (typeof dateStr !== 'string') return null;
  const matched = DATE_PATTERN.exec(dateStr);
  if (matched === null) return null;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const parsed = new Date(year, month - 1, day);
  // 回环校验：'2026-02-31' 会被 Date 归一成 3 月 3 日，此处拒掉
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

/**
 * 目标日期距今天的天数：>0 未来 / 0 今天 / <0 已过。
 * 非法日期返回 null。
 */
export function daysUntil(dateStr: string, today: Date = new Date()): number | null {
  const target = parseLocalDate(dateStr);
  if (target === null) return null;
  const base = atLocalMidnight(today);
  return Math.round((target.getTime() - base.getTime()) / 86_400_000);
}

/**
 * 过滤掉非法日期并按日期升序排列。
 * 数据源允许乱序录入，排序统一收敛在这里，页面不再自己排。
 */
export function sortedMilestones(list: readonly Milestone[] = MILESTONES): Milestone[] {
  return list
    .filter((item) => parseLocalDate(item.date) !== null)
    .sort((a, b) => {
      const ta = parseLocalDate(a.date);
      const tb = parseLocalDate(b.date);
      // 上一步已过滤，此处只是让类型收窄；理论上不会命中 0 分支
      if (ta === null || tb === null) return 0;
      return ta.getTime() - tb.getTime();
    });
}

/** 排序后第一条 daysUntil >= 0 的节点；全部已过返回 null（页面据此不渲染横幅） */
export function nextMilestone(
  list: readonly Milestone[] = MILESTONES,
  today: Date = new Date(),
): Milestone | null {
  for (const item of sortedMilestones(list)) {
    const diff = daysUntil(item.date, today);
    if (diff !== null && diff >= 0) return item;
  }
  return null;
}

/** 'YYYY-MM-DD' → 'MM-DD'（列表展示用，非法值原样返回，绝不抛出） */
export function formatMonthDay(dateStr: string): string {
  const matched = DATE_PATTERN.exec(dateStr);
  if (matched === null) return dateStr;
  return `${matched[2]}-${matched[3]}`;
}
