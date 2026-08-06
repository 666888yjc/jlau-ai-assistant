// 失物招领（jxn-lostfound）· 领域层
// ------------------------------------------------------------------
// 职责：
//   1. 读写失物招领记录，写入前按字段上限截断；
//   2. 新增 / 标记已解决 / 删除三种变更统一在本文件收口；
//   3. 上限 LOSTFOUND_MAX 条，触顶不再写入并把原因回传给页面。
//
// 硬约束：
//   - 不直接碰 localStorage，一律经 lib/storage.ts 的 readJson / writeJson；
//   - 任何读取路径都不得抛出：非法 JSON / 守卫不过一律回落空数据。
// ------------------------------------------------------------------

import {
  EMPTY_LOSTFOUND,
  LOSTFOUND_CONTACT_MAX,
  LOSTFOUND_MAX,
  LOSTFOUND_NOTE_MAX,
  LOSTFOUND_PLACE_MAX,
  LOSTFOUND_TITLE_MAX,
  isLostFoundData,
} from '../types/local';
import type { LostFoundData, LostFoundItem, LostFoundKind, LostFoundStatus } from '../types/local';
import { KEY_LOSTFOUND, readJson, writeJson } from './storage';

/** 写入结果；页面据此给出 Toast 文案 */
export type LostFoundAddResult = 'ok' | 'empty' | 'full' | 'storage-failed';

/** 新增时页面提供的字段（id / 时间戳 / 默认状态由本模块补齐） */
export interface LostFoundInput {
  kind: LostFoundKind;
  title: string;
  place: string;
  date: string;
  contact: string;
  note: string;
  /** 不传默认 'open' */
  status?: LostFoundStatus;
}

/** 按「字符数」截断并去掉首尾空白 */
function clamp(text: string, max: number): string {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 'YYYY-MM-DD'（本地日期），新增表单的日期默认值 */
export function todayIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** id 递增序号，避免同一毫秒内连续新增产生重复 id */
let lostFoundSeq = 0;

function createItem(input: LostFoundInput): LostFoundItem {
  lostFoundSeq += 1;
  const now = Date.now();
  const date = clamp(input.date, 10);
  return {
    id: `lf-${now}-${lostFoundSeq}`,
    kind: input.kind,
    title: clamp(input.title, LOSTFOUND_TITLE_MAX),
    place: clamp(input.place, LOSTFOUND_PLACE_MAX),
    date: date.length > 0 ? date : todayIso(),
    contact: clamp(input.contact, LOSTFOUND_CONTACT_MAX),
    note: clamp(input.note, LOSTFOUND_NOTE_MAX),
    status: input.status ?? 'open',
    createdAt: now,
    updatedAt: now,
  };
}

/** 读取全部记录；无数据 / 非法 JSON / 守卫不过一律回落空数据 */
export function readLostFound(): LostFoundData {
  return readJson<LostFoundData>(KEY_LOSTFOUND, isLostFoundData, EMPTY_LOSTFOUND);
}

/** 覆盖写入；超出 LOSTFOUND_MAX 的部分按 createdAt 倒序保留最新的若干条 */
export function writeLostFound(data: LostFoundData): boolean {
  const items = [...data.items]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, LOSTFOUND_MAX);
  return writeJson(KEY_LOSTFOUND, { version: 1, items } satisfies LostFoundData);
}

/** 列表展示顺序：createdAt 倒序（最新在前） */
export function sortedLostFound(items: readonly LostFoundItem[]): LostFoundItem[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 新增一条记录。
 * 校验顺序：标题空白 → 已满 → 写入。标题超长不拒绝，截断后照常写入并返回 'ok'。
 */
export function addLostFoundItem(input: LostFoundInput): LostFoundAddResult {
  if (clamp(input.title, LOSTFOUND_TITLE_MAX).length === 0) return 'empty';

  const data = readLostFound();
  if (data.items.length >= LOSTFOUND_MAX) return 'full';

  const next: LostFoundData = { version: 1, items: [...data.items, createItem(input)] };
  return writeLostFound(next) ? 'ok' : 'storage-failed';
}

/** 标记为已解决；id 不存在或已是 done 时返回 false（不产生无谓写入） */
export function resolveLostFoundItem(id: string): boolean {
  const data = readLostFound();
  let hit = false;
  const items = data.items.map((item) => {
    if (item.id !== id || item.status === 'done') return item;
    hit = true;
    return { ...item, status: 'done' as LostFoundStatus, updatedAt: Date.now() };
  });
  if (!hit) return false;
  return writeLostFound({ version: 1, items });
}

/** 撤销「已解决」，改回进行中；id 不存在或已是 open 时返回 false */
export function reopenLostFoundItem(id: string): boolean {
  const data = readLostFound();
  let hit = false;
  const items = data.items.map((item) => {
    if (item.id !== id || item.status === 'open') return item;
    hit = true;
    return { ...item, status: 'open' as LostFoundStatus, updatedAt: Date.now() };
  });
  if (!hit) return false;
  return writeLostFound({ version: 1, items });
}

/** 删除一条记录；id 不存在时静默返回 false */
export function removeLostFoundItem(id: string): boolean {
  const data = readLostFound();
  const items = data.items.filter((item) => item.id !== id);
  if (items.length === data.items.length) return false;
  return writeLostFound({ version: 1, items });
}

/** 清空全部记录（隐私中心「清除本模块」与页面「清空全部」共用） */
export function clearLostFound(): boolean {
  return writeLostFound(EMPTY_LOSTFOUND);
}
