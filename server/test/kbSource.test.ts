import { describe, expect, it } from 'vitest';
import { extractFirstUrl, retrieve } from '../src/kb/retrieve';

/**
 * 来源 URL 提取回归。
 * 线上真实 Bug：`来源:` 行写成 `名称（https://a/）、名称2（https://b/）` 时，
 * 旧正则未排除全角右括号 `）`，把中间的中文与第二个链接一并吞进第一个 URL，
 * 产出点不开的畸形链接。此处用纯函数 + 真实 KB 文章双重覆盖。
 */

/** 复刻 kb/23-推荐免试研究生保研.md 的 `来源:` 行（双链接 + 全角括号） */
const DOUBLE_LINK_LINE =
  '来源: 吉林农业大学教务处推免通知（https://jwc.jlau.edu.cn/）、' +
  '推荐优秀应届本科毕业生免试攻读硕士学位研究生工作实施办法（https://renwen.jlau.edu.cn/info/1041/1660.htm）';

describe('extractFirstUrl 干净 URL 提取', () => {
  it('全角括号包裹的双链接：只取第一个，且不吞后续中文与第二个链接', () => {
    const url = extractFirstUrl(DOUBLE_LINK_LINE);
    expect(url).toBe('https://jwc.jlau.edu.cn/');
    expect(url).not.toContain('）');
    expect(url).not.toContain('（');
    expect(url).not.toContain('renwen');
  });

  it('半角括号包裹：遇到 ) 即截断', () => {
    expect(extractFirstUrl('来源: 教务处(https://jwc.jlau.edu.cn/)、其它')).toBe('https://jwc.jlau.edu.cn/');
  });

  it('markdown 链接 [文字](url)：正确取出 url 本身', () => {
    expect(extractFirstUrl('详见 [教务处通知](https://jwc.jlau.edu.cn/info/1.htm) 一文')).toBe(
      'https://jwc.jlau.edu.cn/info/1.htm',
    );
  });

  it('裸链接后接空白：正常提取', () => {
    expect(extractFirstUrl('来源: https://renwen.jlau.edu.cn/info/1041/1660.htm 更新于 2026')).toBe(
      'https://renwen.jlau.edu.cn/info/1041/1660.htm',
    );
  });

  it('http 协议同样支持', () => {
    expect(extractFirstUrl('来源: http://example.com/a（备用）')).toBe('http://example.com/a');
  });

  it('无 URL 时返回空串（前端据此渲染静态标签而非坏链接）', () => {
    expect(extractFirstUrl('来源: QQ 美食、喜马拉雅净月大学城美食、腾讯地图 POI')).toBe('');
  });
});

describe('retrieve 返回的来源 URL 均为合法链接或空串', () => {
  it('保研类问题命中的来源不含畸形链接', () => {
    const { sources } = retrieve('保研率是多少');
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      // 要么是干净的 http(s) 链接，要么是空串；绝不能出现全角括号污染
      if (s.url) {
        expect(s.url).toMatch(/^https?:\/\/[^\s()（）[\]<>"']+$/);
      } else {
        expect(s.url).toBe('');
      }
    }
  });

  it('全库来源 URL 无一被全角括号污染', () => {
    const queries = ['保研', '报到流程', '周边美食', '宿舍怎么分配', '选课'];
    for (const q of queries) {
      for (const s of retrieve(q).sources) {
        expect(s.url).not.toContain('（');
        expect(s.url).not.toContain('）');
      }
    }
  });
});
