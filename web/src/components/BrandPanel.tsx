import { Mascot } from './Mascot';

/**
 * 品牌面板（桌面端左侧，竞品 hello.classby.cn「品牌面板 + 太阳圆点」风格）。
 *
 * 设计约束：
 * - 全部颜色走设计令牌（--warn/--accent/--grain/--surface-warm/--border），深浅色自动适配；
 * - SVG 的 stroke/fill 用内联 style 引用 var()（SVG 属性不支持 CSS 变量，内联 style 可以）；
 * - 移动端由 CSS 隐藏（.brand-panel display:none），聊天主区保持原布局零回归。
 */

/** 太阳圆点艺术元素：琥珀太阳 + 光芒 + 内圈 + 叶形标记（size 可缩放，桌面大面板/移动端小条共用）。 */
export function SunDot({ size = 128 }: { size?: number }) {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 * Math.PI) / 180;
    const x1 = 60 + Math.cos(angle) * 36;
    const y1 = 60 + Math.sin(angle) * 36;
    const x2 = 60 + Math.cos(angle) * 46;
    const y2 = 60 + Math.sin(angle) * 46;
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={4} strokeLinecap="round" opacity={0.55} style={{ stroke: 'var(--warn)' }} />;
  });
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      {rays}
      <circle cx="60" cy="60" r="30" style={{ fill: 'var(--warn)' }} />
      <circle cx="60" cy="60" r="22" opacity={0.92} style={{ fill: 'var(--surface-warm)' }} />
      <g transform="translate(60 60)">
        <path d="M0 16 V-4" strokeWidth={3.5} strokeLinecap="round" style={{ stroke: 'var(--accent)' }} />
        <path d="M0 8 C -2 0, 8 -6, 16 -6 C 14 2, 8 8, 0 8 Z" style={{ fill: 'var(--accent)' }} />
        <path d="M0 11 C -6 7, -10 8, -12 12 C -6 13, -2 12, 0 11 Z" style={{ fill: 'var(--grain)' }} />
      </g>
    </svg>
  );
}

/**
 * 移动端紧凑品牌条：手机上方的品牌存在感（桌面 ≥900px 由 CSS 隐藏，改用左侧大品牌面板）。
 * 手机端才是主力使用场景——品牌条保证「打开即见品牌」，与竞品 hello.classby.cn 移动端一致。
 */
export function BrandStrip() {
  return (
    <div className="brand-strip">
      <span className="brand-strip-art" aria-hidden="true">
        <SunDot size={36} />
      </span>
      <div className="brand-strip-text">
        <p className="brand-strip-name">吉小农 · 吉林农业大学新生 AI 助手</p>
        <p className="brand-strip-slogan">材料、流程、交通、住宿、美食，一站说清</p>
      </div>
    </div>
  );
}

export function BrandPanel() {
  return (
    <aside className="brand-panel">
      <div className="brand-panel-top">
        <p className="brand-eyebrow">JLAU · 2026 迎新季</p>
        <div className="brand-art">
          <SunDot />
        </div>
        <h1 className="brand-name">吉小农</h1>
        <p className="brand-sub">吉林农业大学新生 AI 助手</p>
        <p className="brand-copy">
          材料、流程、交通、住宿、美食
          <br />
          关于报到的一切，一站说清
        </p>
      </div>
      <div className="brand-panel-bottom">
        <div className="brand-mascot" aria-hidden="true">
          <Mascot size={64} expression="calm" />
        </div>
        <p className="brand-tagline">随时问，随时答 · 由吉小农提供</p>
      </div>
    </aside>
  );
}
