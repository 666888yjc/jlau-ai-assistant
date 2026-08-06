import { describe, expect, it } from 'vitest';
import { detectHumanHandoff, HANDOFF_KEYWORDS } from '../src/llm/handoff';

/**
 * 转人工意图识别单元测试。
 * 覆盖：任务要求的关键词全覆盖、普通问题不误伤、「人工」不误伤「人工智能」。
 */
describe('转人工意图识别（detectHumanHandoff）', () => {
  it('覆盖全部关键词', () => {
    for (const keyword of HANDOFF_KEYWORDS) {
      expect(detectHumanHandoff(`我想${keyword}！`)).toBe(true);
    }
  });

  it('上下文包含关键词即命中', () => {
    expect(detectHumanHandoff('帮我转人工，我要投诉食堂')).toBe(true);
    expect(detectHumanHandoff('能联系老师吗')).toBe(true);
    expect(detectHumanHandoff('保卫处值班电话是多少')).toBe(true);
  });

  it('普通校园问题不误判', () => {
    expect(detectHumanHandoff('报到要带什么')).toBe(false);
    expect(detectHumanHandoff('宿舍怎么分配')).toBe(false);
    expect(detectHumanHandoff('从学校到长春西站怎么走')).toBe(false);
    expect(detectHumanHandoff('学费怎么交')).toBe(false);
  });

  it('「人工智能」等含「人工」的普通词不误伤', () => {
    expect(detectHumanHandoff('什么是人工智能')).toBe(false);
    expect(detectHumanHandoff('有人工智能相关的课程吗')).toBe(false);
  });
});
