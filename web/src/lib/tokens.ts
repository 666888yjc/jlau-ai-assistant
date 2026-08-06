// 设计 Token 接入层。
// 唯一事实源：../../../design-system/design-tokens.json（设计师锁定，前端 import 引入）。
// 本模块将其拍平为 CSS 自定义属性注入 :root（含 .dark 覆盖），禁止在组件里硬编码颜色。
import designTokens from '../../../design-system/design-tokens.json';

interface ColorToken {
  value: string;
  type: string;
  role?: string;
}
interface TokenFile {
  color: Record<string, ColorToken>;
  colorDark: Record<string, ColorToken>;
  /** 品牌渐变（值内可引用 --accent 等色彩变量，深色模式自动跟随） */
  gradient?: Record<string, { value: string }>;
  /** 深色模式下需要单独重写的渐变（当前为空：渐变体系已全量下线） */
  gradientDark?: Record<string, { value: string }>;
  font: {
    body: { value: string };
    mono: { value: string };
    size: Record<string, { value: string }>;
    weight: Record<string, { value: string }>;
  };
  /** 行高阶梯 → --leading-*（禁止在 CSS 中裸写 line-height 数值） */
  leading?: Record<string, { value: string }>;
  /** 字距阶梯 → --tracking-*（禁止在 CSS 中裸写 letter-spacing 数值） */
  tracking?: Record<string, { value: string }>;
  radius: Record<string, { value: string }>;
  spacing: Record<string, { value: string }>;
  shadow: Record<string, { value: string }>;
  /** 深色模式阴影覆盖：在 .dark 一次性重写，避免逐选择器 box-shadow:none 打补丁 */
  shadowDark?: Record<string, { value: string }>;
  motion: {
    instant?: { value: string };
    fast: { value: string };
    base: { value: string };
    slow?: { value: string };
    ease: { value: string };
    easeOut?: { value: string };
  };
  icon: {
    sizes: { inline: { value: string }; button: { value: string }; standalone: { value: string } };
    color: { value: string };
  };
}

const t = designTokens as unknown as TokenFile;

function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    // 处理字母后跟数字的键名：accent2 → accent-2，fg2 → fg-2
    .replace(/([a-z])([0-9])/g, '$1-$2')
    .toLowerCase();
}

// 将设计 Token 拍平为 :root CSS 变量。所有色值均来自 design-tokens.json。
export function buildTokenCss(): string {
  const light: string[] = [];

  for (const [k, v] of Object.entries(t.color)) {
    light.push(`  --${kebab(k)}: ${v.value};`);
  }
  // 渐变 token：--gradient-brand / --gradient-primary / --gradient-glass ...
  // 现已全量降级为实色安全网，保留 key 以防历史选择器引用失效导致白屏。
  for (const [k, v] of Object.entries(t.gradient ?? {})) {
    light.push(`  --gradient-${kebab(k)}: ${v.value};`);
  }
  light.push(`  --font-body: ${t.font.body.value};`);
  light.push(`  --font-mono: ${t.font.mono.value};`);
  for (const [k, v] of Object.entries(t.font.size)) {
    light.push(`  --text-${kebab(k)}: ${v.value};`);
  }
  for (const [k, v] of Object.entries(t.font.weight)) {
    light.push(`  --weight-${kebab(k)}: ${v.value};`);
  }
  for (const [k, v] of Object.entries(t.leading ?? {})) {
    light.push(`  --leading-${kebab(k)}: ${v.value};`);
  }
  for (const [k, v] of Object.entries(t.tracking ?? {})) {
    light.push(`  --tracking-${kebab(k)}: ${v.value};`);
  }
  for (const [k, v] of Object.entries(t.radius)) {
    light.push(`  --radius-${kebab(k)}: ${v.value};`);
  }
  for (const [k, v] of Object.entries(t.spacing)) {
    light.push(`  --space-${kebab(k)}: ${v.value};`);
  }
  for (const [k, v] of Object.entries(t.shadow)) {
    light.push(`  --elev-${kebab(k)}: ${v.value};`);
  }
  light.push(`  --motion-instant: ${t.motion.instant?.value ?? '100ms'};`);
  light.push(`  --motion-fast: ${t.motion.fast.value};`);
  light.push(`  --motion-base: ${t.motion.base.value};`);
  light.push(`  --motion-slow: ${t.motion.slow?.value ?? '300ms'};`);
  light.push(`  --ease-standard: ${t.motion.ease.value};`);
  light.push(`  --ease-out: ${t.motion.easeOut?.value ?? 'cubic-bezier(0.16, 1, 0.3, 1)'};`);
  light.push(`  --icon-inline: ${t.icon.sizes.inline.value};`);
  light.push(`  --icon-button: ${t.icon.sizes.button.value};`);
  light.push(`  --icon-standalone: ${t.icon.sizes.standalone.value};`);
  light.push(`  --icon-color: ${t.icon.color.value};`);
  // 焦点环：用 token 变量派生（品牌绿 3px 半透明），避免硬编码颜色。
  // 这是全站唯一允许出现「带 accent 的 box-shadow」的位置——它是无障碍焦点指示，不是装饰性彩色 glow。
  light.push(
    `  --focus-ring: 0 0 0 3px color-mix(in srgb, var(--accent) 32%, transparent);`,
  );

  const dark: string[] = [];
  for (const [k, v] of Object.entries(t.colorDark)) {
    dark.push(`  --${kebab(k)}: ${v.value};`);
  }
  // 未在 gradientDark 中重写的渐变会因引用 --accent* 而自动跟随深色色板
  for (const [k, v] of Object.entries(t.gradientDark ?? {})) {
    dark.push(`  --gradient-${kebab(k)}: ${v.value};`);
  }
  // 深色阴影一次性重写（浅色阴影在深底上过重）
  for (const [k, v] of Object.entries(t.shadowDark ?? {})) {
    dark.push(`  --elev-${kebab(k)}: ${v.value};`);
  }

  return `:root {\n${light.join('\n')}\n}\n\n.dark {\n${dark.join('\n')}\n}`;
}

const STYLE_ID = 'jlau-design-tokens';

export function applyDesignTokens(): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildTokenCss();
}

// 供 JS 侧读取 token（如需要内联样式）。组件样式优先用 CSS 变量。
export const tokens = t;
