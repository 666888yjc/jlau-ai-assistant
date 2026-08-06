// ★ 全站唯一的 localStorage 出入口 ★
// ------------------------------------------------------------------
// 为什么要有这个文件：
//   隐私中心需要「列出 / 导出 / 清除」本应用写入的全部 jxn-* 键。若读写散落在各页面，
//   必然漏键 —— 这是本迭代最可能出现的结构性 bug。因此：
//     1. 所有 jxn-* 读写都必须经过本模块；
//     2. 每个键都必须在 STORAGE_DESCRIPTORS 里登记；
//     3. 即使有人忘了登记，listUnknownKeys() 的运行时扫描也会把它捞出来显示在「其他数据」。
//
// 既有豁免（历史代码，本迭代不改动，本模块只读 / 只清，不代写）：
//   - lib/theme.ts        写 jxn-theme
//   - pages/ChatPage.tsx  写 jxn-conv-<scenarioId>
//
// 硬约束：所有读写都包 try/catch，隐私模式 / 配额溢出时静默降级，绝不抛出、绝不白屏。
// ------------------------------------------------------------------

import {
  isGpaData,
  isLostFoundData,
  isMemoryData,
  isModulesData,
  isProfileData,
} from '../types/local';

/* ================================================================
   0. 键常量
   ================================================================ */

/** 本应用所有本地键的统一前缀 */
export const JXN_PREFIX = 'jxn-';

export const KEY_PROFILE = 'jxn-profile';
export const KEY_MEMORY = 'jxn-memory';
export const KEY_MODULES = 'jxn-modules';
/** 动态键前缀：jxn-conv-<scenarioId> */
export const KEY_CONV_PREFIX = 'jxn-conv-';
/** 由 lib/theme.ts 写入，本模块只读 / 只清 */
export const KEY_THEME = 'jxn-theme';
/** 失物招领记录（P2 模块，经 lib/lostfound.ts 读写） */
export const KEY_LOSTFOUND = 'jxn-lostfound';
/** 绩点课程表（P2 模块，经 lib/gpa.ts 读写） */
export const KEY_GPA = 'jxn-gpa';

/* ================================================================
   1. 描述符注册表（唯一事实源）
   ================================================================ */

export type StorageKind = 'exact' | 'prefix';

export type StorageDescriptorId =
  | 'profile'
  | 'memory'
  | 'modules'
  | 'conversations'
  | 'theme'
  | 'lostfound'
  | 'gpa';

export interface StorageDescriptor {
  /** 稳定 id，隐私中心分项清除以此为准 */
  id: StorageDescriptorId;
  /** exact = 完整键名；prefix = 键名前缀 */
  key: string;
  kind: StorageKind;
  /** 隐私中心展示的中文名 */
  label: string;
  /** 一句话用途 */
  purpose: string;
  /** true = 本模块代写；false = 外部模块写入，此处只读 / 只清 */
  managed: boolean;
  /** 把命中的原始字符串汇总成人类可读摘要，如 '3 条' / '已填写' / '深色' */
  summarize(raws: string[]): string;
}

/** 安全解析：失败返回 undefined（用户可能手改成非法 JSON） */
function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function summarizeProfile(raws: string[]): string {
  const raw = raws[0];
  if (typeof raw !== 'string' || raw.length === 0) return '未填写';
  const parsed = safeParse(raw);
  if (!isProfileData(parsed)) return '数据异常';
  const filled = parsed.nickname.trim() || parsed.major.trim() || parsed.grade;
  return filled ? '已填写' : '未填写';
}

function summarizeMemory(raws: string[]): string {
  const raw = raws[0];
  if (typeof raw !== 'string' || raw.length === 0) return '0 条';
  const parsed = safeParse(raw);
  if (!isMemoryData(parsed)) return '数据异常';
  return `${parsed.items.length} 条`;
}

function summarizeModules(raws: string[]): string {
  const raw = raws[0];
  if (typeof raw !== 'string' || raw.length === 0) return '0 项';
  const parsed = safeParse(raw);
  if (!isModulesData(parsed)) return '数据异常';
  return `${Object.keys(parsed.enabled).length} 项`;
}

function summarizeConversations(raws: string[]): string {
  return `${raws.length} 个场景`;
}

function summarizeTheme(raws: string[]): string {
  const raw = raws[0];
  if (raw === 'dark') return '深色';
  if (raw === 'light') return '浅色';
  return '未设置';
}

function summarizeLostFound(raws: string[]): string {
  const raw = raws[0];
  if (typeof raw !== 'string' || raw.length === 0) return '0 条';
  const parsed = safeParse(raw);
  if (!isLostFoundData(parsed)) return '数据异常';
  return `${parsed.items.length} 条`;
}

function summarizeGpa(raws: string[]): string {
  const raw = raws[0];
  if (typeof raw !== 'string' || raw.length === 0) return '0 门';
  const parsed = safeParse(raw);
  if (!isGpaData(parsed)) return '数据异常';
  return `${parsed.courses.length} 门`;
}

export const STORAGE_DESCRIPTORS: readonly StorageDescriptor[] = [
  {
    id: 'profile',
    key: KEY_PROFILE,
    kind: 'exact',
    label: '学生档案',
    purpose: '用于个性化问候',
    managed: true,
    summarize: summarizeProfile,
  },
  {
    id: 'memory',
    key: KEY_MEMORY,
    kind: 'exact',
    label: '关于我的记忆',
    purpose: '用于问候语中的关怀提示',
    managed: true,
    summarize: summarizeMemory,
  },
  {
    id: 'modules',
    key: KEY_MODULES,
    kind: 'exact',
    label: '模块开关',
    purpose: '记住你开启了哪些模块',
    managed: true,
    summarize: summarizeModules,
  },
  {
    id: 'conversations',
    key: KEY_CONV_PREFIX,
    kind: 'prefix',
    label: '对话记录',
    purpose: '刷新后还能看到聊天历史',
    managed: true,
    summarize: summarizeConversations,
  },
  {
    id: 'theme',
    key: KEY_THEME,
    kind: 'exact',
    label: '主题偏好',
    purpose: '记住你选的浅色 / 深色',
    managed: false,
    summarize: summarizeTheme,
  },
  {
    id: 'lostfound',
    key: KEY_LOSTFOUND,
    kind: 'exact',
    label: '失物招领记录',
    purpose: '你自己记下的丢失与拾到物品',
    managed: true,
    summarize: summarizeLostFound,
  },
  {
    id: 'gpa',
    key: KEY_GPA,
    kind: 'exact',
    label: '绩点课程表',
    purpose: '用于本机估算加权绩点的课程与成绩',
    managed: true,
    summarize: summarizeGpa,
  },
];

/** 未登记键在 inventory / export 中的展示文案 */
export const UNKNOWN_LABEL = '其他数据';
export const UNKNOWN_PURPOSE = '未登记的本地数据';
/** 未登记键的 id 前缀：'unknown:<key>' */
export const UNKNOWN_ID_PREFIX = 'unknown:';

/* ================================================================
   2. 低层读写（全部 try/catch，绝不抛出）
   ================================================================ */

/** 拿不到 localStorage（SSR / 隐私模式 / 被禁用）时返回 null，调用方静默降级 */
function getStore(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 原始字符串读取；不存在或异常返回 null */
function readRaw(key: string): string | null {
  const store = getStore();
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/**
 * 读取并校验 JSON。
 * 解析失败或未通过类型守卫，一律回落 fallback（对应 PRD-P0-01 AC③：手改非法 JSON 页面仍正常）。
 */
export function readJson<T>(key: string, guard: (v: unknown) => v is T, fallback: T): T {
  const raw = readRaw(key);
  if (raw === null || raw.length === 0) return fallback;
  const parsed = safeParse(raw);
  if (parsed === undefined) return fallback;
  return guard(parsed) ? parsed : fallback;
}

/** 写入 JSON；返回是否成功（隐私模式 / 配额溢出时返回 false，调用方给出提示但不崩） */
export function writeJson(key: string, value: unknown): boolean {
  const store = getStore();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 删除单个键；任何异常都吞掉 */
export function removeKey(key: string): void {
  const store = getStore();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* 删除失败不影响其余流程 */
  }
}

/* ================================================================
   3. 枚举 / 审计
   ================================================================ */

/** 运行时所有 jxn- 前缀键（升序，便于稳定渲染） */
export function listJxnKeys(): string[] {
  const store = getStore();
  if (!store) return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i += 1) {
      const k = store.key(i);
      if (typeof k === 'string' && k.startsWith(JXN_PREFIX)) keys.push(k);
    }
  } catch {
    return [];
  }
  return keys.sort();
}

/** 某个键是否被指定描述符覆盖 */
function matches(descriptor: StorageDescriptor, key: string): boolean {
  return descriptor.kind === 'exact' ? key === descriptor.key : key.startsWith(descriptor.key);
}

/** 描述符在运行时实际命中的键（prefix 型可能多条） */
function keysOf(descriptor: StorageDescriptor, allKeys: string[]): string[] {
  return allKeys.filter((k) => matches(descriptor, k));
}

/** 未被任何描述符覆盖的 jxn- 键（漏声明兜底，隐私中心必须渲染） */
export function listUnknownKeys(): string[] {
  return listJxnKeys().filter((k) => !STORAGE_DESCRIPTORS.some((d) => matches(d, k)));
}

/* ================================================================
   4. 隐私中心三件套
   ================================================================ */

export interface InventoryEntry {
  /** 描述符 id，或 'unknown:<key>' */
  id: string;
  label: string;
  purpose: string;
  /** '3 条' / '已填写' / '未填写' */
  summary: string;
  /** 实际命中的键（prefix 型可能多条） */
  keys: string[];
  /** true 时「清除」按钮置灰 */
  empty: boolean;
}

/** 本机存储明细：描述符条目在前（固定顺序），未登记键在后 */
export function inventory(): InventoryEntry[] {
  const allKeys = listJxnKeys();
  const entries: InventoryEntry[] = STORAGE_DESCRIPTORS.map((d) => {
    const keys = keysOf(d, allKeys);
    const raws = keys.map((k) => readRaw(k) ?? '');
    return {
      id: d.id,
      label: d.label,
      purpose: d.purpose,
      summary: d.summarize(raws),
      keys,
      empty: keys.length === 0,
    };
  });

  for (const key of listUnknownKeys()) {
    const raw = readRaw(key) ?? '';
    entries.push({
      id: `${UNKNOWN_ID_PREFIX}${key}`,
      label: `${UNKNOWN_LABEL}（${key}）`,
      purpose: UNKNOWN_PURPOSE,
      summary: `${raw.length} 字符`,
      keys: [key],
      empty: false,
    });
  }

  return entries;
}

export interface ExportItem {
  key: string;
  label: string;
  purpose: string;
  /** 已解析的对象；解析失败时退化为原始字符串 */
  value: unknown;
}

export interface ExportBundle {
  app: 'jixiaonong';
  version: 1;
  /** ISO 8601 */
  exportedAt: string;
  note: string;
  items: ExportItem[];
}

export const EXPORT_NOTE = '本文件由你的浏览器本地导出，未上传任何服务器。';

/** 打包本机全部 jxn-* 数据（含未登记键），零网络请求 */
export function exportAll(): ExportBundle {
  const allKeys = listJxnKeys();
  const items: ExportItem[] = [];

  for (const d of STORAGE_DESCRIPTORS) {
    for (const key of keysOf(d, allKeys)) {
      const raw = readRaw(key);
      if (raw === null) continue;
      const parsed = safeParse(raw);
      items.push({
        key,
        label: d.label,
        purpose: d.purpose,
        value: parsed === undefined ? raw : parsed,
      });
    }
  }

  for (const key of listUnknownKeys()) {
    const raw = readRaw(key);
    if (raw === null) continue;
    const parsed = safeParse(raw);
    items.push({
      key,
      label: UNKNOWN_LABEL,
      purpose: UNKNOWN_PURPOSE,
      value: parsed === undefined ? raw : parsed,
    });
  }

  return {
    app: 'jixiaonong',
    version: 1,
    exportedAt: new Date().toISOString(),
    note: EXPORT_NOTE,
    items,
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 'jixiaonong-data-20260730.json'（本地日期） */
export function exportFileName(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `jixiaonong-data-${y}${m}${day}.json`;
}

/** 分项清除：prefix 型清掉全部命中键；'unknown:<key>' 清掉该单键 */
export function clearById(id: string): void {
  if (id.startsWith(UNKNOWN_ID_PREFIX)) {
    const key = id.slice(UNKNOWN_ID_PREFIX.length);
    if (key.length > 0) removeKey(key);
    return;
  }
  const descriptor = STORAGE_DESCRIPTORS.find((d) => d.id === id);
  if (!descriptor) return;
  for (const key of keysOf(descriptor, listJxnKeys())) removeKey(key);
}

/**
 * 清除全部 jxn-*（含未登记键与 jxn-theme）。
 * ⚠️ 必须基于运行时快照循环删除，不得硬编码键数组 —— 这是「漏键」的第二道闸。
 * ⚠️ 调用方（PrivacyPage）随后必须 applyTheme(getSystemTheme()) 复位 <html>.dark。
 */
export function clearAll(): void {
  for (const key of listJxnKeys()) removeKey(key);
}
