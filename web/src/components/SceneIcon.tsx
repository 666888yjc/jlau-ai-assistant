import type { SVGProps } from 'react';

// 场景符号：四个业务场景的自绘线性图形，替换掉通用 lucide 图标
// （MapPin / BookOpen / GraduationCap / Coffee 语义太泛，且四个一起出现时风格离散）。
// 全部 24×24 网格、currentColor、线宽随 design-tokens.icon.strokeWidth = 1.75。
export type SceneId =
  | 'baodao'
  | 'xuanke'
  | 'kaoyan'
  | 'shenghuo'
  | 'calendar'
  | 'food'
  | 'phone'
  | 'lostfound'
  | 'gpa';

interface SceneIconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  scene: SceneId;
  /** 像素尺寸，默认 24（standalone） */
  size?: number;
  strokeWidth?: number;
  /** 传入则作为语义图形朗读；不传即为纯装饰 */
  label?: string;
}

function renderScene(scene: SceneId) {
  switch (scene) {
    // 报到入学：校门 / 迎新门廊
    case 'baodao':
      return (
        <>
          <path d="M3.5 20.5V10L12 4l8.5 6v10.5" />
          <path d="M9.5 20.5v-5.5h5v5.5" />
          <path d="M2 20.5h20" />
        </>
      );
    // 选课攻略：课表 + 勾选
    case 'xuanke':
      return (
        <>
          <path d="M4 5.5h16" />
          <path d="M4 11h9" />
          <path d="M4 16.5h6" />
          <path d="M14 17l2.5 2.5L21 15" />
        </>
      );
    // 考研升学：书页 + 上升箭头
    case 'kaoyan':
      return (
        <>
          <path d="M4 5h5a3 3 0 0 1 3 3v11a2.5 2.5 0 0 0-2.5-2.5H4V5Z" />
          <path d="M12 19V8a3 3 0 0 1 3-3h5" />
          <path d="M17 13.5 20 10l3 3.5" />
          <path d="M20 10v7.5" />
        </>
      );
    // 校历作息：月历纸 + 时针（既表达「日期」也表达「时间」，区别于纯日历图标）
    case 'calendar':
      return (
        <>
          <path d="M4 6.5h16v13.5H4V6.5Z" />
          <path d="M4 10.5h16" />
          <path d="M8 4v3" />
          <path d="M16 4v3" />
          <path d="M12 13v2.5l1.75 1.25" />
        </>
      );
    // 周边美食：店招雨棚 + 门洞（表达「校园周边小店」，与 shenghuo 的饭盒明确区分）
    case 'food':
      return (
        <>
          <path d="M3.5 9.5 5 5h14l1.5 4.5H3.5Z" />
          <path d="M4.5 9.5v10.5h15V9.5" />
          <path d="M9.5 20v-5.5h5V20" />
          <path d="M9 9.5 9.75 5" />
          <path d="M15 9.5 14.25 5" />
        </>
      );
    // 常用电话：号码本纸张 + 侧边索引齿 + 牌面一段听筒轮廓
    // （不画整只听筒，避免与顶栏「转人工」的 lucide Phone 撞脸）
    case 'phone':
      return (
        <>
          <path d="M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11V3.5Z" />
          <path d="M4 7h2.5" />
          <path d="M4 12h2.5" />
          <path d="M4 17h2.5" />
          <path d="M10 9.5a5.5 5.5 0 0 0 5 5l.5-1.5 1.5.5v2h-2A7 7 0 0 1 8 8.5v-1h2l.5 1.5-.5.5Z" />
        </>
      );
    // 失物招领：吊牌轮廓（一角斜切）+ 挂孔 + 牌面一枚抽象问号笔画
    case 'lostfound':
      return (
        <>
          <path d="M13.5 3.5H6.5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8.5l-5-5Z" />
          <path d="M8.5 6.5h1.5" />
          <path d="M10 12.5a2 2 0 1 1 2 2v1.5" />
          <path d="M12 18.5v.5" />
        </>
      );
    // 绩点估算：三根高低不同的竖柱 + 一条横跨柱顶的水平线（= 加权平均）
    case 'gpa':
      return (
        <>
          <path d="M3.5 20.5h17" />
          <path d="M7 20.5v-6" />
          <path d="M12 20.5v-10" />
          <path d="M17 20.5v-4" />
          <path d="M4.5 13.5h15" />
        </>
      );
    // 校园生活：饭盒 / 生活服务
    case 'shenghuo':
    default:
      return (
        <>
          <path d="M4.5 9.5h13v4a6.5 6.5 0 0 1-13 0v-4Z" />
          <path d="M17.5 10.5H19a2.5 2.5 0 0 1 0 5h-1.5" />
          <path d="M8 3.5v2.5" />
          <path d="M12 2.5v3.5" />
        </>
      );
  }
}

export function SceneIcon({
  scene,
  size = 24,
  strokeWidth = 1.75,
  label,
  className,
  ...rest
}: SceneIconProps) {
  const semantic = typeof label === 'string' && label.length > 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={semantic ? 'img' : undefined}
      aria-label={semantic ? label : undefined}
      aria-hidden={semantic ? undefined : 'true'}
      focusable="false"
      {...rest}
    >
      {renderScene(scene)}
    </svg>
  );
}
