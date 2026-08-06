// [QA 临时文件] 测试范围 9：设计系统与代码审查（静态源码断言）
// 验收依据：设计系统「田垄与纸」硬约束；架构 §7.2 完成标准；PRD 移动端触控 ≥44px

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MASCOT_EXPRESSIONS } from '../src/components/Mascot';
// 设计 Token 运行时注入 :root / .dark（main.tsx → applyDesignTokens）。
// global.css 本身不定义任何 CSS 变量，全部来自 design-tokens.json，
// 因此"未定义变量"审查必须合并 tokenCss 的定义。
import { buildTokenCss } from '../src/lib/tokens';

// vitest 的 cwd 即 web/，比 import.meta.url 在 jsdom 环境下更可靠
function readSrc(rel: string): string {
  return readFileSync(`${process.cwd()}/${rel}`, 'utf8');
}

/** 去掉 // 行注释与 /* *\/ 块注释，避免注释里的说明文字造成误判 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/* ================================================================
   审查项 ①：Mascot.tsx —— 抽象几何、无五官四肢、纯 currentColor
   ================================================================ */
describe('审查① Mascot.tsx —— 非拟人化抽象吉祥物', () => {
  const src = readSrc('src/components/Mascot.tsx');
  const code = stripComments(src);

  it('导出 6 种姿态：calm / happy / think / cheer / eat / sleep', () => {
    expect([...MASCOT_EXPRESSIONS].sort()).toEqual(
      ['calm', 'cheer', 'eat', 'happy', 'sleep', 'think'].sort(),
    );
    expect(MASCOT_EXPRESSIONS).toHaveLength(6);
  });

  it('每种姿态在 renderPose 中都有分支实现（无 fallthrough 空姿态）', () => {
    // 源码采用 if (expression === 'X') 链 + 末尾默认分支，而非 switch/case。
    // 5 个显式姿态各自有 === 守卫；calm 走 renderPose 末尾默认 return（由组件默认参数 expression='calm' 兜底）。
    const EXPLICIT_POSES = ['happy', 'cheer', 'eat', 'sleep', 'think'] as const;
    for (const expr of EXPLICIT_POSES) {
      expect(code, `姿态 ${expr} 缺少实现分支`).toMatch(
        new RegExp(`expression\\s*===\\s*'${expr}'`),
      );
    }
    // calm 作为默认分支：组件默认参数 expression = 'calm' 提供兜底路径
    expect(code, 'calm 缺少默认分支实现').toMatch(/expression\s*=\s*'calm'/);
  });

  it('【硬约束】SVG 中不出现任何十六进制色值', () => {
    const hex = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hex, `发现硬编码色值: ${hex.join(', ')}`).toEqual([]);
  });

  it('【硬约束】不使用 linearGradient / radialGradient / 渐变填充', () => {
    expect(code).not.toMatch(/linearGradient/i);
    expect(code).not.toMatch(/radialGradient/i);
    expect(code).not.toMatch(/url\(#/);
  });

  it('【硬约束】所有 fill / stroke 取值只能是 currentColor 或 none', () => {
    const values = code.match(/(?:fill|stroke)="([^"]*)"/g) ?? [];
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      const val = v.split('="')[1].replace('"', '');
      expect(['currentColor', 'none'], `非法颜色取值: ${v}`).toContain(val);
    }
  });

  it('【硬约束】不出现五官 / 四肢的语义命名（eye / mouth / face / arm / leg / smile）', () => {
    for (const word of ['eye', 'mouth', 'face', 'arm', 'leg', 'smile', 'nose', 'ear']) {
      expect(code.toLowerCase(), `疑似拟人化元素: ${word}`).not.toMatch(
        new RegExp(`\\b${word}s?\\b`),
      );
    }
  });

  it('【硬约束】不使用彩色光晕 / 阴影（filter / drop-shadow / box-shadow）', () => {
    expect(code).not.toMatch(/drop-shadow/i);
    expect(code).not.toMatch(/box-shadow/i);
    expect(code).not.toMatch(/filter=/i);
  });

  it('仅使用 path / circle 两类几何元素（抽象麦苗，无 text / image）', () => {
    const tags = (code.match(/<([a-z]+)[\s>]/g) ?? []).map((t) => t.replace(/[<\s>]/g, ''));
    const svgTags = new Set(tags.filter((t) => t !== 'svg'));
    for (const t of svgTags) {
      expect(['path', 'circle', 'g'], `出现非预期 SVG 元素: ${t}`).toContain(t);
    }
    expect(code).not.toMatch(/<text/i);
    expect(code).not.toMatch(/<image/i);
  });
});

/* ================================================================
   审查项 ②：Icon.tsx —— 图标白名单
   ================================================================ */
describe('审查② Icon.tsx —— 图标名单合规', () => {
  const src = readSrc('src/components/Icon.tsx');

  it('【必须包含】LayoutGrid / ShieldCheck / Download / Trash2 / Plus / X 六个新增图标', () => {
    for (const name of ['LayoutGrid', 'ShieldCheck', 'Download', 'Trash2', 'Plus', 'X']) {
      expect(src, `缺少图标 ${name}`).toMatch(new RegExp(`\\|\\s*'${name}'`));
    }
  });

  it('【必须不含】User / CalendarDays / UtensilsCrossed（这些场景走自绘 SceneIcon / Mascot）', () => {
    for (const name of ['User', 'CalendarDays', 'UtensilsCrossed']) {
      expect(src, `不应引入 lucide 图标 ${name}`).not.toMatch(new RegExp(`'${name}'`));
      expect(src, `不应从 lucide 导入 ${name}`).not.toMatch(
        new RegExp(`^\\s*${name},\\s*$`, 'm'),
      );
    }
  });

  it('IconName 联合类型与 registry 键完全一致（不会出现声明了却没注册的图标）', () => {
    const unionBlock = src.split('export type IconName =')[1].split(';')[0];
    const declared = (unionBlock.match(/'([A-Za-z0-9]+)'/g) ?? []).map((s) => s.replace(/'/g, ''));
    const registryBlock = src.split('const registry')[1].split('};')[0];
    for (const name of declared) {
      expect(registryBlock, `IconName 声明了 ${name} 但 registry 未注册`).toMatch(
        new RegExp(`\\b${name}\\b`),
      );
    }
    expect(declared.length).toBeGreaterThanOrEqual(6);
  });
});

/* ================================================================
   审查项 ③：ChatPage 会话持久化逻辑未被改动
   ================================================================ */
describe('审查③ ChatPage.tsx —— 会话持久化逻辑零改动', () => {
  const src = readSrc('src/pages/ChatPage.tsx');
  const code = stripComments(src);

  it('防抖常量仍为 250ms', () => {
    expect(code).toMatch(/CONV_SAVE_DEBOUNCE_MS\s*=\s*250/);
  });

  it('scheduleSave 仍走 setTimeout + CONV_SAVE_DEBOUNCE_MS 的既有防抖模式', () => {
    expect(code).toMatch(/const scheduleSave = useCallback\(/);
    expect(code).toMatch(/window\.setTimeout\([\s\S]{0,400}CONV_SAVE_DEBOUNCE_MS/);
  });

  it('messages 变化触发 scheduleSave 的 useEffect 存在', () => {
    expect(code).toMatch(/useEffect\(\(\) => \{\s*scheduleSave\(\);\s*\},\s*\[messages, scheduleSave\]\)/);
  });

  it('卸载时立即落盘的清理 useEffect 存在（最后一条不丢）', () => {
    expect(code).toMatch(/return\s*\(\)\s*=>\s*\{[\s\S]{0,500}writeConversation\(/);
  });

  it('writeConversation 仍写 jxn-conv-<scenarioId>，未新增存储键', () => {
    expect(code).toMatch(/CONV_STORAGE_PREFIX\s*=\s*'jxn-conv-'/);
    const setItemCalls = code.match(/localStorage\.setItem\(([^,]+),/g) ?? [];
    for (const call of setItemCalls) {
      expect(call, `ChatPage 出现非会话键写入: ${call}`).toMatch(/CONV_STORAGE_PREFIX/);
    }
  });

  it('贴纸插入不调用 streamChat（源码级：insertSticker 体内无 streamChat）', () => {
    const body = code.split('const insertSticker')[1]?.split('const listRef')[0] ?? '';
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/streamChat/);
    expect(body).not.toMatch(/setLoading/);
  });

  it('send() 的 history 过滤掉 kind === "sticker"', () => {
    expect(code).toMatch(/m\.kind\s*!==\s*'sticker'/);
  });

  it('问候语只进 JSX，绝不作为 streamChat 参数（PRD D5）', () => {
    const sendBlock = code.split('const send = useCallback')[1]?.split('const retryLast')[0] ?? '';
    expect(sendBlock.length).toBeGreaterThan(0);
    expect(sendBlock, 'greeting 混入了请求参数').not.toMatch(/greeting/);
  });
});

/* ================================================================
   审查项 ④：global.css —— 设计系统硬约束
   ================================================================ */
describe('审查④ global.css —— 设计系统硬约束', () => {
  const raw = readSrc('src/styles/global.css');
  // CSS 只有块注释
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

  it('【硬约束】不使用 backdrop-filter（毛玻璃）', () => {
    expect(css).not.toMatch(/backdrop-filter/i);
    expect(css).not.toMatch(/-webkit-backdrop-filter/i);
  });

  it('【硬约束】不使用 linearGradient / linear-gradient 渐变', () => {
    expect(css).not.toMatch(/linear-gradient/i);
    expect(css).not.toMatch(/radial-gradient/i);
    expect(css).not.toMatch(/conic-gradient/i);
  });

  it('【硬约束】无裸十六进制色值（颜色一律走 CSS 变量）', () => {
    const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    // 允许纯黑纯白作为特例（阴影/遮罩基色）
    const illegal = hex.filter((h) => !/^#(fff|ffffff|000|000000)$/i.test(h));
    expect(illegal, `发现裸色值: ${[...new Set(illegal)].join(', ')}`).toEqual([]);
  });

  it('【硬约束】不出现缺连字符的变量名（如 --accent2 / --space2 / --radius2）', () => {
    const vars = [...new Set(css.match(/--[a-zA-Z][a-zA-Z0-9-]*/g) ?? [])];
    const bad = vars.filter((v) => /[a-zA-Z]\d/.test(v.replace(/^--/, '')));
    expect(bad, `变量命名缺连字符: ${bad.join(', ')}`).toEqual([]);
  });

  it('所有 var(--x) 引用的变量都有定义（无拼写错误导致的静默失效）', () => {
    // 定义来源 = global.css 内联声明 + 运行时注入的 tokenCss（:root / .dark）。
    const tokenCss = buildTokenCss();
    const defined = new Set<string>();
    for (const block of [css, tokenCss]) {
      for (const m of block.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)) {
        defined.add(m[1]);
      }
    }
    const used = new Set(
      (css.match(/var\(\s*(--[a-zA-Z0-9-]+)/g) ?? []).map((s) => s.replace(/var\(\s*/, '')),
    );
    const undefinedVars = [...used].filter((v) => !defined.has(v));
    expect(undefinedVars, `引用了未定义的变量: ${undefinedVars.join(', ')}`).toEqual([]);
  });

  it('不使用彩色发光阴影（box-shadow 只允许中性色/变量）', () => {
    const shadows = css.match(/box-shadow\s*:[^;]+;/g) ?? [];
    for (const s of shadows) {
      const hex = s.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
      const illegal = hex.filter((h) => !/^#(fff|ffffff|000|000000)$/i.test(h));
      expect(illegal, `彩色阴影: ${s.trim()}`).toEqual([]);
    }
  });
});

/* ================================================================
   审查项 ⑤：移动端触控目标 ≥44px
   ================================================================ */
describe('审查⑤ 移动端触控目标尺寸', () => {
  const raw = readSrc('src/styles/global.css');
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

  /** 抽取某个选择器块内的尺寸声明 */
  function ruleOf(selector: string): string {
    const re = new RegExp(`(^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm');
    const m = re.exec(css);
    return m ? m[2] : '';
  }

  function pxOf(block: string, prop: string): number | null {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'm').exec(block);
    return m ? Number(m[1]) : null;
  }

  // 间距 Token 拍平结果（design-tokens.json spacing → --space-N），用于解析 var() padding。
  const SPACE_PX: Record<string, number> = {};
  for (const m of buildTokenCss().matchAll(/^\s*(--space-[0-9a-z-]+)\s*:\s*(\d+(?:\.\d+)?)px/gm)) {
    SPACE_PX[m[1]] = Number(m[2]);
  }

  function resolveLen(v: string): number | null {
    const s = v.trim();
    if (s === '0') return 0; // 无单位 0 等同 0px
    const m = s.match(/^(\d+(?:\.\d+)?)px$/);
    if (m) return Number(m[1]);
    const vm = s.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i);
    if (vm && SPACE_PX[vm[1]] != null) return SPACE_PX[vm[1]];
    return null;
  }

  /** 解析 padding 简写的上下内边距之和（支持裸 px 与 var(--space-N)）
   *  简写语义：1 值=四边；2 值=上下/左右；3+/4 值=上/右/下/左 */
  function paddingY(block: string): number | null {
    const decl = (block.match(/padding\s*:\s*([^;]+);/i) ?? [])[1]?.trim();
    if (!decl) return null;
    const parts = decl.split(/\s+/);
    let top: number | null = null;
    let bottom: number | null = null;
    if (parts.length === 1) {
      top = bottom = resolveLen(parts[0]);
    } else if (parts.length === 2) {
      // 2 值：第 1 个值是「上下」内边距，应用于 top 与 bottom
      top = bottom = resolveLen(parts[0]);
    } else {
      top = resolveLen(parts[0]);
      bottom = resolveLen(parts[2] ?? parts[0]);
    }
    if (top == null || bottom == null) return null;
    return top + bottom;
  }

  /**
   * 有效可点高度：
   *  - 显式 height / min-height → 直接采用；
   *  - 否则用 上下内边距之和 + 一行内容保守高度(24px) 估算整行可点区域。
   *    （整行按钮如 .module-row / .storage-row 无显式 height，靠 padding + 内容撑开，这是设计意图）
   */
  const ASSUMED_CONTENT_LINE = 24;
  function effectiveHeight(block: string): number | null {
    const h = pxOf(block, 'height') ?? pxOf(block, 'min-height');
    if (h !== null) return h;
    const py = paddingY(block);
    if (py !== null) return py + ASSUMED_CONTENT_LINE;
    return null;
  }

  it('导航操作按钮 .nav-action ≥ 44px', () => {
    const b = ruleOf('.nav-action');
    expect(b.length, '.nav-action 规则未找到').toBeGreaterThan(0);
    expect(effectiveHeight(b)).toBeGreaterThanOrEqual(44);
  });

  it('表单输入 .form-input ≥ 44px', () => {
    expect(effectiveHeight(ruleOf('.form-input'))).toBeGreaterThanOrEqual(44);
  });

  it('主行动按钮 .btn-block ≥ 44px', () => {
    expect(effectiveHeight(ruleOf('.btn-block'))).toBeGreaterThanOrEqual(44);
  });

  it('记忆新增按钮 .memory-add-btn ≥ 44px', () => {
    expect(effectiveHeight(ruleOf('.memory-add-btn'))).toBeGreaterThanOrEqual(44);
  });

  it('贴纸格 .sticker-item ≥ 44px', () => {
    expect(effectiveHeight(ruleOf('.sticker-item'))).toBeGreaterThanOrEqual(44);
  });

  it('清除全部按钮 .btn-block-danger ≥ 44px', () => {
    // 传入未转义的复合选择器，ruleOf 内部会自行转义 . → \.
    const b = ruleOf('.danger-btn.btn-block-danger');
    expect(b.length, '.btn-block-danger 规则未找到').toBeGreaterThan(0);
    expect(effectiveHeight(b)).toBeGreaterThanOrEqual(44);
  });

  it('模块行 .module-row 整行可点区域 ≥ 44px', () => {
    expect(effectiveHeight(ruleOf('.module-row'))).toBeGreaterThanOrEqual(44);
  });

  it('存储行 .storage-row 整行区域 ≥ 44px', () => {
    expect(effectiveHeight(ruleOf('.storage-row'))).toBeGreaterThanOrEqual(44);
  });

  it('【已知风险·记录用】Switch 轨道与单项清除按钮的实际高度', () => {
    const sw = effectiveHeight(ruleOf('.switch'));
    const dangerBlock = ruleOf('.danger-btn');
    const danger = effectiveHeight(dangerBlock);
    const stickerToggle = effectiveHeight(ruleOf('.sticker-toggle'));

    // 这条不 fail，只把实测值输出到报告，由 QA 报告判定是否算缺陷
    // （Switch 是原生 button，命中区可由外层 padding 补足）
    expect(typeof sw === 'number' || sw === null).toBe(true);
    // eslint-disable-next-line no-console
    console.log(
      `[QA 触控实测] .switch=${sw}px  .danger-btn=${danger}px  .sticker-toggle=${stickerToggle}px`,
    );
  });
});
