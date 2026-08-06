import type { SVGProps } from 'react';

// 品牌标识：一枚抽象麦叶。
// 约束：只用 currentColor（由父级 color 决定），不出现 hex / linearGradient；
// 默认装饰性（aria-hidden），传 label 时升级为 role="img"。
export type BrandMarkSize = 'sm' | 'md' | number;

const SIZE_PX: Record<Exclude<BrandMarkSize, number>, number> = {
  sm: 16,
  md: 20,
};

interface BrandMarkProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  /** 16 / 20 或自定义像素值 */
  size?: BrandMarkSize;
  /** 传入则作为语义图形朗读；不传即为纯装饰 */
  label?: string;
}

function toPx(size: BrandMarkSize): number {
  return typeof size === 'number' ? size : SIZE_PX[size];
}

export function BrandMark({ size = 'sm', label, className, ...rest }: BrandMarkProps) {
  const px = toPx(size);
  const semantic = typeof label === 'string' && label.length > 0;

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 16 16"
      fill="none"
      className={className ? `brand-glyph ${className}` : 'brand-glyph'}
      role={semantic ? 'img' : undefined}
      aria-label={semantic ? label : undefined}
      aria-hidden={semantic ? undefined : 'true'}
      focusable="false"
      {...rest}
    >
      {/* 茎 */}
      <path
        d="M8 14.5V7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* 主叶（右上扬） */}
      <path d="M8 8.5c0-2.49 2.01-4.5 4.5-4.5 0 2.49-2.01 4.5-4.5 4.5Z" fill="currentColor" />
      {/* 副叶（左下，弱一档） */}
      <path
        d="M8 11.5c0-1.93-1.57-3.5-3.5-3.5 0 1.93 1.57 3.5 3.5 3.5Z"
        fill="currentColor"
        opacity="0.6"
      />
    </svg>
  );
}
