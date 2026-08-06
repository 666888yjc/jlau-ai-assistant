import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/NavBar';
import { ScenarioCard } from '../components/ScenarioCard';
import { type SceneId } from '../components/SceneIcon';
import { getScenarios } from '../lib/api';

interface ScenarioDef {
  id: SceneId;
  name: string;
  desc: string;
}

// 主推场景（PM 已复签：baodao）。API 返回 baodao / xuanke / kaoyan / shenghuo，用于确认开通状态。
const PRIMARY: ScenarioDef = {
  id: 'baodao',
  name: '新生报到',
  desc: '通知书、档案、户口怎么带，流程一览',
};

const SECONDARY: ScenarioDef[] = [
  { id: 'xuanke', name: '选课', desc: '培养方案、课表、绩点怎么查' },
  { id: 'kaoyan', name: '考研升学', desc: '保研政策、复习经验、院校信息' },
  { id: 'shenghuo', name: '校园生活', desc: '食堂、宿舍、快递、校医室在哪' },
];

/**
 * 场景分类页。
 * 原来是 2×2 等权玻璃卡——四个场景视觉权重相同，等于告诉用户「随便挑」，
 * 但真实使用里报到场景占绝大多数。现改为 1 主推横幅 + 3 行列表，让默认动作显而易见。
 */
export function ScenariosPage() {
  const navigate = useNavigate();
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set(['baodao']));

  useEffect(() => {
    getScenarios()
      .then((r) => setActiveIds(new Set(r.data.map((s) => s.id))))
      .catch(() => undefined);
  }, []);

  const enter = (id: string) => navigate(`/chat?scenario=${id}`);

  return (
    <AppShell title="场景分类" onBack={() => navigate('/chat?scenario=baodao')}>
      <div className="page-scroll">
        <div className="page-pad">
          <div className="screen-header">
            <div className="screen-title">选择你关心的问题</div>
            <div className="screen-sub">四大场景已开通，点选你关心的问题</div>
          </div>

          <div className="scenario-stack">
            <ScenarioCard
              variant="banner"
              badge="最常用"
              scene={PRIMARY.id}
              name={PRIMARY.name}
              desc={PRIMARY.desc}
              active={activeIds.has(PRIMARY.id)}
              onClick={() => enter(PRIMARY.id)}
            />
          </div>

          <div className="section">
            <div className="section-label">更多场景</div>
            <div className="scenario-list">
              {SECONDARY.map((s) => (
                <ScenarioCard
                  key={s.id}
                  variant="row"
                  scene={s.id}
                  name={s.name}
                  desc={s.desc}
                  active={activeIds.has(s.id)}
                  onClick={() => enter(s.id)}
                />
              ))}
            </div>
          </div>

          <div className="section">
            <div className="info-note">四大场景均已开通，有急事可随时「转人工」。</div>
          </div>
        </div>
      </div>

      <div className="page-cta">
        <button className="btn btn-primary btn-block" type="button" onClick={() => enter('baodao')}>
          开始对话
        </button>
      </div>
    </AppShell>
  );
}
