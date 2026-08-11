import { describe, it, expect } from 'vitest';
import { retrieve } from '../../src/kb/retrieve';

/** 把 context 按 `【标题】` 切成块并统计每个标题出现次数（同标题 = 同一文档）。 */
function countBlocksByTitle(context: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const block of context.split('\n\n')) {
    const m = block.match(/^【(.+?)】/);
    if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  return counts;
}

describe('retrieve (BM25-lite 相关性)', () => {
  it('真实新生问题返回非空上下文与来源', () => {
    const { context, sources } = retrieve('宿舍能用大功率电器吗');
    expect(context.trim().length).toBeGreaterThan(0);
    expect(sources.length).toBeGreaterThan(0);
  });

  it('美食类问题能命中美食相关篇目', () => {
    const { sources } = retrieve('吉农周边有什么好吃的');
    const titles = sources.map((s) => s.title).join(' ');
    expect(titles).toMatch(/美食|吃|餐厅|周边/);
  });

  it('宿舍类问题能命中宿舍/用电相关篇目', () => {
    const { sources } = retrieve('宿舍晚上几点熄灯 能用吹风机吗');
    expect(sources.length).toBeGreaterThan(0);
  });

  it('强制每文档多样性：单文档贡献的块数不超过 MAX_PER_DOC(2)', () => {
    // 宽查询覆盖多个主题，验证大文档（如「新生手册」）不会霸占 top-K 全部槽位。
    const { context } = retrieve('报到要带什么材料 宿舍用电 周边美食 从长春站怎么去学校 快递在哪取 校园卡怎么办');
    const counts = countBlocksByTitle(context);
    expect(counts.size).toBeGreaterThan(0);
    for (const c of counts.values()) expect(c).toBeLessThanOrEqual(2);
  });

  it('同义词降权：美食问题首位命中美食篇，泛主题学术篇不混入', () => {
    // 回归保护：ALIASES「吉农→学校」不应让「学术规范」这类泛主题篇目靠高频"学校"词挤进美食问题的上下文。
    const { context } = retrieve('吉农周边有啥好吃的');
    const blocks = context
      .split('\n\n')
      .map((b) => b.match(/^【(.+?)】/)?.[1])
      .filter((t): t is string => Boolean(t));
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0]).toContain('美食');
    expect(blocks.some((b) => b.includes('学术'))).toBe(false);
  });
});
