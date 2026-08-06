/**
 * NewContentPill（UX-2）——「↓ 有新内容」浮标。
 *
 * 用户上翻后新消息到达时出现，点击回到底部并重新开始跟随。
 * 定位用 `position: sticky` 而非 fixed：MOB-5 保护清单禁止新增 fixed（架构 §7.4）。
 */

import { Icon } from './Icon';

interface NewContentPillProps {
  onClick: () => void;
  /** 文案，默认「有新内容」 */
  label?: string;
}

export function NewContentPill({ onClick, label = '有新内容' }: NewContentPillProps) {
  return (
    <button type="button" className="new-content-pill" onClick={onClick} aria-label="滚动到最新消息">
      <Icon name="ChevronDown" size="inline" />
      {label}
    </button>
  );
}
