#!/usr/bin/env node
/**
 * 吉小农薄壳后端 —— 部署验证脚本（可复跑）。
 *
 * 用途：
 *   - 证明后端可启动并对外提供 5 个端点（Spec 锁定）。
 *   - 验证 /api/v1/chat 的 SSE 事件序列 token -> sources -> done(stop) 且首字 < 3s（AC-06）。
 *   - 验证无答案兜底流 fallback + done(no_answer)（AC-03）。
 *   - 验证 feedback / scenarios 端点。
 *
 * 用法：
 *   node scripts/verify-deploy.mjs                 # 默认打 http://localhost:3100
 *   BASE_URL=http://localhost:3100 node scripts/verify-deploy.mjs
 *
 * 退出码：全部通过 0，任一失败 1。
 */
import { performance } from 'node:perf_hooks';

const BASE = process.env.BASE_URL || 'http://localhost:3100';

function log(...args) {
  console.log(...args);
}

/**
 * 解析 text/event-stream：按空行切分事件块，提取 event: 与 data: 行。
 * 与 web/src/lib/api.ts 的 parseSSE 行为保持一致。
 */
async function streamChat(body) {
  const res = await fetch(`${BASE}/api/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new Error(`chat request failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];
  const t0 = performance.now();
  let firstTokenAt = null;

  const flush = (block) => {
    let event = '';
    const dataLines = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!event || dataLines.length === 0) return;
    const data = JSON.parse(dataLines.join(''));
    if (event === 'token' && firstTokenAt === null) firstTokenAt = performance.now();
    events.push({ event, data });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) flush(buffer);
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      flush(block);
    }
  }
  const tEnd = performance.now();
  return { events, firstTokenMs: firstTokenAt !== null ? firstTokenAt - t0 : null, totalMs: tEnd - t0 };
}

async function jsonGet(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: await res.json() };
}

async function jsonPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}

async function main() {
  log(`== 吉小农部署验证 @ ${BASE} ==`);

  // 1) healthz
  try {
    const h = await jsonGet('/healthz');
    check('GET /healthz', h.status === 200 && h.body?.data?.status === 'ok',
      `status=${h.status} body=${JSON.stringify(h.body)}`);
  } catch (e) {
    check('GET /healthz', false, String(e));
  }

  // 2) chat 成功流（已知问题 -> token/sources/done(stop)）
  try {
    const r = await streamChat({
      scenario_id: 'baodao',
      message: '报到要带什么',
      history: [],
      conversation_id: 'verify-001',
    });
    const evs = r.events.map((e) => e.event);
    const hasToken = evs.includes('token');
    const hasSources = evs.includes('sources');
    const done = r.events.find((e) => e.event === 'done')?.data;
    const stopOk = done && done.finish_reason === 'stop';
    const firstOk = r.firstTokenMs !== null && r.firstTokenMs < 3000;
    check('chat 成功流 事件序列 token->sources->done', hasToken && hasSources && !!stopOk,
      `序列=[${evs.join(',')}] finish_reason=${done?.finish_reason}`);
    check('chat 首字 < 3s (AC-06)', firstOk,
      `firstToken=${(r.firstTokenMs ?? -1).toFixed(0)}ms total=${r.totalMs.toFixed(0)}ms`);
  } catch (e) {
    check('chat 成功流', false, String(e));
  }

  // 3) chat 兜底流（知识库无答案 -> fallback + done(no_answer)）
  try {
    const r = await streamChat({
      scenario_id: 'baodao',
      message: '吉农保研率多少',
      history: [],
      conversation_id: 'verify-002',
    });
    const evs = r.events.map((e) => e.event);
    const hasFallback = evs.includes('fallback');
    const done = r.events.find((e) => e.event === 'done')?.data;
    const noAnswerOk = done && done.finish_reason === 'no_answer';
    check('chat 兜底流 fallback->done(no_answer) (AC-03)', hasFallback && !!noAnswerOk,
      `序列=[${evs.join(',')}] finish_reason=${done?.finish_reason}`);
  } catch (e) {
    check('chat 兜底流', false, String(e));
  }

  // 4) feedback
  try {
    const f = await jsonPost('/api/v1/feedback', { message_id: 'm-verify', type: 'helpful' });
    check('POST /api/v1/feedback', f.body?.code === 0, `body=${JSON.stringify(f.body)}`);
  } catch (e) {
    check('POST /api/v1/feedback', false, String(e));
  }

  // 5) scenarios
  try {
    const s = await jsonGet('/api/v1/scenarios');
    const ok = Array.isArray(s.body?.data) && s.body.data.some((x) => x.id === 'baodao');
    check('GET /api/v1/scenarios', ok, `body=${JSON.stringify(s.body)}`);
  } catch (e) {
    check('GET /api/v1/scenarios', false, String(e));
  }

  const failed = results.filter((r) => !r.ok);
  log(`== 结果：${results.length - failed.length}/${results.length} 通过 ==`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('验证脚本异常：', e);
  process.exit(1);
});
