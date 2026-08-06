#!/usr/bin/env node
/**
 * 吉小农 · 1000 并发【移动网络条件】压力测试（本地 mock 服务专用）
 * ================================================================
 *
 * 【安全边界 —— 请务必阅读】
 * 本脚本只允许打**本地 mock 实例**（默认 http://localhost:4100）。
 * 目标主机非 localhost/127.0.0.1 时脚本直接拒绝运行，杜绝误压生产。
 * 被测服务必须以 LLM_MOCK=true 启动（零外部 LLM 调用、零真实计费）。
 *
 * 与 load-1000.mjs 的差异（本文件是「移动端变体」，原文件保留不动）：
 *   1. 移动 UA          —— 每条请求带 iPhone Safari User-Agent
 *   2. 慢消费者背压      —— 每读完一个 chunk 停 20~40ms，模拟手机低带宽，
 *                          迫使服务端 SSE 写入排队，验证背压下不爆内存/不卡事件循环
 *   3. 中途断连          —— 随机 ~5% 请求在收到首 token 后立刻 abort()，
 *                          模拟运营商掉线/切后台，验证服务端优雅处理客户端断开
 *   4. 服务端健康探针    —— 压测全程每 1s 轮询 /healthz，记录响应延迟，
 *                          服务端事件循环被阻塞会直接体现为 healthz 延迟飙升
 *
 * 启动被测服务：
 *   cd server && PORT=4100 LLM_MOCK=true RATE_CHAT_MAX=100000 \
 *     RATE_WINDOW_MS=60000 STORE_KIND=memory npm start
 *
 * 运行压测：
 *   node scripts/load-1000-mobile.mjs [并发数] [超时ms] [断连比例]
 *   node scripts/load-1000-mobile.mjs 1000 30000 0.05
 */

const TARGET = process.env.LOAD_TARGET || 'http://localhost:4100';
const CONCURRENCY = Number(process.argv[2] || 1000);
const TIMEOUT_MS = Number(process.argv[3] || 30_000);
const ABORT_RATIO = Number(process.argv[4] || 0.05);
const ENDPOINT = `${TARGET}/api/v1/chat`;

// 手机端低带宽：每个 chunk 之间的消费延迟
const SLOW_MIN_MS = 20;
const SLOW_MAX_MS = 40;

// ---------- 安全护栏：只允许本地（与原脚本一致，不得删除） ----------
{
  const host = new URL(TARGET).hostname;
  const LOCAL = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
  if (!LOCAL.includes(host)) {
    console.error(`✗ 拒绝执行：目标 ${host} 不是本地地址。本脚本仅允许压测本地 mock 实例。`);
    process.exit(1);
  }
}

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

const MESSAGES = [
  '报到要带什么材料',
  '宿舍怎么分配',
  '学费怎么交',
  '军训什么时候开始',
  '校园卡怎么激活',
  '从长春站怎么去学校',
  '档案怎么转接',
  '户口要迁移吗',
  '吉农保研率多少', // 走 fallback 分支
  '食堂几点开门',
];

const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : 'n/a');
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slowDelay = () => SLOW_MIN_MS + Math.random() * (SLOW_MAX_MS - SLOW_MIN_MS);

/**
 * 单条 SSE 请求（移动网络条件）
 * @param {number} i        序号
 * @param {number} t0       全局起始时刻
 * @param {boolean} willAbort 是否属于「收到首 token 后主动断连」的 5% 群体
 */
async function oneRequest(i, t0, willAbort) {
  const started = performance.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort('timeout'), TIMEOUT_MS);

  const rec = {
    i,
    outcome: 'fail',
    status: 0,
    ttfb: NaN,
    ttft: NaN,
    total: NaN,
    finishedAt: NaN,
    chunks: 0,
    intentionalAbort: willAbort,
    err: '',
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': MOBILE_UA,
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        scenario_id: 'baodao',
        message: MESSAGES[i % MESSAGES.length],
        conversation_id: `mload-${i}`,
        history: [],
      }),
      signal: ac.signal,
    });

    rec.ttfb = performance.now() - started;
    rec.status = res.status;

    if (!res.ok || !res.body) {
      rec.outcome = 'fail';
      rec.err = `http ${res.status}`;
      await res.text().catch(() => {});
      return rec;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let sawDone = false;
    let sawError = false;
    let firstTokenAt = NaN;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      rec.chunks++;
      buf += decoder.decode(value, { stream: true });

      if (Number.isNaN(firstTokenAt) && /event:\s*(token|fallback)/.test(buf)) {
        firstTokenAt = performance.now() - started;

        // ---- 运营商掉线模拟：收到首 token 立刻断开 ----
        if (willAbort) {
          rec.ttft = firstTokenAt;
          rec.total = performance.now() - started;
          rec.finishedAt = performance.now() - t0;
          rec.outcome = 'aborted';
          ac.abort('client-disconnect');
          return rec;
        }
      }
      if (/event:\s*error/.test(buf)) sawError = true;
      if (/event:\s*done/.test(buf)) {
        sawDone = true;
        break;
      }

      // ---- 慢消费者：模拟手机低带宽，制造服务端背压 ----
      await sleep(slowDelay());
    }
    reader.cancel().catch(() => {});

    rec.ttft = firstTokenAt;
    rec.total = performance.now() - started;
    rec.finishedAt = performance.now() - t0;
    rec.outcome = sawError ? 'fail' : sawDone ? 'ok' : 'fail';
    if (!sawDone && !sawError) rec.err = 'stream ended without done';
    if (sawError) rec.err = 'sse error event';
    return rec;
  } catch (e) {
    rec.total = performance.now() - started;
    rec.finishedAt = performance.now() - t0;
    const msg = String(e?.message || e);
    // 主动断连群体：abort 属于预期行为，不算失败
    if (willAbort && (e?.name === 'AbortError' || msg.includes('abort'))) {
      rec.outcome = 'aborted';
      return rec;
    }
    const isTimeout = String(e?.cause || '') === 'timeout' || msg.includes('timeout');
    rec.outcome = isTimeout ? 'timeout' : 'fail';
    rec.err = isTimeout ? `timeout>${TIMEOUT_MS}ms` : msg;
    return rec;
  } finally {
    clearTimeout(timer);
  }
}

async function preflight() {
  try {
    const r = await fetch(`${TARGET}/healthz`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    if (j?.data?.status !== 'ok') throw new Error('healthz 非 ok');
    return true;
  } catch (e) {
    console.error(`✗ 目标服务不可达：${TARGET} —— ${e.message}`);
    console.error(
      '  请先启动：cd server && PORT=4100 LLM_MOCK=true RATE_CHAT_MAX=100000 STORE_KIND=memory npm start',
    );
    return false;
  }
}

async function main() {
  console.log('='.repeat(76));
  console.log(
    `吉小农 移动网络压测  target=${TARGET}  并发=${CONCURRENCY}  超时=${TIMEOUT_MS}ms  断连比例=${(ABORT_RATIO * 100).toFixed(0)}%`,
  );
  console.log(`慢消费者：每 chunk 停 ${SLOW_MIN_MS}~${SLOW_MAX_MS}ms   移动UA：iPhone OS 16 Safari`);
  console.log('='.repeat(76));

  if (!(await preflight())) process.exit(1);
  console.log('✓ 预检通过：/healthz = ok\n');

  if (global.gc) global.gc();
  const memBefore = process.memoryUsage();

  // ---- 客户端事件循环探针 ----
  const ticks = [];
  let lastTick = performance.now();
  const TICK_MS = 1000;
  const ticker = setInterval(() => {
    const now = performance.now();
    ticks.push(Math.round(now - lastTick));
    lastTick = now;
  }, TICK_MS);
  ticker.unref?.();

  // ---- 服务端健康探针：压测全程每 1s 打一次 /healthz，记录 RTT ----
  const healthRtt = [];
  let healthFail = 0;
  const healthTimer = setInterval(async () => {
    const s = performance.now();
    try {
      const r = await fetch(`${TARGET}/healthz`, { signal: AbortSignal.timeout(8000) });
      await r.json();
      healthRtt.push(Math.round(performance.now() - s));
    } catch {
      healthFail++;
    }
  }, 1000);
  healthTimer.unref?.();

  // ---- 断连群体抽样 ----
  const abortCount = Math.round(CONCURRENCY * ABORT_RATIO);
  const abortSet = new Set();
  while (abortSet.size < abortCount) abortSet.add(Math.floor(Math.random() * CONCURRENCY));

  const t0 = performance.now();
  lastTick = t0;

  const tasks = Array.from({ length: CONCURRENCY }, (_, i) => oneRequest(i, t0, abortSet.has(i)));
  console.log(`→ 已同时发出 ${CONCURRENCY} 条请求（其中 ${abortCount} 条将在首 token 后主动断连），等待收敛...\n`);

  const settled = await Promise.allSettled(tasks);
  const wall = performance.now() - t0;
  clearInterval(ticker);
  clearInterval(healthTimer);

  const recs = settled.map((s) =>
    s.status === 'fulfilled'
      ? s.value
      : { outcome: 'fail', err: 'promise rejected', total: NaN, finishedAt: NaN, chunks: 0 },
  );

  const memAfter = process.memoryUsage();

  // ---------- 统计 ----------
  const ok = recs.filter((r) => r.outcome === 'ok');
  const aborted = recs.filter((r) => r.outcome === 'aborted');
  const failed = recs.filter((r) => r.outcome === 'fail');
  const timedOut = recs.filter((r) => r.outcome === 'timeout');
  // 完成型请求 = 总数 - 主动断连（断连是预期行为，不计入成功率分母）
  const completable = CONCURRENCY - aborted.length;

  const sortNum = (arr) => arr.filter(Number.isFinite).sort((a, b) => a - b);
  const totals = sortNum(ok.map((r) => r.total));
  const ttfbs = sortNum(ok.map((r) => r.ttfb));
  const ttfts = sortNum(ok.map((r) => r.ttft));
  const finishes = sortNum(recs.map((r) => r.finishedAt));

  console.log('─'.repeat(76));
  console.log('结果汇总（移动网络条件）');
  console.log('─'.repeat(76));
  console.log(`总请求数            : ${CONCURRENCY}`);
  console.log(`主动断连（预期）    : ${aborted.length}  —— 模拟运营商掉线，不计入成功率分母`);
  console.log(`可完成请求数        : ${completable}`);
  console.log(
    `成功 (收到 done)    : ${ok.length}  (${((ok.length / completable) * 100).toFixed(2)}% of 可完成)`,
  );
  console.log(`失败                : ${failed.length}`);
  console.log(`超时                : ${timedOut.length}  (${((timedOut.length / completable) * 100).toFixed(2)}%)`);
  console.log(`整体墙钟耗时        : ${fmt(wall)} ms`);
  console.log(`吞吐                : ${(CONCURRENCY / (wall / 1000)).toFixed(1)} req/s`);
  console.log(`首个完成时刻        : ${fmt(finishes[0])} ms`);
  console.log(`最后完成时刻        : ${fmt(finishes[finishes.length - 1])} ms`);
  const avgChunks = recs.reduce((a, r) => a + (r.chunks || 0), 0) / recs.length;
  console.log(`平均 chunk 数/请求  : ${fmt(avgChunks)}  （每 chunk 后慢消费 ${SLOW_MIN_MS}~${SLOW_MAX_MS}ms）`);

  console.log('\n延迟分布（仅成功请求，单位 ms；含慢消费者自身延迟）');
  console.log(
    `  TTFB    p50=${fmt(pct(ttfbs, 0.5))}  p95=${fmt(pct(ttfbs, 0.95))}  p99=${fmt(pct(ttfbs, 0.99))}  max=${fmt(ttfbs[ttfbs.length - 1])}`,
  );
  console.log(
    `  首token p50=${fmt(pct(ttfts, 0.5))}  p95=${fmt(pct(ttfts, 0.95))}  p99=${fmt(pct(ttfts, 0.99))}  max=${fmt(ttfts[ttfts.length - 1])}`,
  );
  console.log(
    `  完成    p50=${fmt(pct(totals, 0.5))}  p95=${fmt(pct(totals, 0.95))}  p99=${fmt(pct(totals, 0.99))}  max=${fmt(totals[totals.length - 1])}`,
  );

  if (failed.length) {
    const reasons = {};
    for (const f of failed) reasons[f.err || 'unknown'] = (reasons[f.err || 'unknown'] || 0) + 1;
    console.log('\n失败原因分布:');
    for (const [k, v] of Object.entries(reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)) {
      console.log(`  ${v} x ${k}`);
    }
  }

  console.log('\n客户端事件循环探针（期望 ≈1000ms/次）');
  console.log(`  采样数=${ticks.length}  样本=[${ticks.join(', ')}]`);
  const maxTick = ticks.length ? Math.max(...ticks) : 0;
  const avgTick = ticks.length ? ticks.reduce((a, b) => a + b, 0) / ticks.length : 0;
  console.log(`  平均=${fmt(avgTick)}ms  最大=${maxTick}ms  最大漂移=${maxTick - TICK_MS}ms`);

  console.log('\n服务端健康探针 /healthz（背压期间服务端是否还能及时响应）');
  const hSorted = [...healthRtt].sort((a, b) => a - b);
  console.log(`  采样数=${healthRtt.length}  失败=${healthFail}`);
  console.log(
    `  RTT p50=${fmt(pct(hSorted, 0.5))}ms  p95=${fmt(pct(hSorted, 0.95))}ms  max=${fmt(hSorted[hSorted.length - 1])}ms`,
  );
  const maxHealthRtt = hSorted.length ? hSorted[hSorted.length - 1] : 0;

  console.log('\n压测端内存对比（本脚本进程）');
  console.log(`  rss       ${mb(memBefore.rss)}MB -> ${mb(memAfter.rss)}MB  (Δ ${mb(memAfter.rss - memBefore.rss)}MB)`);
  console.log(
    `  heapUsed  ${mb(memBefore.heapUsed)}MB -> ${mb(memAfter.heapUsed)}MB  (Δ ${mb(memAfter.heapUsed - memBefore.heapUsed)}MB)`,
  );

  // ---------- 压测后存活性复检 ----------
  console.log('\n压测后服务存活性复检（含断连+背压之后）');
  let aliveOk = false;
  let echoOk = false;
  try {
    const h = await fetch(`${TARGET}/healthz`, { signal: AbortSignal.timeout(10_000) });
    const hj = await h.json();
    aliveOk = hj?.data?.status === 'ok';
    console.log(`  /healthz        : ${aliveOk ? '✓ ok' : '✗ ' + JSON.stringify(hj)}`);
  } catch (e) {
    console.log(`  /healthz        : ✗ ${e.message}`);
  }
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': MOBILE_UA },
      body: JSON.stringify({
        scenario_id: 'baodao',
        message: '报到要带什么',
        conversation_id: 'post-mload',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const t = await r.text();
    echoOk = r.status === 200 && t.includes('event: done');
    console.log(`  再来一条聊天请求: ${echoOk ? '✓ 正常返回 done' : '✗ status=' + r.status}`);
  } catch (e) {
    console.log(`  再来一条聊天请求: ✗ ${e.message}`);
  }

  // ---------- 判定 ----------
  const timeoutRate = timedOut.length / completable;
  const successRate = ok.length / completable;
  const checks = [
    ['无进程崩溃（服务存活 + 压后可服务）', aliveOk && echoOk],
    ['成功率 ≥ 99%（可完成请求）', successRate >= 0.99],
    ['超时率 ≤ 1%', timeoutRate <= 0.01],
    ['客户端事件循环无长阻塞（漂移 < 2000ms）', maxTick - TICK_MS < 2000],
    ['服务端背压下仍响应（healthz 失败=0）', healthFail === 0],
    ['服务端 healthz 最大 RTT < 3000ms', maxHealthRtt < 3000],
    [`断连请求全部被识别为预期（${aborted.length}/${abortCount}）`, aborted.length === abortCount],
  ];
  console.log('\n' + '─'.repeat(76));
  console.log('判定');
  console.log('─'.repeat(76));
  let allPass = true;
  for (const [name, pass] of checks) {
    console.log(`  ${pass ? '✓ PASS' : '✗ FAIL'}  ${name}`);
    if (!pass) allPass = false;
  }
  console.log('─'.repeat(76));
  console.log(allPass ? '✓ 移动网络压力测试整体通过' : '✗ 移动网络压力测试存在未达标项');
  console.log('='.repeat(76));

  process.exit(allPass ? 0 : 2);
}

main().catch((e) => {
  console.error('压测脚本异常:', e);
  process.exit(1);
});
