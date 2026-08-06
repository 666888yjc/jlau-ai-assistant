import { describe, it, expect } from 'vitest';
import { countChars, trimHistory, trimStoredMessages, type TrimmableMessage } from './context';
import { CONTEXT_MAX_CHARS, CONTEXT_MAX_TURNS, HISTORY_MAX_MESSAGES } from './config';

/**
 * 上下文截断单测（T02 验收④：第 30 轮 ≤6KB）。
 *
 * 其中「贴纸过滤」一组是**回归测试而非新功能测试**：
 * `ChatPage.tsx:310` 的 `m.kind !== 'sticker'` 是既有业务约束（架构 §7.5 保护对象），
 * 本轮把它搬进 trimHistory 时必须一字不改。这几例存在的意义就是：
 * 将来谁把它「顺手优化掉」，CI 立刻红。
 */

const u = (content: string, extra: Partial<TrimmableMessage> = {}): TrimmableMessage => ({
  role: 'user',
  content,
  status: 'done',
  ...extra,
});
const a = (content: string, extra: Partial<TrimmableMessage> = {}): TrimmableMessage => ({
  role: 'assistant',
  content,
  status: 'done',
  ...extra,
});

/** 生成 n 轮对话，每轮 user/assistant 各一条。 */
function makeTurns(n: number, charsPerMsg = 10): TrimmableMessage[] {
  const out: TrimmableMessage[] = [];
  for (let i = 0; i < n; i++) {
    out.push(u(`Q${i}`.padEnd(charsPerMsg, '问')));
    out.push(a(`A${i}`.padEnd(charsPerMsg, '答')));
  }
  return out;
}

describe('context: 贴纸过滤语义必须原样保留（🔒 架构 §7.5 保护对象）', () => {
  it('1. 贴纸消息不进入 LLM 上下文', () => {
    const msgs = [u('你好'), a('您好'), u('', { kind: 'sticker' }), a('', { kind: 'sticker' })];
    const out = trimHistory(msgs);
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.content)).toEqual(['你好', '您好']);
  });

  it('2. 贴纸夹在中间时，两侧的正常消息都要保留', () => {
    const msgs = [u('前'), a('前答'), u('贴', { kind: 'sticker' }), u('后'), a('后答')];
    const out = trimHistory(msgs);
    expect(out.map((m) => m.content)).toEqual(['前', '前答', '后', '后答']);
  });

  it('3. 未完成（streaming/error）的消息不进入上下文', () => {
    const msgs = [
      u('已完成'),
      a('已完成答'),
      u('进行中', { status: 'streaming' }),
      a('出错了', { status: 'error' }),
    ];
    const out = trimHistory(msgs);
    expect(out.map((m) => m.content)).toEqual(['已完成', '已完成答']);
  });

  it('4. 全是贴纸时返回空数组而非抛错', () => {
    const msgs = [u('', { kind: 'sticker' }), a('', { kind: 'sticker' })];
    expect(trimHistory(msgs)).toEqual([]);
  });

  it('5. 空输入安全返回空数组', () => {
    expect(trimHistory([])).toEqual([]);
  });
});

describe('context: 轮数窗口（Q1 默认 8 轮）', () => {
  it('6. 默认上限为 8 轮', () => {
    expect(CONTEXT_MAX_TURNS).toBe(8);
  });

  it('7. 少于 8 轮时全量保留', () => {
    const msgs = makeTurns(3);
    expect(trimHistory(msgs)).toHaveLength(6);
  });

  it('8. 恰好 8 轮时全量保留（边界不误伤）', () => {
    const msgs = makeTurns(8);
    expect(trimHistory(msgs)).toHaveLength(16);
  });

  it('9. 超过 8 轮时只保留最近 8 轮，且保留的是最新的那批', () => {
    const msgs = makeTurns(20);
    const out = trimHistory(msgs);
    expect(out).toHaveLength(16);
    expect(out[0].content).toContain('Q12');
    expect(out[out.length - 1].content).toContain('A19');
  });

  it('10. maxTurns=0 时返回空（可用于「不带上下文」模式）', () => {
    expect(trimHistory(makeTurns(5), 0)).toEqual([]);
  });
});

describe('context: 字符预算（Q1 默认 6000 字符）', () => {
  it('11. 默认上限为 6000 字符', () => {
    expect(CONTEXT_MAX_CHARS).toBe(6000);
  });

  it('12. 【验收④】第 30 轮时输出 ≤6000 字符', () => {
    // 每条 500 字符 × 2 条/轮 × 30 轮 = 30000 字符，远超预算
    const msgs = makeTurns(30, 500);
    const out = trimHistory(msgs);
    expect(countChars(out)).toBeLessThanOrEqual(CONTEXT_MAX_CHARS);
  });

  it('13. 超预算时从最旧的整轮开始丢，保留的一定是最新的内容', () => {
    const msgs = makeTurns(10, 500); // 10 轮 × 1000 字符/轮
    const out = trimHistory(msgs);
    expect(countChars(out)).toBeLessThanOrEqual(CONTEXT_MAX_CHARS);
    // 最后一条一定是最新那轮的 assistant
    expect(out[out.length - 1].content).toContain('A9');
  });

  it('14. 绝不切断 user/assistant 配对 —— 输出必以 user 开头、assistant 结尾', () => {
    const msgs = makeTurns(30, 500);
    const out = trimHistory(msgs);
    if (out.length > 0) {
      expect(out[0].role).toBe('user');
      expect(out[out.length - 1].role).toBe('assistant');
      expect(out.length % 2).toBe(0);
    }
  });

  it('15. 单轮即超预算时宁可返回空，也不构造必被上游拒绝的超长请求', () => {
    const msgs = [u('x'.repeat(9000)), a('y'.repeat(9000))];
    const out = trimHistory(msgs);
    expect(out).toEqual([]);
  });

  it('16. 恰好等于预算时不触发裁剪（边界不误伤）', () => {
    // 2 轮 × 2 条 × 1500 = 6000，正好等于上限
    const msgs = makeTurns(2, 1500);
    expect(countChars(trimHistory(msgs))).toBe(CONTEXT_MAX_CHARS);
    expect(trimHistory(msgs)).toHaveLength(4);
  });

  it('17. 自定义预算参数生效', () => {
    const msgs = makeTurns(10, 100);
    const out = trimHistory(msgs, 8, 400);
    expect(countChars(out)).toBeLessThanOrEqual(400);
  });

  it('18. 轮数与字符双重约束同时生效，取更严的那个', () => {
    const msgs = makeTurns(20, 500);
    const out = trimHistory(msgs, 8, 2000);
    expect(out.length).toBeLessThanOrEqual(16); // 轮数约束
    expect(countChars(out)).toBeLessThanOrEqual(2000); // 字符约束
  });
});

describe('context: 首条 assistant 欢迎语的处理', () => {
  it('19. 首条 user 之前的欢迎语自成一轮，不会被错误地并进第一问', () => {
    const msgs = [a('欢迎使用吉小农'), u('报到带什么'), a('带录取通知书')];
    const out = trimHistory(msgs, 8, 6000);
    expect(out).toHaveLength(3);
    expect(out[0].content).toBe('欢迎使用吉小农');
  });

  it('20. 轮数收紧到 1 时，只剩最后一轮，欢迎语被丢弃', () => {
    const msgs = [a('欢迎'), u('问题'), a('回答')];
    const out = trimHistory(msgs, 1, 6000);
    expect(out.map((m) => m.content)).toEqual(['问题', '回答']);
  });
});

describe('context: 本地留存裁剪（UX-7 / Q10）', () => {
  it('21. 默认上限为 50 条', () => {
    expect(HISTORY_MAX_MESSAGES).toBe(50);
  });

  it('22. 未超限时原样返回（同一引用，便于调用方跳过写盘）', () => {
    const msgs = makeTurns(5);
    expect(trimStoredMessages(msgs)).toBe(msgs);
  });

  it('23. 超限时裁到 ≤50 条', () => {
    const msgs = makeTurns(40); // 80 条
    const out = trimStoredMessages(msgs);
    expect(out.length).toBeLessThanOrEqual(HISTORY_MAX_MESSAGES);
  });

  it('24. 裁剪保留最新内容并保持完整轮次', () => {
    const msgs = makeTurns(40);
    const out = trimStoredMessages(msgs);
    expect(out[0].role).toBe('user');
    expect(out[out.length - 1].content).toContain('A39');
    expect(out.length % 2).toBe(0);
  });

  it('25. 与 trimHistory 不同：本地留存**不过滤**贴纸与失败消息（那是用户的真实记录）', () => {
    const msgs = [
      u('问'),
      a('答'),
      u('', { kind: 'sticker' }),
      a('失败了', { status: 'error' }),
    ];
    const out = trimStoredMessages(msgs, 50);
    expect(out).toHaveLength(4);
  });

  it('26. 单轮条数就超过上限时退化为按条数硬截，保证仍能落盘', () => {
    const msgs: TrimmableMessage[] = [u('起手')];
    for (let i = 0; i < 60; i++) msgs.push(a(`连续回复${i}`));
    const out = trimStoredMessages(msgs, 10);
    expect(out).toHaveLength(10);
    expect(out[out.length - 1].content).toBe('连续回复59');
  });

  it('27. 自定义上限生效', () => {
    const msgs = makeTurns(20);
    expect(trimStoredMessages(msgs, 8).length).toBeLessThanOrEqual(8);
  });
});

describe('context: 工具函数', () => {
  it('28. countChars 统计总字符数', () => {
    expect(countChars([{ content: 'abc' }, { content: '中文' }])).toBe(5);
    expect(countChars([])).toBe(0);
  });
});
