import { newMessageId } from '../utils/id';
import type { ChatInput, Emit } from '../coze/client';

/**
 * 转人工意图识别与响应。
 *
 * 用户表达「我要转人工 / 找老师 / 投诉 / 紧急求助」等意图时，
 * 不应再走普通 LLM 问答（LLM 只会给出泛泛建议），而是直接引导到人工通道：
 * 24 小时值班电话（保卫处）+ 人工服务页按钮。
 *
 * 命中即由 chat 路由在调用大脑（siliconflow/coze/mock）之前拦截：
 * 不触发 KB 检索、不调用任何 LLM。
 */

/** 转人工关键词（可维护列表，供文档/测试引用） */
export const HANDOFF_KEYWORDS: readonly string[] = [
  '转人工',
  '人工客服',
  '人工服务',
  '人工',
  '找老师',
  '找辅导员',
  '联系老师',
  '投诉',
  '紧急求助',
  '值班电话',
];

/**
 * 关键词匹配模式。
 * 「人工」单独出现时需排除「人工智能」等普通词（负向前瞻），
 * 避免把「什么是人工智能」误判成转人工意图。
 */
const HANDOFF_PATTERNS: RegExp[] = HANDOFF_KEYWORDS.map((keyword) =>
  keyword === '人工' ? /人工(?!智能)/ : new RegExp(keyword),
);

/** 判断消息是否表达转人工意图。 */
export function detectHumanHandoff(message: string): boolean {
  return HANDOFF_PATTERNS.some((pattern) => pattern.test(message));
}

/** 转人工通道的联系方式（保卫处 24 小时值班） */
export const HANDOFF_CONTACT = { name: '保卫处（24小时值班）', phone: '0431-84533110' } as const;

/** 转人工友好文案（纯文本；`**` 会由前端 markdown 渲染为加粗） */
export const HANDOFF_TEXT =
  '同学别急，已为你接通人工通道 👉 可拨打 24 小时值班电话 **0431-84533110**（保卫处）或联系辅导员；也可以点下方按钮进入人工服务页';

/**
 * 命中转人工意图时的 SSE 事件序列：token -> fallback（空 guesses）-> done。
 * 与 openapi.yaml 的 fallback 事件结构兼容（guesses 为空数组时前端只显示转人工按钮与联系方式）。
 */
export function emitHumanHandoff(input: ChatInput, emit: Emit): void {
  emit('token', { type: 'token', content: HANDOFF_TEXT });
  emit('fallback', { type: 'fallback', guesses: [], contact: { ...HANDOFF_CONTACT } });
  emit('done', {
    type: 'done',
    conversation_id: input.conversation_id,
    message_id: newMessageId(),
    finish_reason: 'stop',
  });
}
