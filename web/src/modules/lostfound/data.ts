// 失物招领 · 静态常量与展示辅助（无静态条目，条目全部来自本机 localStorage）
// ------------------------------------------------------------------
// 这里只放「文案 + 枚举标签 + 纯展示函数」，
// 读写逻辑在 lib/lostfound.ts，类型与守卫在 types/local.ts。
// ------------------------------------------------------------------

import type { LostFoundKind, LostFoundStatus } from '../../types/local';

/** 类型的中文标签。双通道区分的「文案通道」，颜色只是补充 */
export const LOSTFOUND_KIND_LABEL: Record<LostFoundKind, string> = {
  lost: '我丢了',
  found: '我捡到',
};

/** 表单里 PillRadio 的选项顺序 */
export const LOSTFOUND_KINDS: readonly LostFoundKind[] = ['lost', 'found'];

/** PillRadio 消费的是字符串字面量，这里给出标签数组供其渲染 */
export const LOSTFOUND_KIND_OPTIONS: readonly string[] = [
  LOSTFOUND_KIND_LABEL.lost,
  LOSTFOUND_KIND_LABEL.found,
];

/** 标签 → 类型的反查（PillRadio 回传的是标签文本） */
export function kindFromLabel(label: string): LostFoundKind {
  return label === LOSTFOUND_KIND_LABEL.found ? 'found' : 'lost';
}

/** 卡片左上角的状态标签：已解决时覆盖类型标签 */
export function badgeLabel(kind: LostFoundKind, status: LostFoundStatus): string {
  return status === 'done' ? '已解决' : LOSTFOUND_KIND_LABEL[kind];
}

/** 'YYYY-MM-DD' → 'MM-DD'；格式不符时原样返回，不抛错 */
export function formatMonthDay(date: string): string {
  if (typeof date !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  return m ? `${m[2]}-${m[3]}` : date;
}

/* ---------------- 文案 ---------------- */

export const LOSTFOUND_SUBTITLE = '随手记一笔，别让「好像前几天丢的」成为唯一线索。';

export const LOSTFOUND_EMPTY_TITLE = '还没有记录。';
export const LOSTFOUND_EMPTY_DESC = '丢了东西或捡到东西，先记一笔。';

export const LOSTFOUND_PRIVACY_NOTE =
  '这些记录只保存在这台设备上，不会上传，也不会被其他同学看到。换设备或清除浏览器数据会丢失。';

export const LOSTFOUND_FULL_HINT = '记录已满 50 条，先清理几条再记吧。';
export const LOSTFOUND_EMPTY_TITLE_HINT = '物品名称不能为空。';
export const LOSTFOUND_STORAGE_FAILED_HINT = '这台设备的存储空间写不进去了，清理一些数据再试。';
export const LOSTFOUND_SAVED_HINT = '已记下。';
export const LOSTFOUND_REMOVED_HINT = '已删除。';
export const LOSTFOUND_CLEARED_HINT = '已清空全部记录。';

/** 表单占位符，集中在这里便于统一改文案 */
export const LOSTFOUND_PLACEHOLDER = {
  title: '校园卡 / 蓝色雨伞…',
  place: '三食堂二楼',
  contact: '微信号 / 手机尾号',
  note: '颜色、特征、卡号尾号…',
} as const;
