#!/usr/bin/env node
/**
 * 吉小农 · 真·手机设备仿真 E2E（Playwright + Chromium 移动设备描述符）
 * =====================================================================
 * 目标：验证 100% 手机用户场景下的首屏渲染、触屏链路、触摸目标尺寸、
 *       控制台健康、弱网双重提交防护。
 *
 * 【安全边界】
 *   - 只访问 http://localhost:4200（静态 SPA + /api 反代到本地 mock 4100）
 *   - 后端为 LLM_MOCK=true，零外部 LLM 调用、零计费
 *   - 不修改任何生产代码，截图落到 server/test/shots/
 *
 * 用法： node mobile-e2e.mjs [baseURL]
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://localhost:4200';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.resolve(__dirname, '../server/test/shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

// 安全护栏：只允许本地
{
  const host = new URL(BASE).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.error(`✗ 拒绝执行：目标 ${host} 非本地地址。`);
    process.exit(1);
  }
}

const MIN_TOUCH = 44; // Apple HIG / Android Material 最小触摸目标 (px)
const DEVICE_NAMES = ['iPhone 13', 'Pixel 5'];

const results = [];
const record = (device, name, pass, detail) => {
  results.push({ device, name, pass, detail });
  console.log(`  ${pass ? '✓ PASS' : '✗ FAIL'}  [${device}] ${name}${detail ? ' — ' + detail : ''}`);
};

/** 等待 AI 气泡出现且有实际文本（SSE 完成），最长 timeout ms */
async function waitForAiBubble(page, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const txt = await page
      .evaluate(() => {
        const els = [...document.querySelectorAll('.bubble.ai')];
        // 排除只含 typing 动画的占位气泡
        const withText = els
          .map((e) => (e.textContent || '').trim())
          .filter((t) => t.length > 0);
        return withText.length ? withText[withText.length - 1] : '';
      })
      .catch(() => '');
    if (txt && txt.length > 2) return txt;
    await page.waitForTimeout(300);
  }
  return '';
}

async function runDevice(browser, deviceName) {
  console.log(`\n${'─'.repeat(70)}\n设备：${deviceName}\n${'─'.repeat(70)}`);
  const descriptor = devices[deviceName];
  const context = await browser.newContext({
    ...descriptor,
    // 显式确保触摸能力（设备描述符已含，双保险）
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();

  // ---- 控制台健康采集 ----
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(String(e?.message || e)));

  const slug = deviceName.replace(/\s+/g, '-').toLowerCase();

  // ================= A1 首屏渲染 =================
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForSelector('.welcome-title', { timeout: 15_000 });
  const welcomeShot = path.join(SHOT_DIR, `welcome-${slug}.png`);
  await page.screenshot({ path: welcomeShot, fullPage: false });
  record(deviceName, '首屏 Welcome 渲染成功并截图', true, path.basename(welcomeShot));

  // 视口与横向溢出
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
    dpr: window.devicePixelRatio,
  }));
  record(
    deviceName,
    '无横向溢出 (scrollWidth ≤ innerWidth+2)',
    overflow.scrollWidth <= overflow.innerWidth + 2,
    `scrollWidth=${overflow.scrollWidth} innerWidth=${overflow.innerWidth} dpr=${overflow.dpr}`,
  );

  // 安全区/顶部遮挡：顶部首个可见内容不得越出视口上沿
  const safeTop = await page.evaluate(() => {
    const probe =
      document.querySelector('.app-header') ||
      document.querySelector('.welcome-hero') ||
      document.querySelector('.welcome');
    if (!probe) return null;
    const r = probe.getBoundingClientRect();
    const cs = getComputedStyle(probe);
    return { top: r.top, height: r.height, paddingTop: cs.paddingTop };
  });
  record(
    deviceName,
    '顶部内容未越出视口上沿（刘海区不被遮挡）',
    !!safeTop && safeTop.top >= -1,
    safeTop ? `top=${safeTop.top.toFixed(1)}px paddingTop=${safeTop.paddingTop}` : 'probe 未找到',
  );

  // ================= A3 触摸目标尺寸（Welcome 页） =================
  const ctaBox = await page.locator('.btn-primary').first().boundingBox();
  record(
    deviceName,
    '「开始对话」按钮触摸目标 ≥44px',
    !!ctaBox && ctaBox.height >= MIN_TOUCH && ctaBox.width >= MIN_TOUCH,
    ctaBox ? `${ctaBox.width.toFixed(1)}x${ctaBox.height.toFixed(1)}` : 'not found',
  );

  // ================= A2 触屏链路 =================
  await page.locator('.btn-primary').first().tap();
  await page.waitForURL(/\/chat/, { timeout: 15_000 });
  await page.waitForSelector('.chat-input', { timeout: 15_000 });
  record(deviceName, 'tap「开始对话」跳转 /chat 成功', true, page.url().replace(BASE, ''));

  // 聊天页关键元素触摸目标
  // 说明：输入框 <input> 自身仅 22.5px 高，但其父级 .input-pill(44px) 的内边距区
  // 经 probe-touch.mjs 实测可聚焦输入框，故【有效命中区】以 .input-pill 计。
  // 聊天页无 .nav-back（ChatPage 未传 onBack），实际头部操作键为 .nav-action / .nav-more。
  for (const [label, sel] of [
    ['输入胶囊(输入框有效命中区)', '.input-pill'],
    ['发送按钮', '.send-btn'],
    ['主题切换键', '.nav-action'],
    ['更多菜单键', '.nav-more'],
    ['猜你想问卡片', '.guess-card'],
  ]) {
    const el = page.locator(sel).first();
    const cnt = await el.count();
    if (!cnt) {
      record(deviceName, `触摸目标[${label}] 存在性`, false, `选择器 ${sel} 未找到`);
      continue;
    }
    const b = await el.boundingBox();
    const ok = !!b && b.height >= MIN_TOUCH && b.width >= MIN_TOUCH;
    record(
      deviceName,
      `触摸目标[${label}] ≥44px`,
      ok,
      b ? `${b.width.toFixed(1)}x${b.height.toFixed(1)}` : 'no box',
    );
  }

  // 功能性断言：点击胶囊内边距（非 input 本体）应能聚焦输入框
  {
    const pill = await page.locator('.input-pill').boundingBox();
    await page.touchscreen.tap(pill.x + pill.width / 2, pill.y + 4);
    await page.waitForTimeout(200);
    const focusedCls = await page.evaluate(() => document.activeElement?.className?.toString?.() || '');
    record(
      deviceName,
      '点击输入胶囊内边距可聚焦输入框（44px 命中区有效）',
      focusedCls.includes('chat-input'),
      `activeElement=.${focusedCls || 'none'}`,
    );
  }

  // 输入并发送
  await page.locator('.chat-input').tap();
  await page.locator('.chat-input').fill('报到要带什么材料');
  await page.locator('.send-btn').tap();

  const aiText = await waitForAiBubble(page, 30_000);
  record(
    deviceName,
    '触屏发送后收到 SSE 回复气泡（30s 内）',
    aiText.length > 2,
    aiText ? `回复前 40 字："${aiText.slice(0, 40)}"` : '超时未出现 AI 气泡',
  );

  // 不得卡在 loading
  const stillLoading = await page.locator('.send-btn .spin').count();
  record(deviceName, '发送后未卡在 loading 态', stillLoading === 0, `spin 元素数=${stillLoading}`);

  // 单次发送只产生一条用户气泡
  const userBubbles = await page.locator('.bubble.user').count();
  record(deviceName, '单次 tap 只产生 1 条用户消息（无重复提交）', userBubbles === 1, `user 气泡=${userBubbles}`);

  const chatShot = path.join(SHOT_DIR, `chat-${slug}.png`);
  await page.screenshot({ path: chatShot, fullPage: false });
  record(deviceName, 'Chat 页截图', true, path.basename(chatShot));

  // 聊天页横向溢出复检（长文本/Markdown 易撑破）
  const overflow2 = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  record(
    deviceName,
    'Chat 页无横向溢出',
    overflow2.scrollWidth <= overflow2.innerWidth + 2,
    `scrollWidth=${overflow2.scrollWidth} innerWidth=${overflow2.innerWidth}`,
  );

  // ================= A5 控制台健康 =================
  record(
    deviceName,
    '渲染期间 console.error = 0',
    consoleErrors.length === 0,
    consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : '0 条',
  );
  record(
    deviceName,
    '渲染期间 pageerror = 0',
    pageErrors.length === 0,
    pageErrors.length ? pageErrors.slice(0, 3).join(' | ') : '0 条',
  );

  await context.close();
}

/** 弱网：给 /api/v1/chat 加 800ms 延迟，验证 loading 态与防双重提交 */
async function runWeakNetwork(browser, deviceName = 'iPhone 13') {
  console.log(`\n${'─'.repeat(70)}\n弱网场景（${deviceName}，SSE 延迟 800ms）\n${'─'.repeat(70)}`);
  const context = await browser.newContext({ ...devices[deviceName], hasTouch: true, isMobile: true });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e?.message || e)));

  // route + continue（不 fulfill）→ 只延迟请求发起，保留 SSE 流式
  let chatCalls = 0;
  await page.route('**/api/v1/chat', async (route) => {
    chatCalls++;
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.locator('.btn-primary').first().tap();
  await page.waitForSelector('.chat-input', { timeout: 15_000 });
  await page.locator('.chat-input').fill('宿舍怎么分配');

  // 连点 3 次，模拟弱网下用户不耐烦重复点击
  await page.locator('.send-btn').tap();
  const loadingSeen = (await page.locator('.send-btn .spin').count()) > 0;
  for (let i = 0; i < 2; i++) {
    await page.locator('.send-btn').tap({ force: true }).catch(() => {});
    await page.waitForTimeout(120);
  }

  const aiText = await waitForAiBubble(page, 30_000);
  const userBubbles = await page.locator('.bubble.user').count();

  record('weak-net', '弱网下出现 loading 态（发送按钮转圈）', loadingSeen, `spin=${loadingSeen}`);
  record('weak-net', '弱网下 800ms 延迟仍能收到回复', aiText.length > 2, aiText.slice(0, 40));
  record(
    'weak-net',
    '连点 3 次只提交 1 条（防双重提交）',
    userBubbles === 1 && chatCalls === 1,
    `user气泡=${userBubbles} /chat 请求数=${chatCalls}`,
  );
  record('weak-net', '弱网期间 pageerror = 0', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || '0 条');

  const shot = path.join(SHOT_DIR, 'chat-weaknet-iphone-13.png');
  await page.screenshot({ path: shot });
  await context.close();
}

async function main() {
  console.log('='.repeat(70));
  console.log(`吉小农 · 真机仿真 E2E   base=${BASE}   截图目录=${SHOT_DIR}`);
  console.log('='.repeat(70));

  // 浏览器获取策略：优先 Playwright 自带 chromium；沙箱网络下载失败时
  // 降级到系统已装的 Chromium 内核浏览器（msedge / chrome）——
  // 二者同为 Chromium 内核 + CDP 设备指标覆写，移动仿真保真度一致。
  let browser = null;
  let engine = '';
  for (const attempt of [
    { label: 'playwright-bundled-chromium', opts: {} },
    { label: 'system-msedge', opts: { channel: 'msedge' } },
    { label: 'system-chrome', opts: { channel: 'chrome' } },
  ]) {
    try {
      browser = await chromium.launch(attempt.opts);
      engine = attempt.label;
      break;
    } catch (e) {
      console.log(`  · ${attempt.label} 不可用：${String(e.message).split('\n')[0].slice(0, 110)}`);
    }
  }
  if (!browser) {
    console.error('✗ 无可用 Chromium 内核浏览器，真机仿真无法执行。');
    process.exit(3);
  }
  console.log(`✓ 浏览器引擎：${engine}  version=${browser.version()}\n`);

  try {
    for (const d of DEVICE_NAMES) {
      await runDevice(browser, d);
    }
    await runWeakNetwork(browser);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\n' + '='.repeat(70));
  console.log(`总检查项 ${results.length}   通过 ${results.length - failed.length}   失败 ${failed.length}`);
  if (failed.length) {
    console.log('\n未通过项：');
    for (const f of failed) console.log(`  ✗ [${f.device}] ${f.name} — ${f.detail}`);
  }
  console.log('='.repeat(70));

  fs.writeFileSync(
    path.join(SHOT_DIR, 'mobile-e2e-results.json'),
    JSON.stringify({ base: BASE, ts: new Date().toISOString(), results }, null, 2),
  );

  process.exit(failed.length ? 2 : 0);
}

main().catch((e) => {
  console.error('E2E 脚本异常:', e);
  process.exit(1);
});
