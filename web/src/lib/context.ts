/**
 * 历史上下文截断（API-2 / UX-7）—— 纯函数，零副作用。
 *
 * ## 为什么需要
 * 现状 `ChatPage.tsx:309-311` 把全部历史无截断上送。会话一长，
 * 请求体线性膨胀 → 弱网下上行耗时暴涨、上游 token 超限直接 5xx。
 *
 * ## 🔒 必须原样保留的既有业务语义
 * `ChatPage.tsx:310` 的过滤条件是 `m.status === 'done' && m.kind !== 'sticker'`：
 * **贴纸消息不得进入 LLM 上下文**（架构 §2.6 约定 4 / §7.5 保护对象）。
 * 这不是性能优化而是业务约束 —— 贴纸是纯表情互动，喂给模型只会污染语义。
 * 本模块把这个过滤原样搬进来，任何改动都属于「改业务功能」，违反本轮硬约束。
 *
 * ## 截断规则（架构 §8 Q1 / Q10）
 *  - 上送 LLM：最近 8 轮 + 6000 字符，超限**从最旧的整轮开始丢**；
 *  - 本地留存：最多 50 条，同样按整轮裁剪。
 *  - 「整轮」= 一个 user 及其后续 assistant 回复。绝不允许把一轮劈成半截 ——
 *    只留 assistant 不留对应 user，模型会看到无来由的回答，比没有上下文更糟。
 */

import type { ChatMessage } from '../types/api';
import { CONTEXT_MAX_CHARS, CONTEXT_MAX_TURNS, HISTORY_MAX_MESSAGES } from './config';

/**
 * 可截断消息的最小结构约定。
 * 刻意用结构化子集而不是直接依赖 UIMessage —— 内核层不该知道 UI 层的类型细节。
 */
export interface TrimmableMessage {
  role: 'user' | 'assistant';
  content: string;
  /** 'done' 之外的状态（streaming/error）不进上下文 */
  status?: string;
  /** 'sticker' 为贴纸消息，永不进入 LLM 上下文 */
  kind?: string;
}

/** 一个完整轮次：一条 user + 其后的 assistant 回复（数量不限，通常为 1）。 */
interface Turn<T> {
  items: T[];
  chars: number;
}

/**
 * 把线性消息序列切成轮次。
 * 每遇到一条 user 就开一轮；首条 user 之前的消息（如欢迎语）自成一轮。
 */
function groupIntoTurns<T extends { role: string; content: string }>(
  msgs: readonly T[],
): Turn<T>[] {
  const turns: Turn<T>[] = [];
  let cur: Turn<T> | null = null;

  for (const m of msgs) {
    if (m.role === 'user' || cur === null) {
      cur = { items: [], chars: 0 };
      turns.push(cur);
    }
    cur.items.push(m);
    cur.chars += m.content.length;
  }
  return turns;
}

/**
 * 生成上送 LLM 的 history。
 *
 * @param msgs     UI 侧完整消息列表
 * @param maxTurns 最大轮数，默认 8（Q1）
 * @param maxChars 最大字符数，默认 6000（Q1）
 */
export function trimHistory(
  msgs: readonly TrimmableMessage[],
  maxTurns: number = CONTEXT_MAX_TURNS,
  maxChars: number = CONTEXT_MAX_CHARS,
): ChatMessage[] {
  // 🔒 既有语义：只取已完成的、非贴纸的消息（ChatPage.tsx:310 原样保留）
  const usable = msgs.filter((m) => m.status === 'done' && m.kind !== 'sticker');
  if (usable.length === 0) return [];

  const turns = groupIntoTurns(usable);

  // ① 轮数窗口：只保留最近 maxTurns 轮
  const windowed = maxTurns > 0 ? turns.slice(-maxTurns) : [];

  // ② 字符预算：从最旧的整轮开始丢，直到进入预算
  let total = windowed.reduce((s, t) => s + t.chars, 0);
  let start = 0;
  while (start < windowed.length && total > maxChars) {
    total -= windowed[start].chars;
    start += 1;
  }

  // 若连最后一轮单独都超预算，这里会把它也丢掉，返回空 history。
  // 这是刻意的：宁可无上下文，也不要构造一个必然被上游拒绝的超长请求
  // （当前用户提问本身走 ChatRequest.message 字段，不受影响，对话仍能继续）。
  const kept = windowed.slice(start);

  return kept.flatMap((t) =>
    t.items.map((m) => ({ role: m.role, content: m.content })),
  );
}

/**
 * 本地留存裁剪（UX-7 / Q10）：保留最近 HISTORY_MAX_MESSAGES 条，按整轮裁剪。
 *
 * 与 trimHistory 的区别：**不做贴纸/状态过滤**。
 * 本地历史是用户看得见的聊天记录，贴纸、失败气泡都属于用户的真实会话，
 * 删掉它们等于篡改用户记录；而 LLM 上下文是喂给模型的，才需要过滤。
 * 这两个语义必须分开，混用是这类代码最容易出的错。
 *
 * @returns 裁剪后的新数组；未超限时**返回原数组引用**，便于调用方跳过写盘。
 */
export function trimStoredMessages<T extends { role: string; content: string }>(
  msgs: readonly T[],
  maxMessages: number = HISTORY_MAX_MESSAGES,
): T[] {
  if (msgs.length <= maxMessages) return msgs as T[];

  const turns = groupIntoTurns(msgs);
  const kept: T[] = [];

  // 从最新的轮次往回收，直到再加一轮就超限
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (kept.length + t.items.length > maxMessages) break;
    kept.unshift(...t.items);
  }

  // 极端情况：最后一轮本身就超过上限（例如一轮里堆了 60 条）。
  // 此时退化为按条数硬截，保证一定能落盘，不至于因为「凑不出完整轮」而丢光记录。
  if (kept.length === 0) return msgs.slice(-maxMessages) as T[];

  return kept;
}

/** 统计一组消息的总字符数，供埋点与调试用。 */
export function countChars(msgs: readonly { content: string }[]): number {
  return msgs.reduce((s, m) => s + m.content.length, 0);
}
