#!/usr/bin/env node
/**
 * 缺陷三连定性探针：区分「源码缺陷」与「测试选择器假设错误」
 *  1) .nav-back 到底存不存在？打印 chat 页头部真实 DOM
 *  2) 点 .input-pill 的内边距区域能否聚焦输入框？（决定 22.5px 是否为真实缺陷）
 *  3) .send-btn 命中区是否被伪元素/padding 扩大？（40x40 是否为真实命中区）
 */
import { chromium, devices } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4200';

const browser = await chromium.launch({ channel: 'msedge' });
const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.locator('.btn-primary').first().tap();
await page.waitForSelector('.chat-input');

// ---- 1) 头部真实 DOM ----
const headerHtml = await page.evaluate(() => {
  const h = document.querySelector('.app-header') || document.querySelector('.nav-bar');
  return h ? h.outerHTML : '(无 .app-header/.nav-bar)';
});
console.log('===== 1) Chat 页头部 DOM =====');
console.log(headerHtml.slice(0, 1200));

const backCandidates = await page.evaluate(() =>
  [...document.querySelectorAll('button,a,[role="button"]')].map((e) => ({
    cls: e.className?.toString?.() || '',
    aria: e.getAttribute('aria-label') || '',
    txt: (e.textContent || '').trim().slice(0, 12),
    w: +e.getBoundingClientRect().width.toFixed(1),
    h: +e.getBoundingClientRect().height.toFixed(1),
  })),
);
console.log('\n===== 可点击元素清单（类名/aria/尺寸）=====');
for (const c of backCandidates) console.log(`  ${c.w}x${c.h}  cls="${c.cls}" aria="${c.aria}" txt="${c.txt}"`);

// ---- 2) 点 input-pill 内边距区能否聚焦 ----
const pill = await page.locator('.input-pill').boundingBox();
const input = await page.locator('.chat-input').boundingBox();
console.log('\n===== 2) 输入胶囊 vs 输入框 =====');
console.log(`  .input-pill  ${pill.width.toFixed(1)}x${pill.height.toFixed(1)} @y=${pill.y.toFixed(1)}`);
console.log(`  .chat-input  ${input.width.toFixed(1)}x${input.height.toFixed(1)} @y=${input.y.toFixed(1)}`);

// 点 pill 顶部内边距（输入框上方 ~6px 处）
const padY = pill.y + 4;
const padX = pill.x + pill.width / 2;
await page.touchscreen.tap(padX, padY);
await page.waitForTimeout(250);
const focusedAfterPad = await page.evaluate(() => ({
  tag: document.activeElement?.tagName,
  cls: document.activeElement?.className?.toString?.() || '',
}));
console.log(`  点击胶囊内边距(y=${padY.toFixed(1)}) 后 activeElement = ${focusedAfterPad.tag}.${focusedAfterPad.cls}`);
const padFocusOk = focusedAfterPad.cls.includes('chat-input');
console.log(`  → 内边距区可聚焦输入框: ${padFocusOk ? '是（44px 胶囊即有效命中区，测试假设需修正）' : '否（有效命中区确为 22.5px，真实缺陷）'}`);

// ---- 3) send-btn 命中区 ----
const sendInfo = await page.evaluate(() => {
  const b = document.querySelector('.send-btn');
  const r = b.getBoundingClientRect();
  const cs = getComputedStyle(b);
  // 用 elementFromPoint 探测按钮外沿 2px 处是否仍命中按钮（伪元素扩大命中区）
  const probe = (dx, dy) => {
    const el = document.elementFromPoint(r.left + r.width / 2 + dx, r.top + r.height / 2 + dy);
    return el ? (el.closest('.send-btn') ? 'send-btn' : el.className?.toString?.() || el.tagName) : 'null';
  };
  return {
    w: +r.width.toFixed(1),
    h: +r.height.toFixed(1),
    padding: cs.padding,
    outAt24: probe(0, 24), // 中心下方 24px（超出 40/2=20 半高）
    outAtNeg24: probe(0, -24),
  };
});
console.log('\n===== 3) 发送按钮命中区 =====');
console.log(`  .send-btn ${sendInfo.w}x${sendInfo.h} padding=${sendInfo.padding}`);
console.log(`  中心+24px 命中: ${sendInfo.outAt24}   中心-24px 命中: ${sendInfo.outAtNeg24}`);
console.log(
  `  → 命中区是否已扩大到 ≥48px: ${sendInfo.outAt24 === 'send-btn' && sendInfo.outAtNeg24 === 'send-btn' ? '是' : '否（真实命中区即 40x40，低于 44px 标准）'}`,
);

await browser.close();
