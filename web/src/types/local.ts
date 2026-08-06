// 本地（localStorage）数据结构与类型守卫。
// ------------------------------------------------------------------
// 硬约束：
// 1. 本文件只声明类型 / 常量 / 守卫，不做任何 I/O —— localStorage 唯一出入口是 lib/storage.ts。
// 2. 所有守卫都必须对 null / 数组 / 缺字段 / 错类型返回 false（用户可以手改 localStorage）。
// 3. 结构一经发布不得破坏性变更；确需变更时提升 LOCAL_SCHEMA_VERSION 并在 storage 层做迁移。
// ------------------------------------------------------------------

export const LOCAL_SCHEMA_VERSION = 1;

/* ================================================================
   jxn-profile · 学生档案
   ================================================================ */

export type Grade = '2026级' | '2025级' | '2024级' | '其他' | '';

/** 可供用户选择的年级（不含 '' 空值，'' 只表示「未选」） */
export const GRADE_OPTIONS: readonly Exclude<Grade, ''>[] = ['2026级', '2025级', '2024级', '其他'];

/** 昵称最大字数，超出写入前截断 */
export const PROFILE_NICKNAME_MAX = 12;
/** 专业最大字数，超出写入前截断 */
export const PROFILE_MAJOR_MAX = 20;

export interface ProfileData {
  version: 1;
  /** ≤ PROFILE_NICKNAME_MAX 字，写入前截断 */
  nickname: string;
  /** ≤ PROFILE_MAJOR_MAX 字，写入前截断 */
  major: string;
  /** '' = 未选 */
  grade: Grade;
  /** Date.now()，0 = 从未保存过 */
  updatedAt: number;
}

/**
 * 空档案。
 * ⚠️ 这是共享的只读常量，任何调用方都不得原地修改它（需要变更时复制一份新对象）。
 */
export const EMPTY_PROFILE: ProfileData = {
  version: 1,
  nickname: '',
  major: '',
  grade: '',
  updatedAt: 0,
};

/* ================================================================
   jxn-memory · 关于我的记忆
   ================================================================ */

/**
 * 记忆来源。
 * chat   = 对话内「记住这条」
 * note   = 笔记批量导入（P1）
 * manual = 档案页手动添加
 */
export type MemorySource = 'chat' | 'note' | 'manual';

export const MEMORY_SOURCES: readonly MemorySource[] = ['chat', 'note', 'manual'];

export interface MemoryItem {
  /** `mem-${Date.now()}-${seq}` */
  id: string;
  /** ≤ MEMORY_TEXT_MAX 字，写入前截断 */
  text: string;
  source: MemorySource;
  createdAt: number;
}

export interface MemoryData {
  version: 1;
  /** 上限 MEMORY_MAX 条 */
  items: MemoryItem[];
}

export const MEMORY_MAX = 50;
export const MEMORY_TEXT_MAX = 100;

/** ⚠️ 只读常量，不得原地修改（含内部 items 数组） */
export const EMPTY_MEMORY: MemoryData = { version: 1, items: [] };

/* ================================================================
   jxn-modules · 模块开关
   ================================================================ */

export interface ModulesData {
  version: 1;
  /** 缺 key 时由 lib/modules 回落到 registry.defaultEnabled */
  enabled: Record<string, boolean>;
}

/** ⚠️ 只读常量，不得原地修改 */
export const EMPTY_MODULES: ModulesData = { version: 1, enabled: {} };

/* ================================================================
   类型守卫
   ================================================================ */

/** 只有「非 null 的普通对象」才继续往下校验；数组一律拒绝 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isGrade(v: unknown): v is Grade {
  return v === '' || v === '2026级' || v === '2025级' || v === '2024级' || v === '其他';
}

export function isMemorySource(v: unknown): v is MemorySource {
  return v === 'chat' || v === 'note' || v === 'manual';
}

export function isProfileData(v: unknown): v is ProfileData {
  if (!isPlainObject(v)) return false;
  if (v.version !== 1) return false;
  if (typeof v.nickname !== 'string') return false;
  if (typeof v.major !== 'string') return false;
  if (!isGrade(v.grade)) return false;
  if (typeof v.updatedAt !== 'number' || !Number.isFinite(v.updatedAt)) return false;
  return true;
}

export function isMemoryItem(v: unknown): v is MemoryItem {
  if (!isPlainObject(v)) return false;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (typeof v.text !== 'string') return false;
  if (!isMemorySource(v.source)) return false;
  if (typeof v.createdAt !== 'number' || !Number.isFinite(v.createdAt)) return false;
  return true;
}

export function isMemoryData(v: unknown): v is MemoryData {
  if (!isPlainObject(v)) return false;
  if (v.version !== 1) return false;
  if (!Array.isArray(v.items)) return false;
  return v.items.every(isMemoryItem);
}

export function isModulesData(v: unknown): v is ModulesData {
  if (!isPlainObject(v)) return false;
  if (v.version !== 1) return false;
  if (!isPlainObject(v.enabled)) return false;
  return Object.values(v.enabled).every((x) => typeof x === 'boolean');
}

/* ================================================================
   jxn-lostfound · 失物招领（P2）
   ================================================================ */

/** lost = 我丢了；found = 我捡到 */
export type LostFoundKind = 'lost' | 'found';
/** open = 进行中；done = 已解决 */
export type LostFoundStatus = 'open' | 'done';

export interface LostFoundItem {
  id: string;
  kind: LostFoundKind;
  /** ≤ LOSTFOUND_TITLE_MAX 字 */
  title: string;
  /** ≤ LOSTFOUND_PLACE_MAX 字，可空 */
  place: string;
  /** 'YYYY-MM-DD'，默认今天 */
  date: string;
  /** ≤ LOSTFOUND_CONTACT_MAX 字，可空 */
  contact: string;
  /** ≤ LOSTFOUND_NOTE_MAX 字，可空 */
  note: string;
  status: LostFoundStatus;
  createdAt: number;
  updatedAt: number;
}

export interface LostFoundData {
  version: 1;
  /** 上限 LOSTFOUND_MAX 条 */
  items: LostFoundItem[];
}

export const LOSTFOUND_MAX = 50;
export const LOSTFOUND_TITLE_MAX = 20;
export const LOSTFOUND_PLACE_MAX = 20;
export const LOSTFOUND_CONTACT_MAX = 30;
export const LOSTFOUND_NOTE_MAX = 100;

/** ⚠️ 只读常量，不得原地修改（含内部 items 数组） */
export const EMPTY_LOSTFOUND: LostFoundData = { version: 1, items: [] };

/* ================================================================
   jxn-gpa · 绩点估算（P2）
   ================================================================ */

export interface GpaCourse {
  id: string;
  /** ≤ GPA_NAME_MAX 字 */
  name: string;
  /** 0–20，允许 0.5 步长 */
  credit: number;
  /** 0–100 */
  score: number;
  /** P0 恒为 ''（P1 按学期分组预留，守卫必须接受空串） */
  term: string;
  createdAt: number;
}

export interface GpaData {
  version: 1;
  /** 上限 GPA_COURSE_MAX 门 */
  courses: GpaCourse[];
}

export const GPA_COURSE_MAX = 60;
export const GPA_NAME_MAX = 20;

/** ⚠️ 只读常量，不得原地修改（含内部 courses 数组） */
export const EMPTY_GPA: GpaData = { version: 1, courses: [] };

/* ================================================================
   P2 类型守卫
   ----------------------------------------------------------------
   守卫只校验「能否安全渲染 / 参与计算」，不校验业务区间
   （如 score 是否落在 0–100）—— 否则一条脏数据会让整段数据被丢弃，
   而 calcGpa / 列表渲染本身对越界值已有兜底。
   ================================================================ */

export function isLostFoundKind(v: unknown): v is LostFoundKind {
  return v === 'lost' || v === 'found';
}

export function isLostFoundStatus(v: unknown): v is LostFoundStatus {
  return v === 'open' || v === 'done';
}

export function isLostFoundItem(v: unknown): v is LostFoundItem {
  if (!isPlainObject(v)) return false;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (!isLostFoundKind(v.kind)) return false;
  if (typeof v.title !== 'string') return false;
  if (typeof v.place !== 'string') return false;
  if (typeof v.date !== 'string') return false;
  if (typeof v.contact !== 'string') return false;
  if (typeof v.note !== 'string') return false;
  if (!isLostFoundStatus(v.status)) return false;
  if (typeof v.createdAt !== 'number' || !Number.isFinite(v.createdAt)) return false;
  if (typeof v.updatedAt !== 'number' || !Number.isFinite(v.updatedAt)) return false;
  return true;
}

export function isLostFoundData(v: unknown): v is LostFoundData {
  if (!isPlainObject(v)) return false;
  if (v.version !== 1) return false;
  if (!Array.isArray(v.items)) return false;
  return v.items.every(isLostFoundItem);
}

export function isGpaCourse(v: unknown): v is GpaCourse {
  if (!isPlainObject(v)) return false;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (typeof v.name !== 'string') return false;
  if (typeof v.credit !== 'number' || !Number.isFinite(v.credit)) return false;
  if (typeof v.score !== 'number' || !Number.isFinite(v.score)) return false;
  // term 在 P0 恒为空串，守卫必须接受 ''
  if (typeof v.term !== 'string') return false;
  if (typeof v.createdAt !== 'number' || !Number.isFinite(v.createdAt)) return false;
  return true;
}

export function isGpaData(v: unknown): v is GpaData {
  if (!isPlainObject(v)) return false;
  if (v.version !== 1) return false;
  if (!Array.isArray(v.courses)) return false;
  return v.courses.every(isGpaCourse);
}
