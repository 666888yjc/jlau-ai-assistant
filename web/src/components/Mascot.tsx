import type { SVGProps } from 'react';

// 吉小农 · 吉祥物（抽象几何麦苗）。
// 设计约束（PM 已复签）：非拟人化——不画眼睛/嘴/四肢，"表情"由姿态差异表达：
//   calm  端正对称，用于常规对话头像
//   happy 叶片上扬 + 顶芽，用于欢迎页 / 首条问候
//   think 单叶收拢 + 升腾点，用于等待 / 思考态
//   cheer 双叶对称高扬 + 顶芽 + 两侧欢呼点，用于「加油」贴纸
//   eat   双叶下捧 + 垄上食粒，用于「干饭」贴纸
//   sleep 茎弯垂 + 双叶闭合 + 顶芽收拢，用于「睡了」贴纸
// 着色一律 currentColor（由父级 color 决定），禁止 hex 与 linearGradient。
export type MascotExpression = 'calm' | 'happy' | 'think' | 'cheer' | 'eat' | 'sleep';

/** 全部合法姿态，供贴纸面板枚举与恢复历史时的校验共用 */
export const MASCOT_EXPRESSIONS: readonly MascotExpression[] = [
  'calm',
  'happy',
  'think',
  'cheer',
  'eat',
  'sleep',
];

/** 运行时类型守卫：从 localStorage 恢复的字段必须过这一关，非法值降级为纯文本 */
export function isMascotExpression(value: unknown): value is MascotExpression {
  return typeof value === 'string' && (MASCOT_EXPRESSIONS as readonly string[]).includes(value);
}
export type MascotSize = 'sm' | 'md' | 'lg' | number;

const SIZE_PX: Record<Exclude<MascotSize, number>, number> = {
  sm: 32,
  md: 48,
  lg: 72,
};

interface MascotProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  expression?: MascotExpression;
  size?: MascotSize;
  /** 传入则作为语义图形朗读；不传即为纯装饰 */
  label?: string;
}

function toPx(size: MascotSize): number {
  return typeof size === 'number' ? size : SIZE_PX[size];
}

/** 各表情的姿态几何：茎高、主叶、副叶、附加元素 */
function renderPose(expression: MascotExpression) {
  if (expression === 'happy') {
    return (
      <>
        <path
          d="M16 28V11"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* 顶芽：只有 happy 才冒尖 */}
        <circle cx="16" cy="7" r="2" fill="currentColor" />
        <path d="M16 14c0-4.42 3.58-8 8-8 0 4.42-3.58 8-8 8Z" fill="currentColor" />
        <path
          d="M16 19c0-3.31-2.69-6-6-6 0 3.31 2.69 6 6 6Z"
          fill="currentColor"
          opacity="0.6"
        />
      </>
    );
  }

  if (expression === 'cheer') {
    return (
      <>
        {/* 茎最高：整株拔起，表达"精神头" */}
        <path d="M16 28V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="6" r="2" fill="currentColor" />
        {/* 双叶对称高扬（happy 是单侧上扬，这里两侧齐扬，区分度来自对称性） */}
        <path d="M16 14c0-4.42 3.58-8 8-8 0 4.42-3.58 8-8 8Z" fill="currentColor" />
        <path
          d="M16 14c0-4.42-3.58-8-8-8 0 4.42 3.58 8 8 8Z"
          fill="currentColor"
          opacity="0.6"
        />
        {/* 两侧欢呼点：抽象的"哗"，不是表情符号 */}
        <circle cx="27" cy="4.5" r="1.25" fill="currentColor" opacity="0.5" />
        <circle cx="5" cy="4.5" r="1.25" fill="currentColor" opacity="0.5" />
      </>
    );
  }

  if (expression === 'eat') {
    return (
      <>
        <path d="M16 28V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        {/* 顶芽微收：注意力向下 */}
        <circle cx="16" cy="12.5" r="1.5" fill="currentColor" opacity="0.75" />
        {/* 双叶下捧，像把粮食圈进来 */}
        <path d="M16 16c0 4.42 3.58 8 8 8 0-4.42-3.58-8-8-8Z" fill="currentColor" />
        <path
          d="M16 20c0 3.31-2.69 6-6 6 0-3.31 2.69-6 6-6Z"
          fill="currentColor"
          opacity="0.6"
        />
        {/* 垄上食粒：位置贴近基线，与 think 的"升腾点"（右上方）明确区分 */}
        <circle cx="16" cy="27" r="1" fill="currentColor" opacity="0.5" />
        <circle cx="19.5" cy="28" r="0.8" fill="currentColor" opacity="0.35" />
        <circle cx="12.5" cy="28" r="0.8" fill="currentColor" opacity="0.35" />
      </>
    );
  }

  if (expression === 'sleep') {
    return (
      <>
        {/* 茎向右弯垂：整株"低下来"，靠曲率而不是五官表达困意 */}
        <path
          d="M16 28c0-6 0-8 4-10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        {/* 顶芽闭合：比 happy 的实心顶芽更小更淡 */}
        <circle cx="21" cy="17" r="1.75" fill="currentColor" opacity="0.5" />
        {/* 双叶下垂闭合 */}
        <path
          d="M16 18c-3.31 0-6 2.69-6 6 3.31 0 6-2.69 6-6Z"
          fill="currentColor"
          opacity="0.6"
        />
        <path
          d="M17 21c0 3.31 2.69 6 6 6 0-3.31-2.69-6-6-6Z"
          fill="currentColor"
          opacity="0.45"
        />
      </>
    );
  }

  if (expression === 'think') {
    return (
      <>
        <path
          d="M16 28V15"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M16 17c0-4.42 3.58-8 8-8 0 4.42-3.58 8-8 8Z" fill="currentColor" />
        {/* 副叶收拢一档，表示"正在琢磨" */}
        <path
          d="M16 22c0-2.76-2.24-5-5-5 0 2.76 2.24 5 5 5Z"
          fill="currentColor"
          opacity="0.6"
        />
        {/* 升腾点：思考的抽象表达，不是拟人气泡 */}
        <circle cx="25" cy="6" r="1.5" fill="currentColor" opacity="0.75" />
        <circle cx="29" cy="3" r="1" fill="currentColor" opacity="0.45" />
      </>
    );
  }

  return (
    <>
      <path d="M16 28V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 17c0-4.42 3.58-8 8-8 0 4.42-3.58 8-8 8Z" fill="currentColor" />
      <path
        d="M16 22c0-3.31-2.69-6-6-6 0 3.31 2.69 6 6 6Z"
        fill="currentColor"
        opacity="0.6"
      />
    </>
  );
}

export function Mascot({
  expression = 'calm',
  size = 'md',
  label,
  className,
  ...rest
}: MascotProps) {
  const px = toPx(size);
  const semantic = typeof label === 'string' && label.length > 0;

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 32 32"
      fill="none"
      className={className ? `mascot ${className}` : 'mascot'}
      role={semantic ? 'img' : undefined}
      aria-label={semantic ? label : undefined}
      aria-hidden={semantic ? undefined : 'true'}
      focusable="false"
      {...rest}
    >
      {renderPose(expression)}
      {/* 田垄线：所有表情共用的落地基线 */}
      <path
        d="M8 30h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}
