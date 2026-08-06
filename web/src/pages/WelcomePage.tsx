import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { SceneIcon } from '../components/SceneIcon';
import { AppFooter } from '../components/AppFooter';

interface ValueProp {
  key: string;
  icon: ReactNode;
  title: string;
  desc: string;
}

// 三条价值点：说「能帮你做成什么」，不是「我有什么功能」。
const VALUE_PROPS: ValueProp[] = [
  {
    key: 'baodao',
    icon: <SceneIcon scene="baodao" size={24} />,
    title: '报到答疑',
    desc: '材料、流程、交通，一站说清',
  },
  {
    key: 'xuanke',
    icon: <SceneIcon scene="xuanke" size={24} />,
    title: '办事指南',
    desc: '带你看官方来源与更新日期',
  },
  {
    key: 'chat',
    icon: <Icon name="HelpCircle" size="standalone" />,
    title: '随时对话',
    desc: '像问学长学姐一样自然',
  },
];

/**
 * 欢迎页。
 * 改动要点：删除伪状态栏与整层氛围装饰（柔光球 + 叶片），内容改为左对齐——
 * 居中排版把每一行的起点都挪了位置，读起来更像海报而不是产品；
 * 品牌表达收敛到一枚几何麦苗吉祥物 + 一道麦金强调条（全屏唯一二级强调）。
 */
export function WelcomePage() {
  const navigate = useNavigate();
  const start = () => navigate('/chat?scenario=baodao');

  return (
    <div className="app-shell welcome-shell">
      <div className="welcome">
        <div className="welcome-hero">
          <Mascot size="lg" expression="happy" label="吉小农" />
        </div>

        <span className="brand-rule" aria-hidden="true" />

        <h1 className="welcome-title">你好，我是吉小农</h1>
        <p className="welcome-sub">
          吉林农业大学一站式校园 AI 助手。报到、选课、校园生活，随时问我。
        </p>

        <div className="value-list">
          {VALUE_PROPS.map((v) => (
            <div className="value-row" key={v.key}>
              <span className="value-ico">{v.icon}</span>
              <div className="value-text">
                <span className="value-title">{v.title}</span>
                <span className="value-desc">{v.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="welcome-foot">
          <div className="sticky-cta">
            <button className="btn btn-primary btn-block" type="button" onClick={start}>
              开始对话
              <Icon name="ArrowRight" size="button" />
            </button>
            <AppFooter center />
          </div>
        </div>
      </div>
    </div>
  );
}
