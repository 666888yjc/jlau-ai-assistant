/**
 * feedback.ts —— 反馈问答快照构建（方案 A A-2）纯函数层。
 *
 * 为什么抽成纯函数：A-2 的正确性（「报错」时快照取该条 AI 回答 + 其前一条用户提问，
 * 贴纸不算提问）是 PRD AC-A2.1/2.4 的直接验收点，必须可被 vitest 覆盖。
 * 本文件零副作用：不 import react、不碰 fetch/window/localStorage（架构 §7.2），
 * 可测性一票否决项。
 */

import { lastUserBefore } from './chat-core';
import { SNAPSHOT_ANSWER_MAX, SNAPSHOT_QUESTION_MAX } from './config';
import type { UIMessage } from '../types/chat';

export interface FeedbackSnapshot {
  question: string;
  answer: string;
}

/**
 * 朴素截断：CJK 无词边界需求，`slice(0, max)` 即可（架构 §7.3）。
 * 前端正常路径先截断再提交 → 永不触发服务端 4004（AC-A2.4）。
 * 短内容与恰好等于上限时原样返回（零拷贝）。
 */
export function truncateSnapshot(question: string, answer: string): FeedbackSnapshot {
  return {
    question: question.length > SNAPSHOT_QUESTION_MAX ? question.slice(0, SNAPSHOT_QUESTION_MAX) : question,
    answer: answer.length > SNAPSHOT_ANSWER_MAX ? answer.slice(0, SNAPSHOT_ANSWER_MAX) : answer,
  };
}

/**
 * 构建「报错」反馈的问答快照（AC-A2.1）：
 *  - answer = `assistantId` 对应的 assistant 消息 content（status 不限：done/stopped/error
 *    气泡只要有内容都可取，见 §8.1 测试约定）；
 *  - question = 该条回答之前的**最近一条用户提问**（复用 chat-core `lastUserBefore`，
 *    贴纸不算提问）；
 *  - 任一缺失（找不到消息 / 不是 assistant / 无前问 / 内容为空）→ 返回 null，
 *    调用方据此不携带 snapshot（与旧版行为一致）。
 * 返回前先截断，保证前端正常路径永不触发 400（AC-A2.4）。
 */
export function buildFeedbackSnapshot(
  msgs: readonly UIMessage[],
  assistantId: string,
): FeedbackSnapshot | null {
  const answerMsg = msgs.find((m) => m.id === assistantId);
  if (!answerMsg || answerMsg.role !== 'assistant') return null;
  if (typeof answerMsg.content !== 'string' || answerMsg.content === '') return null;

  const questionMsg = lastUserBefore(msgs, assistantId);
  if (!questionMsg) return null;
  if (typeof questionMsg.content !== 'string' || questionMsg.content === '') return null;

  return truncateSnapshot(questionMsg.content, answerMsg.content);
}
