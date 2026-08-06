import type { SVGProps } from 'react';

// 空/异常状态插画：细线几何，只用 currentColor（由 .illus 的 color 决定）。
// 刻意保持"未完成感"——线宽 1.5、无填充、无阴影，避免变成第二套图标风格。
export type IllustrationName = 'emptyChat' | 'handoff' | 'error';

interface IllustrationProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  name: IllustrationName;
  /** 宽度像素，高度按 120:96 比例推导，默认 120 */
  width?: number;
  /** 传入则作为语义图形朗读；不传即为纯装饰 */
  label?: string;
}

const RATIO = 96 / 120;

function renderBody(name: IllustrationName) {
  switch (name) {
    // 空对话：两个对话框 + 一株刚发芽的苗
    case 'emptyChat':
      return (
        <>
          <path d="M16 20h56a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H36l-12 10V56h-8a8 8 0 0 1-8-8V28a8 8 0 0 1 8-8Z" />
          <path d="M32 34h28" opacity="0.55" />
          <path d="M32 44h16" opacity="0.55" />
          <path d="M96 82V64" />
          <path d="M96 68c0-7.73 6.27-14 14-14 0 7.73-6.27 14-14 14Z" opacity="0.7" />
          <path d="M96 76c0-5.52-4.48-10-10-10 0 5.52 4.48 10 10 10Z" opacity="0.45" />
          <path d="M78 86h36" opacity="0.4" />
        </>
      );
    // 人工接续：耳麦 + 工单卡
    case 'handoff':
      return (
        <>
          <path d="M28 52V44a24 24 0 0 1 48 0v8" />
          <path d="M28 50h6a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4h-6a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6Z" />
          <path d="M76 50h-6a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h6a6 6 0 0 0 6-6v-6a6 6 0 0 0-6-6Z" />
          <path d="M76 68v4a8 8 0 0 1-8 8h-8" opacity="0.6" />
          <path d="M40 84h40" opacity="0.4" />
          <path d="M96 30v14" opacity="0.7" />
          <path d="M96 34c0-5.52 4.48-10 10-10 0 5.52-4.48 10-10 10Z" opacity="0.55" />
        </>
      );
    // 异常：断线 + 提示点
    case 'error':
    default:
      return (
        <>
          <path d="M60 22a26 26 0 0 1 26 26 26 26 0 0 1-26 26 26 26 0 0 1-26-26" />
          <path d="M34 48a26 26 0 0 1 8-18.76" opacity="0.4" />
          <path d="M60 38v14" />
          <path d="M60 60h.02" />
          <path d="M20 84h80" opacity="0.4" />
        </>
      );
  }
}

export function Illustration({
  name,
  width = 120,
  label,
  className,
  ...rest
}: IllustrationProps) {
  const semantic = typeof label === 'string' && label.length > 0;

  return (
    <svg
      width={width}
      height={Math.round(width * RATIO)}
      viewBox="0 0 120 96"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `illus ${className}` : 'illus'}
      role={semantic ? 'img' : undefined}
      aria-label={semantic ? label : undefined}
      aria-hidden={semantic ? undefined : 'true'}
      focusable="false"
      {...rest}
    >
      {renderBody(name)}
    </svg>
  );
}
