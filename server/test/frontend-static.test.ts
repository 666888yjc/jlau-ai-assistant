import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * 前端静态产物校验（兼容性 + 安全的可自动化部分）。
 *
 * 【能力边界 / 诚实标注】
 * 本沙箱无浏览器农场（无 Chrome / Safari / Firefox 引擎，无真机），
 * 因此**无法执行真·多引擎渲染矩阵测试**（布局回归、CSS 兼容降级、触摸交互）。
 * 这里以「构建产物静态校验 + 响应式 token 体系审查 + XSS 渲染策略源码审查」替代，
 * 覆盖的是**可被静态证明**的兼容性与安全属性，不覆盖真实渲染差异。
 */

const ROOT = join(__dirname, '..', '..');
const WEB = join(ROOT, 'web');
const DIST = join(WEB, 'dist');

function distAsset(ext: '.js' | '.css'): { name: string; content: string } {
  const dir = join(DIST, 'assets');
  const name = readdirSync(dir).find((f) => f.endsWith(ext));
  if (!name) throw new Error(`web/dist/assets 下未找到 ${ext} 产物`);
  return { name, content: readFileSync(join(dir, name), 'utf-8') };
}

describe('[兼容性] web/dist 构建产物完整性', () => {
  const indexHtml = readFileSync(join(DIST, 'index.html'), 'utf-8');

  it('index.html 存在且含 SPA 挂载点 #root', () => {
    expect(existsSync(join(DIST, 'index.html'))).toBe(true);
    expect(indexHtml).toContain('<div id="root">');
  });

  it('引用的 JS / CSS 哈希文件真实存在（无断链）', () => {
    const refs = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThanOrEqual(2);
    for (const ref of refs) {
      const abs = join(DIST, ref.replace(/^\//, ''));
      expect(existsSync(abs), `引用的资源不存在: ${ref}`).toBe(true);
    }
    expect(refs.some((r) => r.endsWith('.js'))).toBe(true);
    expect(refs.some((r) => r.endsWith('.css'))).toBe(true);
  });

  it('theme-color 已更新为农大绿 #3D6B51（非微信绿）', () => {
    const m = indexHtml.match(/name="theme-color"\s+content="([^"]+)"/i);
    expect(m).not.toBeNull();
    expect(m![1].toUpperCase()).toBe('#3D6B51');
    // 剥离 HTML 注释：index.html 中保留了一行「主色已由 #07C160 改为 #3D6B51」的变更说明注释，
    // 那是文档而非实际生效的颜色值，不应算作残留。
    const withoutComments = indexHtml.replace(/<!--[\s\S]*?-->/g, '').toLowerCase();
    expect(withoutComments).not.toContain('#07c160');
    expect(withoutComments).not.toContain('07c160');
  });

  it('移动端 viewport 配置齐全（含 viewport-fit=cover 适配刘海屏）', () => {
    expect(indexHtml).toMatch(/name="viewport"/);
    expect(indexHtml).toContain('width=device-width');
    expect(indexHtml).toContain('viewport-fit=cover');
  });

  it('lang=zh-CN 且 charset=UTF-8（中文渲染兼容）', () => {
    expect(indexHtml).toMatch(/<html lang="zh-CN">/);
    expect(indexHtml).toMatch(/charset="UTF-8"/i);
  });

  it('内联防白闪样式覆盖深色模式偏好', () => {
    expect(indexHtml).toContain('prefers-color-scheme: dark');
  });
});

describe('[兼容性] CSS 设计 token 体系', () => {
  const { name, content: css } = distAsset('.css');

  it(`产物 ${'CSS'} 非空且体积合理`, () => {
    expect(css.length).toBeGreaterThan(1000);
    expect(name).toMatch(/^index-.*\.css$/);
  });

  it('含新设计 token --accent 家族', () => {
    expect(css).toContain('--accent');
    for (const t of ['--accent-hover', '--accent-active', '--accent-on']) {
      expect(css, `缺少 token ${t}`).toContain(t);
    }
  });

  it('含 grain 质感 token（--grain / --grain-soft / --grain-deep）', () => {
    expect(css).toContain('--grain');
    expect(css).toContain('--grain-soft');
    expect(css).toContain('--grain-deep');
  });

  it('无 backdrop-filter 真实声明（低端机 / 老 WebView 兼容）', () => {
    // 排除注释后检查实际声明
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(stripped).not.toMatch(/(^|[;{\s])(-webkit-)?backdrop-filter\s*:/);
  });

  it('无残留旧微信绿 #07C160', () => {
    expect(css.toLowerCase()).not.toContain('07c160');
  });

  it('含响应式断点（@media）以支撑多尺寸适配', () => {
    const mediaCount = (css.match(/@media/g) || []).length;
    expect(mediaCount).toBeGreaterThan(0);
  });
});

describe('[安全] 前端产物不含任何服务端密钥', () => {
  const js = distAsset('.js').content;
  const css = distAsset('.css').content;
  const indexHtml = readFileSync(join(DIST, 'index.html'), 'utf-8');
  const all = `${js}\n${css}\n${indexHtml}`;

  it('无 sk- / pat_ 形态的真实密钥串', () => {
    expect(all).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
    expect(all).not.toMatch(/pat_[A-Za-z0-9]{16,}/);
  });

  it('无密钥环境变量名泄露', () => {
    for (const k of ['SILICONFLOW_API_KEY', 'COZE_API_TOKEN', 'AMAP_API_KEY', 'COZE_BOT_ID']) {
      expect(all, `产物中出现了 ${k}`).not.toContain(k);
    }
  });

  it('与 server/.env 中的真实密钥逐一比对：均未出现在产物中', () => {
    const envPath = join(ROOT, 'server', '.env');
    if (!existsSync(envPath)) return; // 无 .env 时跳过（CI 环境）
    const secrets = readFileSync(envPath, 'utf-8')
      .split('\n')
      .filter((l) => /^(SILICONFLOW_API_KEY|COZE_API_TOKEN|AMAP_API_KEY)=/.test(l.trim()))
      .map((l) => l.split('=').slice(1).join('=').trim())
      .filter((v) => v.length >= 8);

    for (const s of secrets) {
      expect(all, '构建产物泄露了后端密钥！').not.toContain(s);
    }
  });

  it('不含 Authorization Bearer 硬编码', () => {
    expect(all).not.toMatch(/Bearer\s+(sk-|pat_)/);
  });
});

describe('[安全] 前端 XSS 渲染策略（源码审查）', () => {
  const mdPath = join(WEB, 'src', 'components', 'MarkdownText.tsx');
  const md = readFileSync(mdPath, 'utf-8');
  /** 去掉注释后的有效代码，避免把「文档里提到的词」误判成实际用法 */
  const mdCode = md.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('MarkdownText 未使用 dangerouslySetInnerHTML / innerHTML（无 HTML 注入面）', () => {
    expect(mdCode).not.toContain('dangerouslySetInnerHTML');
    expect(mdCode).not.toContain('innerHTML');
  });

  it('MarkdownText 未使用 eval / new Function', () => {
    expect(mdCode).not.toMatch(/\beval\s*\(/);
    expect(mdCode).not.toMatch(/new\s+Function\s*\(/);
  });

  it('链接协议白名单：仅 http/https 渲染为 <a>，其余降级纯文本', () => {
    expect(mdCode).toMatch(/function\s+safeHref/);
    expect(mdCode).toMatch(/\^https\?:\\\/\\\//);
    // javascript: 等协议返回 null -> 不渲染 <a>
    expect(mdCode).toMatch(/return\s+\/\^https\?:\\\/\\\/\/i\.test\(trimmed\)\s*\?\s*trimmed\s*:\s*null/);
  });

  it('外链带 rel="noreferrer"（防 tabnabbing）', () => {
    const anchors = mdCode.match(/<a[^>]*>/g) || [];
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      if (a.includes('target="_blank"')) {
        expect(a, `外链缺少 rel=noreferrer: ${a}`).toContain('rel="noreferrer"');
      }
    }
  });

  it('全站源码未使用 dangerouslySetInnerHTML（React 自动转义为唯一渲染路径）', () => {
    const srcDir = join(WEB, 'src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          const code = readFileSync(p, 'utf-8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
          if (code.includes('dangerouslySetInnerHTML') || /\.innerHTML\s*=/.test(code)) offenders.push(p);
        }
      }
    };
    walk(srcDir);
    expect(offenders, `以下文件使用了 HTML 注入 API: ${offenders.join(', ')}`).toEqual([]);
  });

  it('AI 气泡走 MarkdownText，user 气泡不走 markdown 渲染', () => {
    const bits = readFileSync(join(WEB, 'src', 'components', 'ChatBits.tsx'), 'utf-8');
    expect(bits).toContain('MarkdownText');
    // 条件渲染：renderMarkdown 为真才走 markdown
    expect(bits).toMatch(/renderMarkdown\s*\?\s*<MarkdownText/);
  });
});
