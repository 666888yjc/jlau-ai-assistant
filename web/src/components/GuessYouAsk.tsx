import { Icon } from './Icon';

/**
 * 猜你想问 · 单行。
 * 原本是 2×2 毛玻璃卡 + 首字徽标：徽标取问句首字，语义为零却抢了最强视觉位。
 * 现改为发丝分隔的单列行——它是「候选问题」，不是「功能入口」，不该长得像卡片。
 */
export function GuessCard({ text, onPick }: { text: string; onPick: (t: string) => void }) {
  return (
    <button className="guess-card" type="button" onClick={() => onPick(text)}>
      <span className="guess-text">{text}</span>
      <Icon name="ChevronRight" size="inline" />
    </button>
  );
}

export function GuessYouAsk({
  items,
  onPick,
  title = '猜你想问',
}: {
  items: { id: string; text: string }[];
  onPick: (t: string) => void;
  title?: string;
}) {
  if (!items.length) return null;
  return (
    <div className="guess">
      <div className="guess-title">{title}</div>
      <div className="guess-list">
        {items.map((it) => (
          <GuessCard key={it.id} text={it.text} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

// 兜底场景的猜你想问（字符串数组），复用同一行列表样式。
export function GuessChips({
  guesses,
  onPick,
}: {
  guesses: string[];
  onPick: (t: string) => void;
}) {
  if (!guesses.length) return null;
  return (
    <div className="guess-list">
      {guesses.map((g, i) => (
        <GuessCard key={i} text={g} onPick={onPick} />
      ))}
    </div>
  );
}
