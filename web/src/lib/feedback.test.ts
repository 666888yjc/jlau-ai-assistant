import { describe, expect, it } from 'vitest';
import { buildFeedbackSnapshot, truncateSnapshot } from './feedback';
import { SNAPSHOT_ANSWER_MAX, SNAPSHOT_QUESTION_MAX } from './config';
import type { UIMessage } from '../types/chat';

/** 构造 UIMessage 的最小夹具（缺省字段由 spread 补齐）。 */
function msg(partial: Partial<UIMessage> & { id: string; role: UIMessage['role']; content: string }): UIMessage {
  return {
    status: 'done',
    ...partial,
  } as UIMessage;
}

describe('buildFeedbackSnapshot（A-2）', () => {
  it('1. 找到 answer + 前一条用户提问 -> 返回 {question, answer}', () => {
    const msgs: UIMessage[] = [
      msg({ id: 'u1', role: 'user', content: '报到要交多少钱？' }),
      msg({ id: 'a1', role: 'assistant', content: '学费需在报到时现场缴纳。' }),
    ];
    expect(buildFeedbackSnapshot(msgs, 'a1')).toEqual({
      question: '报到要交多少钱？',
      answer: '学费需在报到时现场缴纳。',
    });
  });

  it('2. 无前一条用户提问 -> null', () => {
    const msgs: UIMessage[] = [msg({ id: 'a1', role: 'assistant', content: '你好，有什么可以帮你？' })];
    expect(buildFeedbackSnapshot(msgs, 'a1')).toBeNull();
  });

  it('3. 贴纸不算提问：跨过贴纸取前一条真实提问', () => {
    const msgs: UIMessage[] = [
      msg({ id: 'u1', role: 'user', content: '报到要交多少钱？' }),
      msg({ id: 'u2', role: 'user', content: '[贴纸·欢迎]', kind: 'sticker' }),
      msg({ id: 'a1', role: 'assistant', content: '学费需在报到时现场缴纳。' }),
    ];
    expect(buildFeedbackSnapshot(msgs, 'a1')?.question).toBe('报到要交多少钱？');
  });

  it('4. 只有贴纸在前（无真实提问）-> null', () => {
    const msgs: UIMessage[] = [
      msg({ id: 'u1', role: 'user', content: '[贴纸·欢迎]', kind: 'sticker' }),
      msg({ id: 'a1', role: 'assistant', content: '学费需在报到时现场缴纳。' }),
    ];
    expect(buildFeedbackSnapshot(msgs, 'a1')).toBeNull();
  });

  it('5. stopped 气泡仍可取 content', () => {
    const msgs: UIMessage[] = [
      msg({ id: 'u1', role: 'user', content: '宿舍多大？' }),
      msg({ id: 'a1', role: 'assistant', content: '宿舍为四人寝，上床下桌。', stopped: true }),
    ];
    expect(buildFeedbackSnapshot(msgs, 'a1')?.answer).toBe('宿舍为四人寝，上床下桌。');
  });

  it('6. error 气泡仍可取 content', () => {
    const msgs: UIMessage[] = [
      msg({ id: 'u1', role: 'user', content: '食堂几点开？' }),
      msg({ id: 'a1', role: 'assistant', content: '食堂早 6:30 开。', status: 'error' }),
    ];
    expect(buildFeedbackSnapshot(msgs, 'a1')?.answer).toBe('食堂早 6:30 开。');
  });

  it('7. assistantId 不存在 -> null', () => {
    const msgs: UIMessage[] = [msg({ id: 'a1', role: 'assistant', content: '你好' })];
    expect(buildFeedbackSnapshot(msgs, 'a-not-exist')).toBeNull();
  });

  it('8. assistantId 指向 user 消息 -> null', () => {
    const msgs: UIMessage[] = [
      msg({ id: 'u1', role: 'user', content: '报到要交多少钱？' }),
      msg({ id: 'a1', role: 'assistant', content: '学费现场缴纳。' }),
    ];
    expect(buildFeedbackSnapshot(msgs, 'u1')).toBeNull();
  });

  it('9. answer 内容为空 -> null', () => {
    const msgs: UIMessage[] = [
      msg({ id: 'u1', role: 'user', content: '报到要交多少钱？' }),
      msg({ id: 'a1', role: 'assistant', content: '' }),
    ];
    expect(buildFeedbackSnapshot(msgs, 'a1')).toBeNull();
  });

  it('10. 返回前先截断（超长 question/answer 不会触发服务端 400）', () => {
    const msgs: UIMessage[] = [
      msg({ id: 'u1', role: 'user', content: 'q'.repeat(SNAPSHOT_QUESTION_MAX + 500) }),
      msg({ id: 'a1', role: 'assistant', content: 'a'.repeat(SNAPSHOT_ANSWER_MAX + 500) }),
    ];
    const snap = buildFeedbackSnapshot(msgs, 'a1');
    expect(snap?.question.length).toBe(SNAPSHOT_QUESTION_MAX);
    expect(snap?.answer.length).toBe(SNAPSHOT_ANSWER_MAX);
  });
});

describe('truncateSnapshot（A-2 截断边界）', () => {
  it('11. question 超限截断到 2000', () => {
    const r = truncateSnapshot('q'.repeat(SNAPSHOT_QUESTION_MAX + 10), 'a');
    expect(r.question.length).toBe(SNAPSHOT_QUESTION_MAX);
    expect(r.answer).toBe('a');
  });

  it('12. answer 超限截断到 20000', () => {
    const r = truncateSnapshot('q', 'a'.repeat(SNAPSHOT_ANSWER_MAX + 10));
    expect(r.answer.length).toBe(SNAPSHOT_ANSWER_MAX);
    expect(r.question).toBe('q');
  });

  it('13. 短内容原样返回', () => {
    const r = truncateSnapshot('报到要交多少钱', '现场缴纳');
    expect(r).toEqual({ question: '报到要交多少钱', answer: '现场缴纳' });
  });

  it('14. 恰好等于上限不截断', () => {
    const r = truncateSnapshot('q'.repeat(SNAPSHOT_QUESTION_MAX), 'a'.repeat(SNAPSHOT_ANSWER_MAX));
    expect(r.question.length).toBe(SNAPSHOT_QUESTION_MAX);
    expect(r.answer.length).toBe(SNAPSHOT_ANSWER_MAX);
  });
});
