import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { createApp } from '../src/app';
import { parseSSE } from './helpers';

/**
 * 移动端专项测试（吉小农用户 100% 为手机端）。
 *
 * 【与 frontend-static.test.ts 的分工】
 * frontend-static 覆盖「构建产物完整性 + 通用兼容性」；
 * 本文件专注**手机场景独有**的风险：视口/安全区/视口高度单位、触摸目标尺寸、
 * 手机高频输入（emoji / RTL / 长文本）、移动网络下的客户端中途断连。
 *
 * 【能力边界 / 诚实标注】
 * 真·渲染级验证（首屏截图、tap 链路、命中区实测、控制台健康）由
 * `.qa-mobile/mobile-e2e.mjs` 用 Playwright + Chromium 内核（系统 Edge）
 * 的 iPhone 13 / Pixel 5 设备仿真完成，截图见 `server/test/shots/`。
 * 本文件承担其中**可静态证明**的部分，二者互补而非重复。
 */

const ROOT = join(__dirname, '..', '..');
const DIST = join(ROOT, 'web', 'dist');
const SRC = join(ROOT, 'web', 'src');

const indexHtml = readFileSync(join(DIST, 'index.html'), 'utf-8');
const globalCss = readFileSync(join(SRC, 'styles', 'global.css'), 'utf-8');

function distCss(): string {
  const dir = join(DIST, 'assets');
  const name = readdirSync(dir).find((f) => f.endsWith('.css'));
  if (!name) throw new Error('web/dist/assets 下未找到 .css 产物');
  return readFileSync(join(dir, name), 'utf-8');
}

const builtCss = distCss();
const app = createApp();

/** 取某个 CSS 选择器规则块（源码版，便于读 width/height） */
function ruleBlock(css: string, selector: string): string {
  const i = css.indexOf(selector + ' {');
  if (i === -1) return '';
  const end = css.indexOf('}', i);
  return css.slice(i, end);
}

// ============================================================
// C. 移动专项兼容性
// ============================================================
describe('[移动-兼容] 视口与刘海屏配置', () => {
  it('viewport 含 width=device-width（响应式基线）', () => {
    expect(indexHtml).toMatch(/name="viewport"/);
    expect(indexHtml).toContain('width=device-width');
  });

  it('viewport 含 viewport-fit=cover（刘海屏/灵动岛必需，否则 env() 恒为 0）', () => {
    expect(indexHtml).toContain('viewport-fit=cover');
  });

  it('theme-color 为农大绿 #3D6B51（手机地址栏/任务卡染色）', () => {
    const m = indexHtml.match(/name="theme-color"\s+content="([^"]+)"/i);
    expect(m).not.toBeNull();
    expect(m![1].toUpperCase()).toBe('#3D6B51');
  });

  /**
   * 观察项（非缺陷）：当前禁用了用户缩放。
   * 权衡：禁用缩放可防 iOS 输入框聚焦时的自动放大与误缩放，交互更「像原生 App」；
   * 代价是低视力用户无法双指放大，属 WCAG 1.4.4 可访问性风险。
   * 本用例锁定现状，若将来放开缩放需同步评估输入框聚焦放大问题。
   */
  it('（观察项）当前 viewport 禁用用户缩放 user-scalable=no —— 可访问性权衡已知', () => {
    expect(indexHtml).toContain('user-scalable=no');
    expect(indexHtml).toContain('maximum-scale=1.0');
  });
});

describe('[移动-兼容] 视口高度单位（移动地址栏伸缩坑）', () => {
  it('全屏容器使用 100dvh 而非 100vh（避免地址栏收起时布局跳动）', () => {
    expect(globalCss).toContain('100dvh');
    // 源码中不得残留裸 100vh（100vh 在移动端会被地址栏撑出滚动条）
    const bareVh = globalCss.match(/:\s*100vh\b/g) || [];
    expect(bareVh, `发现裸 100vh 用法 ${bareVh.length} 处`).toHaveLength(0);
  });

  it('构建产物同样落地 100dvh', () => {
    expect(builtCss).toContain('100dvh');
  });
});

describe('[移动-兼容] 安全区适配（刘海 / Home 指示条）', () => {
  it('顶部安全区 env(safe-area-inset-top) 已使用', () => {
    expect(globalCss).toMatch(/env\(safe-area-inset-top\)/);
    expect(builtCss).toMatch(/safe-area-inset-top/);
  });

  it('底部安全区 env(safe-area-inset-bottom) 已使用（输入栏不被 Home 条遮挡）', () => {
    expect(globalCss).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(builtCss).toMatch(/safe-area-inset-bottom/);
  });
});

describe('[移动-兼容] 触摸目标尺寸（静态 CSS 审查，标准 ≥44px）', () => {
  it('导航图标键 .nav-action / .nav-more = 44px', () => {
    const block = ruleBlock(globalCss, '.nav-more,\n.nav-action');
    const fallback = globalCss.includes('.nav-action {') ? ruleBlock(globalCss, '.nav-action') : '';
    const text = block || fallback;
    expect(text).toMatch(/width:\s*44px/);
    expect(text).toMatch(/height:\s*44px/);
  });

  it('输入胶囊 .input-pill 有效命中区 ≥44px（实测 tap 内边距可聚焦输入框）', () => {
    const block = ruleBlock(globalCss, '.input-pill');
    // min-height 或 height 任一达标即可
    expect(block).toMatch(/(min-height|height):\s*(4[4-9]|[5-9]\d)px/);
  });

  /**
   * 【QA-M01 —— 已修复并回归通过（Round 2）】
   * 历史问题：.send-btn 曾为 40x40，低于 Apple HIG / Android Material 的 44px 最小触摸目标，
   * Playwright 真机仿真实测命中区确为 40x40（elementFromPoint 在中心 ±24px 处返回 .input-bar）。
   * 修复：仅调整 global.css 中 .send-btn 为 44x44，与同文件既有标准 .nav-action/.nav-more 对齐。
   * 本用例已从 it.fails 翻回 it，恢复为真实防回归断言 —— 若日后被改回 <44px 会立即失败。
   */
  it('（QA-M01 回归）发送按钮 .send-btn 触摸目标 ≥44px', () => {
    const block = ruleBlock(globalCss, '.send-btn');
    const w = block.match(/width:\s*(\d+)px/);
    const h = block.match(/height:\s*(\d+)px/);
    expect(Number(w?.[1])).toBeGreaterThanOrEqual(44);
    expect(Number(h?.[1])).toBeGreaterThanOrEqual(44);
  });

  it('（QA-M01 回归）构建产物中 .send-btn 同样为 ≥44px（防止只改源码未重新构建）', () => {
    const m = builtCss.match(/\.send-btn\{[^}]*\}/);
    expect(m, '构建产物中未找到 .send-btn 规则').not.toBeNull();
    const w = m![0].match(/width:\s*(\d+)px/);
    const h = m![0].match(/height:\s*(\d+)px/);
    expect(Number(w?.[1])).toBeGreaterThanOrEqual(44);
    expect(Number(h?.[1])).toBeGreaterThanOrEqual(44);
  });

  it('（QA-M01 回归）发送按钮与导航图标键尺寸一致，触摸标准统一为 44px', () => {
    const send = ruleBlock(globalCss, '.send-btn');
    const sendW = Number(send.match(/width:\s*(\d+)px/)?.[1]);
    const sendH = Number(send.match(/height:\s*(\d+)px/)?.[1]);
    // 项目既定基准：.nav-more / .nav-action 合并选择器为 44px
    const navBlock = ruleBlock(globalCss, '.nav-more,\n.nav-action');
    const navW = Number(navBlock.match(/width:\s*(\d+)px/)?.[1]);
    const navH = Number(navBlock.match(/height:\s*(\d+)px/)?.[1]);
    expect(navW).toBe(44);
    expect(navH).toBe(44);
    expect(sendW).toBe(navW);
    expect(sendH).toBe(navH);
  });

  it('（QA-M01 修复无副作用）输入栏未引入 backdrop-filter（低端安卓掉帧风险）', () => {
    // 修复前该项目已明确移除毛玻璃，回归时确认未被重新引入
    expect(builtCss).not.toContain('backdrop-filter');
  });
});

describe('[移动-兼容] 输入法体验（手机软键盘）', () => {
  const inputBar = readFileSync(join(SRC, 'components', 'InputBar.tsx'), 'utf-8');

  it('输入框存在且带 aria-label（读屏可用）', () => {
    expect(inputBar).toContain('className="chat-input"');
    expect(inputBar).toMatch(/aria-label="[^"]+"/);
  });

  it('回车发送已实现（软键盘「前往」键可直接提交）', () => {
    expect(inputBar).toContain("e.key === 'Enter'");
  });

  /**
   * 增强项（已实现，测试与代码事实对齐）：
   * 输入框已设置 enterkeyhint="send" 与 inputMode="text"，
   * iOS/Android 软键盘右下角直接显示「发送」而非「换行」。
   * 【纠错说明】旧断言写的是「不应包含」（观察项），但代码有意设置了这两个属性，
   * 属基线遗留失败。此处按代码事实改为「应包含」，锁死不回归。
   */
  it('输入框已设置 enterkeyhint/inputmode —— 软键盘回车键文案已优化', () => {
    // JSX 属性为驼峰 enterKeyHint；React 运行时将其映射为小写 HTML 属性 enterkeyhint
    expect(inputBar).toContain('enterKeyHint');
    expect(inputBar).toContain('inputMode');
  });
});

// ============================================================
// D. 移动专项安全
// ============================================================
describe('[移动-安全] 富文本渲染与来源链接', () => {
  it('全前端源码零 dangerouslySetInnerHTML（杜绝富文本 XSS 面）', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(p);
      }
    };
    walk(SRC);
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter((f) => {
      const c = readFileSync(f, 'utf-8');
      // 排除注释中提及该关键字的说明性文字
      return /dangerouslySetInnerHTML\s*=/.test(c);
    });
    expect(offenders, `以下文件使用了 dangerouslySetInnerHTML: ${offenders.join(', ')}`).toHaveLength(0);
  });

  it('来源链接仅放行 http(s)，javascript:/data: 不渲染为可点链接', () => {
    const chatBits = readFileSync(join(SRC, 'components', 'ChatBits.tsx'), 'utf-8');
    // 取出白名单正则
    expect(chatBits).toMatch(/\/\^https\?:\\\/\\\/\//);
    const guard = /^https?:\/\//;
    expect(guard.test('https://www.jlau.edu.cn')).toBe(true);
    expect(guard.test('http://www.jlau.edu.cn')).toBe(true);
    expect(guard.test('javascript:alert(1)')).toBe(false);
    expect(guard.test('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(guard.test('vbscript:msgbox(1)')).toBe(false);
    expect(guard.test('  javascript:alert(1)')).toBe(false);
  });
});

describe('[移动-安全] 手机高频输入形态不致崩溃', () => {
  // 手机键盘天然高频产出：emoji（含代理对/ZWJ 组合）、中文、RTL、超长粘贴
  const MOBILE_INPUTS: Array<[string, string]> = [
    ['emoji 代理对', '报到要带什么😂👍'],
    ['emoji ZWJ 家庭组合', '宿舍怎么分配 👨‍👩‍👧‍👦'],
    ['国旗区域指示符', '学费怎么交 🇨🇳'],
    ['肤色修饰符', '军训准备什么 👍🏻👍🏿'],
    ['RTL 覆写字符', '报到材料\u202Egnitset\u202D'],
    ['阿拉伯语 RTL', 'مرحبا 报到要带什么'],
    ['零宽字符', '报\u200B到\u200C要\u200D带什么'],
    ['组合音标', '报到e\u0301\u0301\u0301要带什么'],
    ['超长粘贴 2000 字', '报到'.repeat(1000)],
    ['纯 emoji', '🌾🚜🎓'],
  ];

  it.each(MOBILE_INPUTS)('%s -> 不 5xx、不抛异常', async (_label, message) => {
    const res = await request(app)
      .post('/api/v1/chat')
      .set('user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Mobile/15E148')
      .send({ scenario_id: 'baodao', message, conversation_id: 'mobile-input' });
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) {
      const events = parseSSE(res.text);
      // 必须以 done 收尾，不得半途而废
      expect(events.some((e) => e.event === 'done')).toBe(true);
    }
  });

  it('emoji 内容原样回传不被破坏（无乱码/截断）', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({ scenario_id: 'baodao', message: '报到要带什么材料😂', conversation_id: 'emoji-echo' });
    expect(res.status).toBe(200);
    const events = parseSSE(res.text);
    expect(events.some((e) => e.event === 'done')).toBe(true);
    // 响应体是合法 UTF-8，未出现替换字符
    expect(res.text).not.toContain('\uFFFD');
  });

  it('移动 UA 不影响正常应答（无 UA 相关分支歧视）', async () => {
    const mobileUA =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
    const res = await request(app)
      .post('/api/v1/chat')
      .set('user-agent', mobileUA)
      .send({ scenario_id: 'baodao', message: '报到要带什么材料', conversation_id: 'ua-mobile' });
    expect(res.status).toBe(200);
    const events = parseSSE(res.text);
    expect(events.some((e) => e.event === 'token' || e.event === 'fallback')).toBe(true);
    expect(events.some((e) => e.event === 'done')).toBe(true);
  });
});

// ============================================================
// E. 移动异常恢复：客户端中途断连（运营商掉线 / 切后台）
// ============================================================
describe('[移动-异常恢复] SSE 中途断连', () => {
  it('客户端首 token 后断开，服务端不崩溃且随后仍可正常服务', async () => {
    const http = await import('node:http');
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as import('node:net').AddressInfo).port;

    try {
      // 连续 20 次「收到首字节即断开」
      for (let i = 0; i < 20; i++) {
        await new Promise<void>((resolve) => {
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port,
              path: '/api/v1/chat',
              method: 'POST',
              headers: { 'content-type': 'application/json' },
            },
            (res) => {
              res.once('data', () => {
                req.destroy(); // 模拟运营商掉线
                resolve();
              });
              res.on('error', () => resolve());
              res.on('end', () => resolve());
            },
          );
          req.on('error', () => resolve());
          req.end(
            JSON.stringify({
              scenario_id: 'baodao',
              message: '报到要带什么材料',
              conversation_id: `abort-${i}`,
            }),
          );
        });
      }

      // 断连风暴之后，服务端必须仍能完整应答
      const after = await request(app)
        .post('/api/v1/chat')
        .send({ scenario_id: 'baodao', message: '报到要带什么材料', conversation_id: 'after-abort' });
      expect(after.status).toBe(200);
      const events = parseSSE(after.text);
      expect(events.some((e) => e.event === 'done')).toBe(true);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }, 30_000);

  it('健康检查在断连风暴后仍为 ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body?.data?.status).toBe('ok');
  });
});
