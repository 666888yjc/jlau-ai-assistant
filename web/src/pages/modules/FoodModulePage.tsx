// 周边美食模块页。
// ------------------------------------------------------------------
// 静态信息页最容易变成「信息孤岛」，所以每张卡片都带一个「问吉小农」
// —— 点它跳回 /chat 并预填问句（**不自动发送**，把最后一下留给用户）。
//
// 用色配额：--accent 实色 1 处（选中的筛选 pill）；--grain 0 处；浮起卡 0 张
//           （卡片用 --surface + 发丝边，不带阴影）。
//
// 「全部」不是真实品类，只在渲染时拼在 FOOD_CATEGORIES 前，不写进数据。
// ------------------------------------------------------------------

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/NavBar';
import { Icon } from '../../components/Icon';
import { FOOD_CATEGORIES, FOOD_DISCLAIMER, FOOD_ITEMS } from '../../modules/food/data';
import type { FoodCategory, FoodItem } from '../../modules/food/data';

/** 「全部」筛选项的哨兵值；它与任何 FoodCategory 都不相等，因此不会误匹配 */
const ALL = '全部';
type FilterValue = typeof ALL | FoodCategory;

/** 美食问句默认落在「校园生活」场景 —— 这是四个场景里最贴近吃住行的一个 */
const FOOD_SCENARIO_ID = 'shenghuo';

function FilterPills({
  value,
  onChange,
}: {
  value: FilterValue;
  onChange: (next: FilterValue) => void;
}) {
  const options: FilterValue[] = [ALL, ...FOOD_CATEGORIES];
  return (
    <div className="filter-pills" role="radiogroup" aria-label="美食品类筛选">
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={selected}
            className={selected ? 'pill-radio-item is-on' : 'pill-radio-item'}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function FoodCard({ item, onAsk }: { item: FoodItem; onAsk: (item: FoodItem) => void }) {
  return (
    <div className="food-card">
      <div className="food-card-top">
        <span className="food-card-name">{item.name}</span>
        <span className="food-card-price">{item.price}</span>
      </div>
      <div className="food-card-meta">
        <span>{item.category}</span>
        <span>·</span>
        <span>{item.distance}</span>
      </div>
      <p className="food-card-tip">{item.tip}</p>
      <div className="food-card-foot">
        <button
          type="button"
          className="food-ask"
          onClick={() => onAsk(item)}
          aria-label={`向吉小农提问：${item.askQuestion}`}
        >
          问吉小农
          <Icon name="ArrowRight" size="inline" />
        </button>
      </div>
    </div>
  );
}

export function FoodModulePage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterValue>(ALL);

  const visible = useMemo(
    () => (filter === ALL ? [...FOOD_ITEMS] : FOOD_ITEMS.filter((item) => item.category === filter)),
    [filter],
  );

  // 只预填、不发送：跳转后输入框已有问句，用户可以改完再发
  const ask = useCallback(
    (item: FoodItem) => {
      const query = encodeURIComponent(item.askQuestion);
      navigate(`/chat?scenario=${FOOD_SCENARIO_ID}&q=${query}`);
    },
    [navigate],
  );

  return (
    <AppShell title="周边美食" onBack={() => navigate(-1)}>
      <div className="page-scroll">
        <div className="page-pad">
          <div className="screen-header">
            <div className="screen-title">周边美食</div>
            <div className="screen-sub">学校周边这些店，先挑一家，再问吉小农怎么走。</div>
          </div>

          <FilterPills value={filter} onChange={setFilter} />

          <div className="section">
            <div className="section-label">
              {filter === ALL ? `全部店铺（${visible.length}）` : `${filter}（${visible.length}）`}
            </div>
            {visible.length > 0 ? (
              <div className="food-list">
                {visible.map((item) => (
                  <FoodCard key={item.id} item={item} onAsk={ask} />
                ))}
              </div>
            ) : (
              <p className="meta-note">这个品类还没有收录，换一个看看吧。</p>
            )}
          </div>

          <div className="section">
            <div className="privacy-note">{FOOD_DISCLAIMER}</div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
