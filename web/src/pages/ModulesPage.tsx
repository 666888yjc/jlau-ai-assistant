// 模块中心。
// ------------------------------------------------------------------
// 列表 100% 由 MODULE_REGISTRY.map() 驱动，页面里没有任何 `if (id === 'calendar')` 分支
// —— 这是 PRD-P0-04 AC③「注册表加一条就出现」的可验证性保证。
//
// 用色配额：--accent 实色仅 Switch 开态一处；浮起卡仅 ProfileSummaryCard 一张。
// ------------------------------------------------------------------

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/NavBar';
import { Icon } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { SceneIcon } from '../components/SceneIcon';
import { Switch } from '../components/Switch';
import { readEnabledMap, setModuleEnabled } from '../lib/modules';
import { readProfile, isProfileFilled } from '../lib/profile';
import { sortedModules } from '../modules/registry';
import type { ModuleDef } from '../modules/registry';
import type { ProfileData } from '../types/local';

/** 档案摘要卡：/modules 上唯一的浮起卡片 */
function ProfileSummaryCard({ profile, onClick }: { profile: ProfileData; onClick: () => void }) {
  const filled = isProfileFilled(profile);
  const name = profile.nickname.trim().length > 0 ? profile.nickname.trim() : '同学';
  const metaParts: string[] = [];
  if (profile.grade.length > 0) metaParts.push(profile.grade);
  if (profile.major.trim().length > 0) metaParts.push(profile.major.trim());

  return (
    <button type="button" className="profile-summary" onClick={onClick}>
      <span className="profile-summary-ico">
        <Mascot size={28} expression={filled ? 'happy' : 'calm'} />
      </span>
      <span className="profile-summary-copy">
        <span className="profile-summary-name">{filled ? name : '完善你的档案'}</span>
        <span className="profile-summary-meta">
          {filled
            ? metaParts.length > 0
              ? metaParts.join(' · ')
              : '还可以补充年级和专业'
            : '填写昵称与专业，吉小农会更懂你'}
        </span>
      </span>
      <Icon name="ChevronRight" size="button" className="chev" />
    </button>
  );
}

interface ModuleRowProps {
  def: ModuleDef;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  onEnter: () => void;
}

function ModuleRow({ def, enabled, onToggle, onEnter }: ModuleRowProps) {
  return (
    <div className={enabled ? 'module-row' : 'module-row is-off'}>
      <button
        type="button"
        className="module-row-enter"
        onClick={onEnter}
        disabled={!enabled}
        aria-label={`进入${def.name}`}
      >
        <span className="scene-ico">
          <SceneIcon scene={def.icon} size={24} />
        </span>
        <span className="module-row-copy">
          <span className="scenario-title">{def.name}</span>
          <span className="scenario-desc">{def.desc}</span>
        </span>
      </button>
      <Switch checked={enabled} onChange={onToggle} label={def.name} />
    </div>
  );
}

export function ModulesPage() {
  const navigate = useNavigate();
  const modules = sortedModules();
  const [profile] = useState<ProfileData>(() => readProfile());
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>(() => readEnabledMap());

  const toggle = useCallback((id: string, next: boolean) => {
    setModuleEnabled(id, next);
    // 以存储的最新快照为准重取，避免本地 state 与落盘结果不一致
    setEnabledMap(readEnabledMap());
  }, []);

  const onCount = modules.filter((m) => enabledMap[m.id]).length;

  return (
    <AppShell title="模块中心" onBack={() => navigate(-1)}>
      <div className="page-scroll">
        <div className="page-pad">
          <div className="screen-header">
            <div className="screen-title">模块中心</div>
            <div className="screen-sub">
              开启你需要的能力，关掉的模块不会出现在入口里。所有设置只保存在这台设备上。
            </div>
          </div>

          <ProfileSummaryCard profile={profile} onClick={() => navigate('/profile')} />

          <div className="section">
            <div className="section-label">
              可用模块（已开启 {onCount} / {modules.length}）
            </div>
            <div className="module-list">
              {modules.map((m) => (
                <ModuleRow
                  key={m.id}
                  def={m}
                  enabled={enabledMap[m.id] ?? m.defaultEnabled}
                  onToggle={(next) => toggle(m.id, next)}
                  onEnter={() => navigate(m.path)}
                />
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-label">数据与隐私</div>
            <div className="module-list">
              <div className="module-row">
                <button
                  type="button"
                  className="module-row-enter"
                  onClick={() => navigate('/privacy')}
                  aria-label="进入隐私中心"
                >
                  <span className="scene-ico">
                    <Icon name="ShieldCheck" size="standalone" />
                  </span>
                  <span className="module-row-copy">
                    <span className="scenario-title">隐私中心</span>
                    <span className="scenario-desc">看看本机存了什么，可导出可清除</span>
                  </span>
                </button>
                <Icon name="ChevronRight" size="button" />
              </div>
            </div>
          </div>

          <div className="section">
            <div className="meta-note">
              这些数据只保存在你当前的浏览器里，不会上传服务器，换设备或清空浏览器数据后会丢失。
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
