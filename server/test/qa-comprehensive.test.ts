import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { resetRateLimit } from '../src/middleware/rateLimit';
import { extractFirstUrl, retrieve } from '../src/kb/retrieve';
import { detectHumanHandoff, HANDOFF_KEYWORDS } from '../src/llm/handoff';
import { validateChatBody } from '../src/middleware/validate';
import { parseSSE, SseEvent } from './helpers';

const app = createApp();

/** 便捷：发一条 chat 请求并解析 SSE 事件序列。 */
async function chat(body: Record<string, unknown>) {
  const res = await request(app).post('/api/v1/chat').send(body);
  return { res, events: res.status === 200 ? parseSSE(res.text) : ([] as SseEvent[]) };
}

// ============================================================
// 一、功能测试
// ============================================================
describe('[功能] POST /api/v1/chat 必填字段校验', () => {
  const base = { scenario_id: 'baodao', message: '报到要带什么', conversation_id: 'c-1' };

  it.each([
    ['scenario_id', 'scenario_id'],
    ['message', 'message'],
    ['conversation_id', 'conversation_id'],
  ])('缺少 %s -> 400 + code 4001', async (_label, field) => {
    const body: Record<string, unknown> = { ...base };
    delete body[field];
    const { res } = await chat(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it.each([
    ['空串 scenario_id', { ...base, scenario_id: '' }],
    ['纯空格 scenario_id', { ...base, scenario_id: '   ' }],
    ['空串 conversation_id', { ...base, conversation_id: '' }],
    ['纯空格 conversation_id', { ...base, conversation_id: '  ' }],
    ['空串 message', { ...base, message: '' }],
    ['数字 message', { ...base, message: 12345 }],
    ['对象 scenario_id', { ...base, scenario_id: { a: 1 } }],
    ['history 非数组', { ...base, history: 'nope' }],
    ['history 元素非对象', { ...base, history: ['x'] }],
    ['history.role 非法', { ...base, history: [{ role: 'system', content: 'x' }] }],
    ['history.content 非字符串', { ...base, history: [{ role: 'user', content: 1 }] }],
  ])('非法输入 %s -> 400 + code 4001', async (_label, body) => {
    const { res } = await chat(body as Record<string, unknown>);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
  });

  it('message 边界：2000 字通过 / 2001 字拒绝', async () => {
    const okRes = await chat({ ...base, message: '啊'.repeat(2000) });
    expect(okRes.res.status).toBe(200);

    const badRes = await chat({ ...base, message: '啊'.repeat(2001) });
    expect(badRes.res.status).toBe(400);
    expect(badRes.res.body.code).toBe(4001);
  });

  it('场景不存在 -> 400 + SCENARIO_NOT_FOUND(4002)', async () => {
    const { res } = await chat({ ...base, scenario_id: 'not-exist-scenario' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4002);
    expect(res.body.message).toContain('场景不存在');
  });

  it('validateChatBody 单元：合法输入 history 缺省为空数组', () => {
    const r = validateChatBody({ scenario_id: 'baodao', message: 'hi', conversation_id: 'c' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.history).toEqual([]);
  });
});

describe('[功能] 正常聊天（mock 大脑）事件序列', () => {
  it('命中关键词 -> token...token -> sources -> done(stop)，顺序正确', async () => {
    const { res, events } = await chat({
      scenario_id: 'baodao',
      message: '报到要带什么材料',
      conversation_id: 'func-001',
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const types = events.map((e) => e.event);
    expect(types).toContain('token');
    expect(types).toContain('sources');
    expect(types).toContain('done');
    expect(types).not.toContain('error');

    // 顺序断言：token 早于 sources，sources 早于 done，done 是最后一个事件
    expect(types.indexOf('token')).toBeLessThan(types.indexOf('sources'));
    expect(types.indexOf('sources')).toBeLessThan(types.indexOf('done'));
    expect(types[types.length - 1]).toBe('done');

    const done = events.find((e) => e.event === 'done')!.data;
    expect(done.conversation_id).toBe('func-001');
    expect(done.finish_reason).toBe('stop');
    expect(done.message_id).toMatch(/^m-/);
  });

  it('未命中 -> fallback(有 guesses) -> done(no_answer)', async () => {
    const { events } = await chat({
      scenario_id: 'baodao',
      message: '请给我讲讲量子色动力学',
      conversation_id: 'func-002',
    });
    const fallback = events.find((e) => e.event === 'fallback')!.data;
    expect(fallback.guesses.length).toBeGreaterThan(0);
    expect(fallback.contact.phone).toBe('0431-84532980');
    expect(events.find((e) => e.event === 'done')!.data.finish_reason).toBe('no_answer');
  });

  it('每次请求的 message_id 唯一（并发下不重复）', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        chat({ scenario_id: 'baodao', message: '报到要带什么', conversation_id: `uniq-${i}` }),
      ),
    );
    const ids = results.map((r) => r.events.find((e) => e.event === 'done')!.data.message_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('[功能] 转人工意图拦截', () => {
  it.each(HANDOFF_KEYWORDS.map((k) => [k]))('关键词「%s」命中转人工', async (keyword) => {
    expect(detectHumanHandoff(`${keyword}`)).toBe(true);
  });

  it('「人工智能」不误判为转人工（负向前瞻生效）', () => {
    expect(detectHumanHandoff('什么是人工智能专业')).toBe(false);
  });

  it('命中转人工 -> token + fallback(空 guesses) + done(stop)，不走 KB/LLM', async () => {
    const { res, events } = await chat({
      scenario_id: 'baodao',
      message: '我要转人工，帮我找辅导员',
      conversation_id: 'ho-001',
    });
    expect(res.status).toBe(200);
    const joined = events
      .filter((e) => e.event === 'token')
      .map((e) => e.data.content)
      .join('');
    expect(joined).toContain('0431-84533110');

    const fallback = events.find((e) => e.event === 'fallback')!.data;
    expect(fallback.guesses).toEqual([]);
    expect(fallback.contact.name).toBe('保卫处（24小时值班）');
    // 转人工路径不产生 sources（未触发 KB 检索）
    expect(events.some((e) => e.event === 'sources')).toBe(false);
    expect(events.find((e) => e.event === 'done')!.data.finish_reason).toBe('stop');
  });
});

describe('[功能] KB 检索命中正确文章', () => {
  it.each([
    ['报到当天流程是什么', ['报到', '入学', '迎新']],
    ['宿舍怎么分配', ['宿舍', '住宿']],
    ['学费怎么交', ['学费', '缴费']],
    ['军训什么时候开始', ['军训']],
    ['吉农周边有啥好吃的', ['美食', '餐厅']],
    ['保研需要什么条件', ['保研', '推荐免试']],
  ])('「%s」检索到相关来源', (query, expectedAny) => {
    const r = retrieve(query as string);
    expect(r.sources.length).toBeGreaterThan(0);
    const titles = r.sources.map((s) => s.title).join(' ');
    expect(expectedAny.some((kw) => titles.includes(kw))).toBe(true);
    expect(r.context.length).toBeGreaterThan(0);
  });

  it('完全无关 query -> 不崩溃，context/sources 可为空', () => {
    const r = retrieve('zzzz qqqq xxxx 无关内容 9182736450');
    expect(Array.isArray(r.sources)).toBe(true);
    expect(typeof r.context).toBe('string');
  });

  it('空 query / 纯标点 -> 返回空结果不抛异常', () => {
    for (const q of ['', '   ', '！！！', '???', '\n\n']) {
      const r = retrieve(q);
      expect(r.sources).toEqual([]);
      expect(r.context).toBe('');
    }
  });

  it('检索结果 URL 均为 http(s) 或空串（无畸形链接）', () => {
    const queries = ['报到', '宿舍', '学费', '美食', '保研', '公交', '医院', '快递'];
    for (const q of queries) {
      for (const s of retrieve(q).sources) {
        expect(s.url === '' || /^https?:\/\/[^\s（）()]+$/.test(s.url)).toBe(true);
      }
    }
  });
});

describe('[功能] 数据端点可用性', () => {
  it('GET /healthz -> 200 ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('GET /api/v1/scenarios -> code 0 + 至少 1 个场景', async () => {
    const res = await request(app).get('/api/v1/scenarios');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.some((s: any) => s.id === 'baodao')).toBe(true);
  });

  it('GET /api/v1/features -> code 0 + 卡片列表', async () => {
    const res = await request(app).get('/api/v1/features');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/features?scenario_id=baodao -> 过滤生效', async () => {
    const res = await request(app).get('/api/v1/features?scenario_id=baodao');
    expect(res.status).toBe(200);
    expect(res.body.data.every((f: any) => f.scenario_id === 'baodao')).toBe(true);
  });

  it('POST /api/v1/feedback -> 合法反馈 code 0', async () => {
    const res = await request(app)
      .post('/api/v1/feedback')
      .send({ message_id: 'm-test-1', type: 'helpful', note: '很有用' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('POST /api/v1/feedback -> 非法 type 返回 4003', async () => {
    const res = await request(app).post('/api/v1/feedback').send({ message_id: 'm-x', type: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4003);
  });

  it('POST /api/v1/human-handoff -> 合法提单 code 0', async () => {
    const res = await request(app)
      .post('/api/v1/human-handoff')
      .send({ scenario_id: 'baodao', question: '宿舍空调坏了找谁' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('OPTIONS 预检 -> 204 + CORS 头', async () => {
    const res = await request(app).options('/api/v1/chat');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});

// ============================================================
// 二、安全测试
// ============================================================
describe('[安全] 恶意输入不导致崩溃 / 不被执行', () => {
  const MALICIOUS = [
    ['XSS-script', '<script>alert(document.cookie)</script>'],
    ['XSS-img-onerror', '<img src=x onerror="alert(1)">'],
    ['XSS-svg', '<svg/onload=alert(1)>'],
    ['XSS-javascript-uri', '[点我](javascript:alert(1))'],
    ['SQL-注入', "' OR '1'='1'; DROP TABLE users;--"],
    ['SQL-union', "1 UNION SELECT * FROM information_schema.tables"],
    ['命令注入-分号', '报到; rm -rf /'],
    ['命令注入-反引号', '报到 `cat /etc/passwd`'],
    ['命令注入-管道', '报到 | whoami'],
    ['命令注入-子shell', '报到 $(id)'],
    ['路径遍历', '../../../../etc/passwd'],
    ['路径遍历-编码', '..%2f..%2f..%2fetc%2fpasswd'],
    ['NoSQL-注入', '{"$gt":""}'],
    ['模板注入', '{{7*7}} ${7*7} <%= 7*7 %>'],
    ['原型污染', '__proto__[polluted]=yes'],
    ['空字节', '报到\u0000材料'],
    ['超长-1999', '啊'.repeat(1999)],
    ['emoji与代理对', '🐮🍔👨‍👩‍👧‍👦𝕏𝓔'],
    ['RTL控制字符', '报到\u202Egnittes\u202C'],
    ['CRLF注入', '报到\r\nevent: fake\r\ndata: {"hacked":true}'],
  ] as const;

  it.each(MALICIOUS.map(([n, p]) => [n, p]))('恶意 message「%s」：服务不崩溃且响应合规', async (_name, payload) => {
    const { res } = await chat({
      scenario_id: 'baodao',
      message: payload as string,
      conversation_id: 'sec-1',
    });
    // 只允许两种结果：200 SSE 正常流，或 400 校验拒绝。绝不能 5xx / 挂起
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      // 关键：不得以 HTML 渲染，避免浏览器直接执行脚本
      expect(res.headers['content-type']).not.toMatch(/text\/html/);
    }
  });

  it('CRLF 注入不能伪造 SSE 事件（payload 被 JSON 转义）', async () => {
    const { res, events } = await chat({
      scenario_id: 'baodao',
      message: '报到\r\nevent: fake\r\ndata: {"hacked":true}',
      conversation_id: 'sec-crlf',
    });
    expect(res.status).toBe(200);
    // 事件名只能来自服务端白名单，绝不出现被注入的 fake
    expect(events.map((e) => e.event)).not.toContain('fake');
    expect(res.text).not.toContain('"hacked":true');
  });

  it('conversation_id 中的 XSS 在 done 事件里被 JSON 转义（不产生裸标签）', async () => {
    const evil = '<script>alert(1)</script>';
    const { res, events } = await chat({
      scenario_id: 'baodao',
      message: '报到要带什么',
      conversation_id: evil,
    });
    expect(res.status).toBe(200);
    const done = events.find((e) => e.event === 'done')!.data;
    // 值原样回显是正确的（数据层），关键是传输为 JSON 字符串且 content-type 非 HTML
    expect(done.conversation_id).toBe(evil);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
  });

  it('原型污染：请求体的 __proto__ 不污染 Object.prototype', async () => {
    await chat({
      scenario_id: 'baodao',
      message: '报到',
      conversation_id: 'sec-proto',
      __proto__: { polluted: 'yes' },
    } as any);
    expect(({} as any).polluted).toBeUndefined();
  });

  it('批量恶意请求后服务仍健康', async () => {
    await Promise.all(
      MALICIOUS.map(([, p]) =>
        chat({ scenario_id: 'baodao', message: p as string, conversation_id: 'sec-batch' }),
      ),
    );
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });
});

describe('[安全] 限流保护', () => {
  const originalMax = config.rateLimit.chatMax;

  beforeEach(() => {
    resetRateLimit();
    config.rateLimit.chatMax = 5; // 仅测试期内存态覆盖，不落任何配置文件
  });

  afterEach(() => {
    config.rateLimit.chatMax = originalMax;
    resetRateLimit();
  });

  it('超过 chatMax 后返回 429 + code 4290', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await request(app)
        .post('/api/v1/chat')
        .send({ scenario_id: 'baodao', message: '报到要带什么', conversation_id: `rl-${i}` });
      statuses.push(res.status);
      if (res.status === 429) {
        expect(res.body.code).toBe(4290);
        expect(res.body.message).toContain('频繁');
      }
    }
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(5).every((s) => s === 429)).toBe(true);
  });

  it('限流发生在进入 SSE 之前（返回 JSON 而非 event-stream）', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/chat')
        .send({ scenario_id: 'baodao', message: '报到', conversation_id: `rl2-${i}` });
    }
    const res = await request(app)
      .post('/api/v1/chat')
      .send({ scenario_id: 'baodao', message: '报到', conversation_id: 'rl2-final' });
    expect(res.status).toBe(429);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('[安全] 密钥不经接口泄露', () => {
  it('公开端点响应体不含任何密钥字段', async () => {
    const bodies: string[] = [];
    for (const p of ['/healthz', '/api/v1/scenarios', '/api/v1/features']) {
      bodies.push(JSON.stringify((await request(app).get(p)).body));
    }
    const { res } = await chat({ scenario_id: 'baodao', message: '报到要带什么', conversation_id: 'leak-1' });
    bodies.push(res.text);

    const all = bodies.join('\n');
    for (const forbidden of ['SILICONFLOW_API_KEY', 'COZE_API_TOKEN', 'AMAP_API_KEY', 'sk-', 'pat_', 'Bearer ']) {
      expect(all).not.toContain(forbidden);
    }
  });

  it('错误响应不泄露堆栈 / 文件路径', async () => {
    const { res } = await chat({ scenario_id: 'nope', message: 'hi', conversation_id: 'c' });
    expect(res.text).not.toMatch(/at\s+\w+\s+\(.*\.ts:/);
    expect(res.text).not.toContain('node_modules');
  });
});

describe('[安全] extractFirstUrl 对畸形输入健壮', () => {
  it.each([
    ['空串', '', ''],
    ['无 URL', '这是一段没有链接的文字', ''],
    ['全角括号包裹', '来源: 教务处（https://jwc.jlau.edu.cn/）、学工处（https://xg.jlau.edu.cn/）', 'https://jwc.jlau.edu.cn/'],
    ['markdown 链接', '见 [通知](https://www.jlau.edu.cn/a.html) 详情', 'https://www.jlau.edu.cn/a.html'],
    ['尖括号包裹', '<https://www.jlau.edu.cn/x>', 'https://www.jlau.edu.cn/x'],
    ['非 http 协议不匹配', 'javascript:alert(1) 与 file:///etc/passwd', ''],
    ['路径遍历片段', 'https://a.com/../../etc/passwd', 'https://a.com/../../etc/passwd'],
  ])('%s', (_label, input, expected) => {
    expect(() => extractFirstUrl(input as string)).not.toThrow();
    expect(extractFirstUrl(input as string)).toBe(expected);
  });

  it('超长 / 随机噪声输入不抛异常且有界', () => {
    const noise = 'https://' + 'a'.repeat(50_000) + ' tail';
    expect(() => extractFirstUrl(noise)).not.toThrow();
    expect(extractFirstUrl(noise).startsWith('https://')).toBe(true);

    for (const bad of ['http://', 'https://）（', 'ht!tp://x', '://nohost', 'https://\u0000evil']) {
      expect(() => extractFirstUrl(bad)).not.toThrow();
    }
  });

  it('检索层不会因畸形 URL 产生 javascript: 协议来源', () => {
    for (const q of ['报到', '保研', '美食', '医院']) {
      for (const s of retrieve(q).sources) {
        expect(s.url.toLowerCase().startsWith('javascript:')).toBe(false);
        expect(s.url.toLowerCase().startsWith('file:')).toBe(false);
      }
    }
  });
});

// ============================================================
// 三、异常恢复测试
// ============================================================
describe('[异常恢复] 上游异常兜底', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../src/coze/client');
  });

  it('大脑抛异常 -> emit error(5001 UPSTREAM_UNAVAILABLE) 且连接正常关闭', async () => {
    vi.resetModules();
    vi.doMock('../src/coze/client', async () => {
      const actual = await vi.importActual<typeof import('../src/coze/client')>('../src/coze/client');
      return {
        ...actual,
        streamMock: async () => {
          throw new Error('injected upstream failure');
        },
      };
    });

    const { createApp: freshCreateApp } = await import('../src/app');
    const brokenApp = freshCreateApp();

    const res = await request(brokenApp)
      .post('/api/v1/chat')
      .send({ scenario_id: 'baodao', message: '报到要带什么', conversation_id: 'err-001' });

    // 已进入 SSE，错误必须以 event:error 表达，HTTP 仍是 200
    expect(res.status).toBe(200);
    const events = parseSSE(res.text);
    const errEvent = events.find((e) => e.event === 'error');
    expect(errEvent).toBeDefined();
    expect(errEvent!.data.code).toBe(5001);
    expect(errEvent!.data.message).toContain('暂不可用');
    // 连接被 res.end() 关闭（supertest 能拿到完整 body 即代表未挂起）
    expect(res.text.length).toBeGreaterThan(0);
  });

  it('大脑抛异常后，后续请求恢复正常（无状态残留）', async () => {
    const { res, events } = await chat({
      scenario_id: 'baodao',
      message: '报到要带什么',
      conversation_id: 'err-002',
    });
    expect(res.status).toBe(200);
    expect(events.some((e) => e.event === 'done')).toBe(true);
    expect(events.some((e) => e.event === 'error')).toBe(false);
  });
});

describe('[异常恢复] 畸形请求体', () => {
  it.each([
    ['非法 JSON 文本', '{broken json'],
    ['纯文本', 'hello world'],
    ['空体', ''],
    ['JSON 数组', '[1,2,3]'],
    ['JSON 字符串字面量', '"just-a-string"'],
    ['null 字面量', 'null'],
  ])('%s -> 400 而非 500/挂起', async (_label, raw) => {
    const res = await request(app)
      .post('/api/v1/chat')
      .set('Content-Type', 'application/json')
      .send(raw as string);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
  });

  it('超大 body（>256KB 上限）被拒绝且服务存活', async () => {
    const huge = JSON.stringify({
      scenario_id: 'baodao',
      message: '报到要带什么',
      conversation_id: 'huge',
      history: [{ role: 'user', content: 'x'.repeat(1024 * 1024) }],
    });
    const res = await request(app).post('/api/v1/chat').set('Content-Type', 'application/json').send(huge);
    // 当前实现以 5002 拒绝；核心断言是「被拒绝且不崩溃」
    expect(res.status).toBeGreaterThanOrEqual(400);

    const health = await request(app).get('/healthz');
    expect(health.status).toBe(200);
  });

  it('缺少 Content-Type 的请求不会挂起', async () => {
    const res = await request(app).post('/api/v1/chat').send();
    expect([400, 415]).toContain(res.status);
  });
});

describe('[异常恢复] KB 空 / 无命中不崩溃', () => {
  it('无命中 query -> sources 为空，chat 仍返回 done', async () => {
    const { res, events } = await chat({
      scenario_id: 'baodao',
      message: 'qqqqzzzz9182736450 完全无关的内容',
      conversation_id: 'kb-empty',
    });
    expect(res.status).toBe(200);
    expect(events.some((e) => e.event === 'done')).toBe(true);
    expect(events.some((e) => e.event === 'error')).toBe(false);
  });

  it('KB 目录不存在时 retrieve 返回空而不抛异常', async () => {
    // 必须经由 env 驱动：vi.resetModules() 会让 retrieve.ts 拿到一个全新的 config 实例，
    // 直接改旧 config 对象对新模块不生效。
    const originalEnv = process.env.KB_DIR;
    try {
      process.env.KB_DIR = join(tmpdir(), `kb-not-exist-${Date.now()}`);
      vi.resetModules();
      const fresh = await import('../src/kb/retrieve');
      expect(() => fresh.retrieve('报到要带什么')).not.toThrow();
      const r = fresh.retrieve('报到要带什么');
      expect(r.sources).toEqual([]);
      expect(r.context).toBe('');
    } finally {
      if (originalEnv === undefined) delete process.env.KB_DIR;
      else process.env.KB_DIR = originalEnv;
      vi.resetModules();
    }
  });

  it('KB 目录为空（无 .md）时 retrieve 返回空而不抛异常', async () => {
    const originalEnv = process.env.KB_DIR;
    const emptyDir = mkdtempSync(join(tmpdir(), 'kb-empty-'));
    try {
      process.env.KB_DIR = emptyDir;
      vi.resetModules();
      const fresh = await import('../src/kb/retrieve');
      const r = fresh.retrieve('报到要带什么');
      expect(r.sources).toEqual([]);
      expect(r.context).toBe('');
    } finally {
      if (originalEnv === undefined) delete process.env.KB_DIR;
      else process.env.KB_DIR = originalEnv;
      rmSync(emptyDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});

// ============================================================
// 四、性能测试（进程内 / supertest）
// ============================================================
describe('[性能] KB 检索延迟', () => {
  it('批量 200 次 retrieve：p95 < 50ms', () => {
    const queries = [
      '报到要带什么',
      '宿舍怎么分配',
      '学费怎么交',
      '军训什么时候',
      '周边有啥好吃的',
      '保研条件',
      '快递驿站在哪',
      '校医院怎么走',
      '奖学金怎么申请',
      '选课系统',
    ];
    // 预热（首次读盘建立缓存）
    retrieve('预热');

    const durations: number[] = [];
    for (let i = 0; i < 200; i++) {
      const q = queries[i % queries.length];
      const t0 = performance.now();
      retrieve(q);
      durations.push(performance.now() - t0);
    }
    durations.sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.5)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const p99 = durations[Math.floor(durations.length * 0.99)];
    // eslint-disable-next-line no-console
    console.log(
      `[perf] retrieve x200  p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms p99=${p99.toFixed(2)}ms max=${durations[durations.length - 1].toFixed(2)}ms`,
    );
    expect(p95).toBeLessThan(50);
  });
});

describe('[性能] chat 端点并发（mock 大脑）', () => {
  const originalMax = config.rateLimit.chatMax;
  beforeEach(() => {
    resetRateLimit();
    config.rateLimit.chatMax = 100_000;
  });
  afterEach(() => {
    config.rateLimit.chatMax = originalMax;
    resetRateLimit();
  });

  async function runConcurrent(concurrency: number, label: string) {
    const t0 = performance.now();
    const results = await Promise.all(
      Array.from({ length: concurrency }, async (_, i) => {
        const s = performance.now();
        const res = await request(app)
          .post('/api/v1/chat')
          .send({ scenario_id: 'baodao', message: '报到要带什么', conversation_id: `${label}-${i}` });
        return { ms: performance.now() - s, status: res.status, text: res.text };
      }),
    );
    const wall = performance.now() - t0;
    const oks = results.filter((r) => r.status === 200 && r.text.includes('event: done'));
    const lat = results.map((r) => r.ms).sort((a, b) => a - b);
    const pct = (p: number) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))];
    // eslint-disable-next-line no-console
    console.log(
      `[perf] chat c=${concurrency} ok=${oks.length}/${concurrency} wall=${wall.toFixed(0)}ms ` +
        `p50=${pct(0.5).toFixed(0)}ms p95=${pct(0.95).toFixed(0)}ms p99=${pct(0.99).toFixed(0)}ms`,
    );
    return { results, oks, wall, pct };
  }

  it('20 并发：全部成功且 p95 < 3000ms', async () => {
    const { oks, pct } = await runConcurrent(20, 'perf20');
    expect(oks.length).toBe(20);
    expect(pct(0.95)).toBeLessThan(3000);
  }, 30_000);

  it('50 并发：全部成功且 p95 < 5000ms', async () => {
    const { oks, pct } = await runConcurrent(50, 'perf50');
    expect(oks.length).toBe(50);
    expect(pct(0.95)).toBeLessThan(5000);
  }, 60_000);
});
