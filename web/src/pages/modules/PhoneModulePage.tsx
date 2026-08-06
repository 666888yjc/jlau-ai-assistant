// 常用电话模块页。
// ------------------------------------------------------------------
// 纯静态、只读、无本地存储（PRD-P2-01 AC①：本模块不写入任何 localStorage 键）。
// 卡片整张是 tel: 链接，点击即拨号；底部「没找到？问吉小农」引流回对话。
//
// 用色配额：--danger 仅用于「紧急求助」徽标的文字色（不铺底、不阴影）。
//           --accent 0 处；浮起卡 0 张（卡片用 --surface + 发丝边）。
// ------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/NavBar';
import { Icon } from '../../components/Icon';
import {
  PHONE_CATEGORIES,
  PHONE_DISCLAIMER,
  PHONE_ITEMS,
  PHONE_ASK_QUESTION,
  PHONE_SCENARIO_ID,
  matchPhoneKeyword,
} from '../../modules/phone/data';
import type { PhoneCategory, PhoneItem } from '../../modules/phone/data';

/** 「全部」不是真实分类，只在渲染时拼在 PHONE_CATEGORIES 前，不写进数据 */
const ALL = '全部';
type FilterValue = typeof ALL | PhoneCategory;

function PhoneCard({ item }: { item: PhoneItem }) {
  const isUrgent = item.category === '紧急求助';
  return (
    <a
      className="phone-card"
      href={`tel:${item.phone}`}
      aria-label={`拨打 ${item.name} ${item.phone}`}
    >
      <div className="phone-card-top">
        <span className="phone-card-name">{item.name}</span>
        <span className={isUrgent ? 'phone-card-badge is-urgent' : 'phone-card-badge'}>
          {item.category}
        </span>
      </div>
      <div className="phone-card-num-row">
        <span className="phone-card-num">{item.phone}</span>
        <span className="phone-card-dial">
          <Icon name="Phone" size="inline" />
          拨打
        </span>
      </div>
      <p className="phone-card-purpose">{item.purpose}</p>
      <div className="phone-card-source">来源：{item.source}</div>
    </a>
  );
}

export function PhoneModulePage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<FilterValue>(ALL);

  const visible = useMemo(() => {
    const kw = keyword.trim();
    return PHONE_ITEMS.filter((item) => {
      if (filter !== ALL && item.category !== filter) return false;
      return matchPhoneKeyword(item, kw);
    });
  }, [keyword, filter]);

  const filters: FilterValue[] = [ALL, ...PHONE_CATEGORIES];

  // 只预填、不发送：跳转后输入框已有问句，用户可以改完再发
  const ask = () => {
    const query = encodeURIComponent(PHONE_ASK_QUESTION);
    navigate(`/chat?scenario=${PHONE_SCENARIO_ID}&q=${query}`);
  };

  return (
    <AppShell title="常用电话" onBack={() => navigate(-1)}>
      <div className="page-scroll">
        <div className="page-pad">
          <div className="screen-header">
            <div className="screen-title">常用电话</div>
            <div className="screen-sub">校内外常用号码，点一下就能拨。</div>
          </div>

          <div className="search-field">
            <input
              className="form-input"
              type="search"
              inputMode="search"
              placeholder="搜机构、用途或号码"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              aria-label="搜索电话号码"
            />
            {keyword.length > 0 && (
              <button
                type="button"
                className="search-clear"
                aria-label="清除搜索"
                onClick={() => setKeyword('')}
              >
                <Icon name="X" size="inline" />
              </button>
            )}
          </div>

          <div className="filter-pills" role="radiogroup" aria-label="电话分类筛选">
            {filters.map((opt) => {
              const selected = opt === filter;
              return (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={selected ? 'pill-radio-item is-on' : 'pill-radio-item'}
                  onClick={() => setFilter(opt)}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          <div className="section">
            <div className="section-label">
              {filter === ALL ? `全部号码（${visible.length}）` : `${filter}（${visible.length}）`}
            </div>
            {visible.length > 0 ? (
              <div className="phone-list">
                {visible.map((item) => (
                  <PhoneCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <p className="meta-note">没找到相关号码，换个词试试。</p>
            )}
          </div>

          <div className="phone-foot">
            <button type="button" className="food-ask" onClick={ask}>
              没找到？问吉小农
              <Icon name="ArrowRight" size="inline" />
            </button>
            <div className="privacy-note">{PHONE_DISCLAIMER}</div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
