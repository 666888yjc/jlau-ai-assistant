import { Icon } from './Icon';
import { SceneIcon, type SceneId } from './SceneIcon';

export type ScenarioVariant = 'banner' | 'row';

interface ScenarioCardProps {
  scene: SceneId;
  name: string;
  active: boolean;
  desc: string;
  onClick: () => void;
  /** banner = 主推场景（每屏唯一浮起卡）；row = 其余场景的发丝行 */
  variant?: ScenarioVariant;
  /** 麦金强调标（仅主推卡使用，每屏 ≤1 处） */
  badge?: string;
}

/**
 * 场景入口。
 * 原设计是 2×2 等权玻璃卡：四个场景视觉权重相同，但其中三个还没开通——
 * 等权布局在说「随便挑」，而真实情况是「先做这个」。故拆成 1 主推 + 3 行。
 */
export function ScenarioCard({
  scene,
  name,
  active,
  desc,
  onClick,
  variant = 'row',
  badge,
}: ScenarioCardProps) {
  if (variant === 'banner') {
    return (
      <button className="scenario-banner" type="button" onClick={onClick}>
        <span className="scenario-banner-top">
          <span className="scene-ico brand">
            <SceneIcon scene={scene} size={24} />
          </span>
          <span className="scenario-banner-copy">
            <span className="scenario-title-row">
              <span className="scenario-title">{name}</span>
              {badge ? <span className="badge-grain">{badge}</span> : null}
            </span>
            <span className="scenario-desc">{desc}</span>
          </span>
        </span>
        <span className="scenario-banner-foot">
          <span>{active ? '进入对话' : '即将开放'}</span>
          <Icon name="ArrowRight" size="inline" />
        </span>
      </button>
    );
  }

  return (
    <button className="scenario-row" type="button" onClick={onClick}>
      <span className={active ? 'scene-ico' : 'scene-ico soon'}>
        <SceneIcon scene={scene} size={20} />
      </span>
      <span className="scenario-row-copy">
        <span className={active ? 'scenario-title' : 'scenario-title soon'}>{name}</span>
        <span className="scenario-desc">{desc}</span>
      </span>
      {active ? (
        <Icon name="ChevronRight" size="inline" />
      ) : (
        <span className="status-pill soon">即将开放</span>
      )}
    </button>
  );
}
