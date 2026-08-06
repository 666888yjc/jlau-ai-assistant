// 学生档案 + 关于我的记忆 · 领域层
// ------------------------------------------------------------------
// 职责：
//   1. 档案（jxn-profile）读写，写入前按 12 / 20 字截断；
//   2. 记忆（jxn-memory）增删读，五种校验统一在 addMemory 这一把闸里；
//   3. buildGreeting —— 纯函数问候语降级链。
//
// 硬约束：
//   - 本文件不直接碰 localStorage，一律经 lib/storage.ts。
//   - buildGreeting 的产物「只能」进入 JSX 渲染，禁止进入 streamChat 的任何参数。
//   - buildGreeting 内部不读存储、不做除入参外的副作用，随机源来自可注入的 seed。
// ------------------------------------------------------------------

import {
  EMPTY_MEMORY,
  EMPTY_PROFILE,
  MEMORY_MAX,
  MEMORY_TEXT_MAX,
  PROFILE_MAJOR_MAX,
  PROFILE_NICKNAME_MAX,
  isMemoryData,
  isProfileData,
} from '../types/local';
import type { Grade, MemoryData, MemoryItem, MemorySource, ProfileData } from '../types/local';
import { KEY_MEMORY, KEY_PROFILE, readJson, writeJson } from './storage';

/* ================================================================
   1. 档案
   ================================================================ */

/** 按「字符数」截断并去掉首尾空白 */
function clamp(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** 读取档案；无数据 / 非法 JSON / 守卫不过一律回落空档案，绝不抛出 */
export function readProfile(): ProfileData {
  return readJson<ProfileData>(KEY_PROFILE, isProfileData, EMPTY_PROFILE);
}

/**
 * 写入档案。昵称截断到 12 字、专业截断到 20 字，updatedAt 由本函数打戳。
 * 返回是否写入成功（隐私模式 / 配额溢出时为 false）。
 */
export function writeProfile(input: { nickname: string; major: string; grade: Grade }): boolean {
  const next: ProfileData = {
    version: 1,
    nickname: clamp(input.nickname, PROFILE_NICKNAME_MAX),
    major: clamp(input.major, PROFILE_MAJOR_MAX),
    grade: input.grade,
    updatedAt: Date.now(),
  };
  return writeJson(KEY_PROFILE, next);
}

/** 档案是否「已填写」（任一字段有值）。用于 /modules 摘要卡的引导态判定 */
export function isProfileFilled(p: ProfileData): boolean {
  return p.nickname.trim().length > 0 || p.major.trim().length > 0 || p.grade.length > 0;
}

/* ================================================================
   2. 记忆
   ================================================================ */

export type MemoryAddResult = 'ok' | 'duplicate' | 'full' | 'empty' | 'storage-failed';

export interface MemoryBatchResult {
  added: number;
  skipped: number;
  /** 造成跳过的主要原因；全部成功时为 null */
  reason: MemoryAddResult | null;
}

/** 记忆写入前的统一归一化：去首尾空白 + 截断到 100 字 */
export function normalizeMemoryText(text: string): string {
  return clamp(text, MEMORY_TEXT_MAX);
}

/** 调用方据此决定是否提示「太长啦，已保留前 100 字」 */
export function isMemoryTextTruncated(text: string): boolean {
  return text.trim().length > MEMORY_TEXT_MAX;
}

/** id 递增序号，避免同一毫秒内批量导入产生重复 id */
let memorySeq = 0;

function createMemoryItem(text: string, source: MemorySource): MemoryItem {
  memorySeq += 1;
  return {
    id: `mem-${Date.now()}-${memorySeq}`,
    text,
    source,
    createdAt: Date.now(),
  };
}

/** 读取记忆；无数据 / 非法 JSON 一律回落空记忆 */
export function readMemory(): MemoryData {
  return readJson<MemoryData>(KEY_MEMORY, isMemoryData, EMPTY_MEMORY);
}

/**
 * 新增一条记忆。三处入口（对话「记住这条」/ 档案页手动添加 / 笔记导入）共用这把闸。
 *
 * 校验顺序与架构 §6.3 时序图一致：空白 → 已满 → 重复 → 写入。
 * 超长不拒绝，截断到 100 字后照常写入并返回 'ok'。
 */
export function addMemory(text: string, source: MemorySource): MemoryAddResult {
  const normalized = normalizeMemoryText(text);
  if (normalized.length === 0) return 'empty';

  const data = readMemory();
  if (data.items.length >= MEMORY_MAX) return 'full';
  if (data.items.some((item) => item.text === normalized)) return 'duplicate';

  const next: MemoryData = {
    version: 1,
    items: [...data.items, createMemoryItem(normalized, source)],
  };
  return writeJson(KEY_MEMORY, next) ? 'ok' : 'storage-failed';
}

/**
 * 批量新增（笔记导入 P1）。
 * 一次读、一次写；触顶时只导入前 N 条，已导入部分不回滚。
 */
export function addMemoryBatch(texts: string[], source: MemorySource): MemoryBatchResult {
  const data = readMemory();
  const items: MemoryItem[] = [...data.items];
  let added = 0;
  let skipped = 0;
  let reason: MemoryAddResult | null = null;

  for (const raw of texts) {
    const normalized = normalizeMemoryText(raw);
    if (normalized.length === 0) {
      skipped += 1;
      reason = reason ?? 'empty';
      continue;
    }
    if (items.length >= MEMORY_MAX) {
      skipped += 1;
      // 'full' 是最需要告知用户的原因，优先级高于 empty / duplicate
      reason = 'full';
      continue;
    }
    if (items.some((item) => item.text === normalized)) {
      skipped += 1;
      reason = reason ?? 'duplicate';
      continue;
    }
    items.push(createMemoryItem(normalized, source));
    added += 1;
  }

  if (added === 0) return { added: 0, skipped, reason };

  const ok = writeJson(KEY_MEMORY, { version: 1, items } satisfies MemoryData);
  if (!ok) return { added: 0, skipped: skipped + added, reason: 'storage-failed' };
  return { added, skipped, reason };
}

/** 删除一条记忆；id 不存在时静默返回 */
export function removeMemory(id: string): void {
  const data = readMemory();
  const items = data.items.filter((item) => item.id !== id);
  if (items.length === data.items.length) return;
  writeJson(KEY_MEMORY, { version: 1, items } satisfies MemoryData);
}

/* ================================================================
   3. 问候语
   ================================================================ */

/** 全空时的原文案，与改动前 ChatPage.tsx:13 的 WELCOME_TEXT 逐字一致 */
export const DEFAULT_GREETING =
  '同学你好，我是吉小农，吉林农业大学的一站式校园 AI 助手，随时问我～';

/** 问候语里回显记忆原文的展示上限，超出补省略号 */
export const GREETING_MEMORY_MAX = 24;

function truncateForGreeting(text: string): string {
  const t = text.trim();
  return t.length > GREETING_MEMORY_MAX ? `${t.slice(0, GREETING_MEMORY_MAX)}…` : t;
}

/**
 * 拼装个性化问候语（纯函数）。
 *
 * 降级链（逐级叠加，任一级缺失即跳过该级）：
 *   L0  三项全空                 → 直接返回 DEFAULT_GREETING（整句原文案，不拼接）
 *   L1a nickname 非空            → 「{nickname}，你好呀～」
 *   L1b nickname 空但 L0 不成立  → 「同学你好，我是吉小农。」
 *   L2  major 非空               → 追加「{major}的事，我也知道一点。」
 *   L3  items 非空               → 追加「记得你说过：{记忆原文}。」
 *
 * @param seed 用于稳定地从记忆库挑一条。默认按天稳定 —— 同一天同一句，
 *             避免每次 render 抖动，也便于测试注入。
 */
export function buildGreeting(
  profile: ProfileData,
  memory: MemoryData,
  seed: number = Math.floor(Date.now() / 86_400_000),
): string {
  const nickname = profile.nickname.trim();
  const major = profile.major.trim();
  const items = memory.items.filter((item) => item.text.trim().length > 0);

  // L0：全空 → 原文案逐字返回
  if (nickname.length === 0 && major.length === 0 && items.length === 0) {
    return DEFAULT_GREETING;
  }

  // L1
  let text = nickname.length > 0 ? `${nickname}，你好呀～` : '同学你好，我是吉小农。';

  // L2
  if (major.length > 0) {
    text += `${major}的事，我也知道一点。`;
  }

  // L3
  if (items.length > 0) {
    const safeSeed = Number.isFinite(seed) ? Math.abs(Math.floor(seed)) : 0;
    const picked = items[safeSeed % items.length];
    text += `记得你说过：${truncateForGreeting(picked.text)}。`;
  }

  return text;
}
