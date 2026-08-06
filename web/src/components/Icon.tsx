import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  Headset,
  HelpCircle,
  LayoutGrid,
  LoaderCircle,
  Mic,
  Moon,
  MoreHorizontal,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Sun,
  ThumbsUp,
  Trash2,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

// 功能图标库：Lucide（唯一）。零 emoji、禁混库。
// 品牌图形（吉祥物 / 标识 / 场景符号 / 插画）不走这里，见 Mascot / BrandMark / SceneIcon / Illustration。
// 尺寸规范（design-tokens）：inline=16 / button=20 / standalone=24，统一 currentColor 继承。
// 线宽统一 1.75（design-tokens.icon.strokeWidth），比 lucide 默认 2 更克制。
export type IconName =
  | 'AlertCircle'
  | 'ArrowRight'
  | 'BookOpen'
  | 'CheckCircle'
  | 'ChevronLeft'
  | 'ChevronRight'
  | 'Download'
  | 'Flag'
  | 'Headset'
  | 'HelpCircle'
  | 'LayoutGrid'
  | 'LoaderCircle'
  | 'Mic'
  | 'Moon'
  | 'MoreHorizontal'
  | 'Phone'
  | 'Plus'
  | 'Send'
  | 'ShieldCheck'
  | 'Sun'
  | 'ThumbsUp'
  | 'Trash2'
  | 'X';

const registry: Record<IconName, LucideIcon> = {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  Headset,
  HelpCircle,
  LayoutGrid,
  LoaderCircle,
  Mic,
  Moon,
  MoreHorizontal,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Sun,
  ThumbsUp,
  Trash2,
  X,
};

export type IconSize = 'inline' | 'button' | 'standalone' | number;

function toPx(size: IconSize): number {
  if (typeof size === 'number') return size;
  if (size === 'inline') return 16;
  if (size === 'standalone') return 24;
  return 20;
}

interface IconProps extends LucideProps {
  name: IconName;
  size?: IconSize;
}

export function Icon({ name, size = 'button', strokeWidth = 1.75, ...rest }: IconProps) {
  const Cmp = registry[name];
  return (
    <Cmp
      size={toPx(size)}
      strokeWidth={strokeWidth}
      color="currentColor"
      aria-hidden="true"
      {...rest}
    />
  );
}

// 供 API 返回的 lucide_icon 字符串安全映射到组件名（未命中返回 undefined，由调用方兜底）。
export function iconFromName(name: string): IconName | undefined {
  return (registry as Record<string, LucideIcon>)[name] ? (name as IconName) : undefined;
}
