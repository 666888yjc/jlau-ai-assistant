// 校历作息模块页。
// ------------------------------------------------------------------
// 数据全部来自 modules/calendar/data.ts —— 本页不内联任何日期字面量，
// 换成官方校历时这里一行都不用改（架构 §5.1 替换协议）。
//
// 用色配额：--accent 实色 1 处（下一个节点行左侧 2px 竖条）；
//           --grain 1 处（倒计时横幅底色 --grain-soft）；浮起卡 0 张。
//
// 边界（架构 §2.4 B1–B7）：
//   全部节点已过 → nextMilestone 返回 null → 不渲染横幅、无行高亮、不出现负数天数；
//   非法日期 → 被 sortedMilestones 过滤掉，页面不崩；
//   空数组 → 对应分区整块不渲染。
// ------------------------------------------------------------------

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/NavBar';
import {
  CALENDAR_DATA_VERSION,
  CALENDAR_DISCLAIMER,
  MILESTONES,
  TIME_TABLE,
  daysUntil,
  formatMonthDay,
  nextMilestone,
  sortedMilestones,
} from '../../modules/calendar/data';
import type { Milestone, TimeSlot } from '../../modules/calendar/data';

/** 倒计时横幅。仅在存在「未过节点」时由父级渲染，因此这里不处理 null */
function CountdownBanner({ milestone, days }: { milestone: Milestone; days: number }) {
  if (days === 0) {
    return (
      <div className="countdown-banner">
        <span className="countdown-banner-label">「{milestone.name}」</span>
        <span className="countdown-banner-num">就是今天</span>
      </div>
    );
  }
  return (
    <div className="countdown-banner">
      <span className="countdown-banner-label">距离「{milestone.name}」还有</span>
      <span className="countdown-banner-num">{days}</span>
      <span className="countdown-banner-label">天</span>
    </div>
  );
}

/** 作息行：无 end 的条目（门禁 / 熄灯）显示「22:30 起」而不是「22:30–undefined」 */
function TimetableRow({ slot }: { slot: TimeSlot }) {
  const time = typeof slot.end === 'string' && slot.end.length > 0 ? `${slot.start}–${slot.end}` : `${slot.start} 起`;
  return (
    <div className="timetable-row">
      <span className="timetable-time">{time}</span>
      <span className="timetable-label">{slot.label}</span>
      <span className="timetable-period">{slot.period}</span>
    </div>
  );
}

/** 节点状态文案：只出现「今天 / N 天后 / 已过」，永远不出现负数 */
function milestoneState(days: number): string {
  if (days === 0) return '今天';
  if (days > 0) return `${days} 天后`;
  return '已过';
}

export function CalendarModulePage() {
  const navigate = useNavigate();

  // 今天只取一次：页面级重新计算即可，不为跨天场景挂定时器（架构 §2.4 B7）
  const today = useMemo(() => new Date(), []);
  const milestones = useMemo(() => sortedMilestones(MILESTONES), []);
  const next = useMemo(() => nextMilestone(MILESTONES, today), [today]);
  const nextDays = useMemo(() => (next === null ? null : daysUntil(next.date, today)), [next, today]);

  return (
    <AppShell title="校历作息" onBack={() => navigate(-1)}>
      <div className="page-scroll">
        <div className="page-pad">
          <div className="screen-header">
            <div className="screen-title">校历作息</div>
            <div className="screen-sub">上课时间与学期节点，先按通用模板占位，官方校历发布后会替换。</div>
          </div>

          {next !== null && nextDays !== null && <CountdownBanner milestone={next} days={nextDays} />}

          {TIME_TABLE.length > 0 && (
            <div className="section">
              <div className="section-label">作息时间</div>
              <div className="timetable-list">
                {TIME_TABLE.map((slot) => (
                  <TimetableRow key={slot.id} slot={slot} />
                ))}
              </div>
            </div>
          )}

          {milestones.length > 0 && (
            <div className="section">
              <div className="section-label">学期节点</div>
              <div className="milestone-list">
                {milestones.map((item) => {
                  const days = daysUntil(item.date, today);
                  // sortedMilestones 已过滤非法日期，days 理论上不会是 null；保底跳过
                  if (days === null) return null;
                  const isNext = next !== null && next.id === item.id;
                  const classes = ['milestone-row'];
                  if (isNext) classes.push('is-next');
                  if (days < 0) classes.push('is-past');
                  return (
                    <div key={item.id} className={classes.join(' ')}>
                      <span className="milestone-date">{formatMonthDay(item.date)}</span>
                      <span className="milestone-name">{item.name}</span>
                      <span className="milestone-state">{milestoneState(days)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="section stack-4">
            <div className="privacy-note">{CALENDAR_DISCLAIMER}</div>
            <div className="meta-note">数据版本：{CALENDAR_DATA_VERSION}</div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
