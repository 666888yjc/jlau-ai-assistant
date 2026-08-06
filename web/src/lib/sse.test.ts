import { describe, it, expect } from 'vitest';
import { createParser, feed, finish, parseAll } from './sse';
import type { TokenEvent } from '../types/api';

/**
 * SSE 解析器单测（T02 验收①：≥10 例，覆盖 4 类畸形帧 + 跨 chunk 边界 + CRLF + 注释行）。
 *
 * 这套测试的真正目的不是「覆盖率好看」，而是锁死一条产品级不变量：
 * **任何一帧内容都不许无声消失**。ERR-3 是本产品唯一会造成线下实体损失的缺陷 ——
 * 学生照着缺片段的回答去执行，可能漏带材料或跑错地点。
 * 所以每一个「解析不了」的分支，都必须能在 degradedCount 里被数出来。
 */

/** 构造一条服务端格式的事件文本（与 server/src/utils/response.ts sendEvent 一致）。 */
function frame(event: string, data: unknown, eol = '\n'): string {
  return `event: ${event}${eol}data: ${JSON.stringify(data)}${eol}${eol}`;
}

const tok = (content: string) => ({ type: 'token', content });

describe('sse: 正常解析', () => {
  it('1. 解析 LF 分隔的单个 token 事件', () => {
    const r = parseAll(frame('token', tok('你好')));
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toEqual({ type: 'token', content: '你好' });
    expect(r.degradedCount).toBe(0);
  });

  it('2. 解析连续多个事件并保持顺序', () => {
    const text =
      frame('token', tok('报到')) +
      frame('token', tok('需要')) +
      frame('token', tok('带材料')) +
      frame('done', { type: 'done', conversation_id: 'c1', message_id: 'm1', finish_reason: 'stop' });

    const r = parseAll(text);
    expect(r.degradedCount).toBe(0);
    expect(r.events).toHaveLength(4);
    expect(r.events.slice(0, 3).map((e) => (e as TokenEvent).content)).toEqual([
      '报到',
      '需要',
      '带材料',
    ]);
    expect(r.events[3].type).toBe('done');
  });

  it('3. 兼容 CRLF（\\r\\n\\r\\n）分隔 —— 原实现在此处整流卡死', () => {
    const text = frame('token', tok('CRLF-A'), '\r\n') + frame('token', tok('CRLF-B'), '\r\n');
    const r = parseAll(text);
    expect(r.degradedCount).toBe(0);
    expect(r.events.map((e) => (e as TokenEvent).content)).toEqual(['CRLF-A', 'CRLF-B']);
  });

  it('4. 兼容纯 CR（\\r\\r）分隔', () => {
    const text = frame('token', tok('CR-A'), '\r') + frame('token', tok('CR-B'), '\r');
    const r = parseAll(text);
    expect(r.degradedCount).toBe(0);
    expect(r.events.map((e) => (e as TokenEvent).content)).toEqual(['CR-A', 'CR-B']);
  });

  it('5. 兼容同一条流里混用 LF 与 CRLF', () => {
    const text = frame('token', tok('mix-1'), '\n') + frame('token', tok('mix-2'), '\r\n');
    const r = parseAll(text);
    expect(r.degradedCount).toBe(0);
    expect(r.events.map((e) => (e as TokenEvent).content)).toEqual(['mix-1', 'mix-2']);
  });
});

describe('sse: 跨 chunk 边界', () => {
  it('6. 事件被切成任意两段仍能正确还原（逐字节切分全遍历）', () => {
    const text = frame('token', tok('跨块')) + frame('token', tok('还原'));

    for (let cut = 1; cut < text.length; cut++) {
      const st = createParser();
      const a = feed(st, text.slice(0, cut));
      const b = feed(st, text.slice(cut));
      const c = finish(st);
      const all = [...a.events, ...b.events, ...c.events];
      const deg = a.degradedCount + b.degradedCount + c.degradedCount;

      expect(deg, `切点 ${cut} 不应产生降级`).toBe(0);
      expect(all.map((e) => (e as TokenEvent).content), `切点 ${cut}`).toEqual(['跨块', '还原']);
    }
  });

  it('7. CRLF 恰好被劈成 \\r | \\n 时不丢帧（暂扣孤立 CR 的分支）', () => {
    const text = frame('token', tok('劈开'), '\r\n');
    const cut = text.indexOf('\r\n\r\n') + 3; // 落在最后一个 \r 与 \n 之间

    const st = createParser();
    const a = feed(st, text.slice(0, cut));
    expect(a.events).toHaveLength(0); // 边界未定，先不吐

    const b = feed(st, text.slice(cut));
    const c = finish(st);
    expect([...a.events, ...b.events, ...c.events].map((e) => (e as TokenEvent).content)).toEqual([
      '劈开',
    ]);
    expect(a.degradedCount + b.degradedCount + c.degradedCount).toBe(0);
  });

  it('8. 逐字符投喂（极端小 chunk）不丢内容', () => {
    const text = frame('token', tok('一字一喂')) + frame('done', { type: 'done' });
    const st = createParser();
    const got: unknown[] = [];
    let deg = 0;
    for (const ch of text) {
      const r = feed(st, ch);
      got.push(...r.events);
      deg += r.degradedCount;
    }
    const f = finish(st);
    got.push(...f.events);
    deg += f.degradedCount;

    expect(deg).toBe(0);
    expect(got).toHaveLength(2);
    expect((got[0] as TokenEvent).content).toBe('一字一喂');
  });
});

describe('sse: 控制行与注释行', () => {
  it('9. 忽略 `:` 注释行（keep-alive 心跳）且不计入降级', () => {
    const text = ': keep-alive\n\n' + frame('token', tok('心跳后')) + ':\n\n';
    const r = parseAll(text);
    expect(r.degradedCount).toBe(0);
    expect(r.events).toHaveLength(1);
    expect((r.events[0] as TokenEvent).content).toBe('心跳后');
  });

  it('10. 识别并消费 id: 与 retry: 字段，不当作内容也不当作降级', () => {
    const st = createParser();
    const r = feed(st, 'id: 42\nretry: 3000\nevent: token\ndata: {"type":"token","content":"带控制行"}\n\n');
    expect(r.degradedCount).toBe(0);
    expect(r.events).toHaveLength(1);
    expect(st.lastEventId).toBe('42');
    expect(st.retryMs).toBe(3000);
  });

  it('11. 只有 id/retry 没有 data 的控制块不产生事件也不算丢帧', () => {
    const r = parseAll('id: 7\nretry: 1000\n\n');
    expect(r.events).toHaveLength(0);
    expect(r.degradedCount).toBe(0);
  });

  it('12. 空 data（心跳形式 `data:`）不算丢帧', () => {
    const r = parseAll('event: ping\ndata:\n\n');
    expect(r.events).toHaveLength(0);
    expect(r.degradedCount).toBe(0);
  });

  it('13. 未知字段按规范忽略，不污染 degraded 指标', () => {
    const r = parseAll('foo: bar\nevent: token\ndata: {"type":"token","content":"未知字段"}\n\n');
    expect(r.degradedCount).toBe(0);
    expect((r.events[0] as TokenEvent).content).toBe('未知字段');
  });
});

describe('sse: 畸形帧必须被计数而非静默丢弃（ERR-3 核心）', () => {
  it('14. 畸形帧类型一 —— JSON 截断：计入 invalid-json', () => {
    const r = parseAll('event: token\ndata: {"type":"token","content":"截断\n\n');
    expect(r.events).toHaveLength(0);
    expect(r.degradedCount).toBe(1);
    expect(r.degraded[0].reason).toBe('invalid-json');
  });

  it('15. 畸形帧类型二 —— JSON 合法但非对象：计入 non-object', () => {
    const r = parseAll('event: token\ndata: 12345\n\n');
    expect(r.degradedCount).toBe(1);
    expect(r.degraded[0].reason).toBe('non-object');
  });

  it('16. 畸形帧类型三 —— 数组载荷：计入 non-object', () => {
    const r = parseAll('event: token\ndata: [1,2,3]\n\n');
    expect(r.degradedCount).toBe(1);
    expect(r.degraded[0].reason).toBe('non-object');
  });

  it('17. 畸形帧类型四 —— 对象但无 type 且事件名不认识：计入 unknown-shape', () => {
    const r = parseAll('event: mystery\ndata: {"foo":1}\n\n');
    expect(r.degradedCount).toBe(1);
    expect(r.degraded[0].reason).toBe('unknown-shape');
  });

  it('18. 无 type 但 event 名已知时补全放行，不算降级（健壮性收益）', () => {
    const r = parseAll('event: token\ndata: {"content":"补全"}\n\n');
    expect(r.degradedCount).toBe(0);
    expect(r.events[0]).toEqual({ content: '补全', type: 'token' });
  });

  it('19. 好帧与坏帧混流：好帧照常送达，坏帧单独计数（绝不整流丢弃）', () => {
    const text =
      frame('token', tok('好1')) +
      'event: token\ndata: {坏帧\n\n' +
      frame('token', tok('好2'));

    const r = parseAll(text);
    expect(r.events.map((e) => (e as TokenEvent).content)).toEqual(['好1', '好2']);
    expect(r.degradedCount).toBe(1);
  });

  it('20. 连接中途掐断的半帧由 finish() 兜住并计数，不会凭空消失', () => {
    const st = createParser();
    const a = feed(st, frame('token', tok('完整')) + 'event: token\ndata: {"type":"tok');
    expect(a.events).toHaveLength(1);
    expect(a.degradedCount).toBe(0); // 半帧还在 buffer 里，尚未判定

    const b = finish(st);
    expect(b.degradedCount).toBe(1);
    expect(b.degraded[0].reason).toBe('invalid-json');
  });

  it('21. 降级明细的 raw 片段被截断到 200 字符以内（防日志爆量）', () => {
    const long = 'x'.repeat(500);
    const r = parseAll(`event: token\ndata: {"broken":"${long}\n\n`);
    expect(r.degradedCount).toBe(1);
    expect(r.degraded[0].raw.length).toBeLessThanOrEqual(201); // 200 + 省略号
  });

  it('22. 累计计数写回 state，供会话末「内容可能不完整」提示使用', () => {
    const st = createParser();
    feed(st, 'event: token\ndata: {坏1\n\n');
    feed(st, frame('token', tok('好')));
    feed(st, 'event: token\ndata: {坏2\n\n');
    expect(st.totalDegraded).toBe(2);
    expect(st.totalEvents).toBe(1);
  });
});

describe('sse: 零副作用约束（架构 §7.1 结构性护栏）', () => {
  it('23. 空 chunk 与空流是安全的空操作', () => {
    const st = createParser();
    expect(feed(st, '')).toEqual({ events: [], degradedCount: 0, degraded: [] });
    expect(finish(st)).toEqual({ events: [], degradedCount: 0, degraded: [] });
  });

  it('24. 纯空白残留不产生降级（服务端以 \\n\\n 正常收尾的常见情形）', () => {
    const st = createParser();
    feed(st, frame('token', tok('尾部空白')));
    feed(st, '\n\n   \n');
    const f = finish(st);
    expect(f.degradedCount).toBe(0);
    expect(f.events).toHaveLength(0);
  });

  it('25. 多行 data 按规范以 \\n 拼接后仍能解析出 JSON', () => {
    const r = parseAll('event: token\ndata: {"type":"token",\ndata: "content":"多行"}\n\n');
    expect(r.degradedCount).toBe(0);
    expect((r.events[0] as TokenEvent).content).toBe('多行');
  });

  it('26. data 值只剥离一个前导空格，不做 trim（保住内容里的有效空白）', () => {
    const r = parseAll('event: token\ndata: {"type":"token","content":"  前导空格保留"}\n\n');
    expect((r.events[0] as TokenEvent).content).toBe('  前导空格保留');
  });
});
