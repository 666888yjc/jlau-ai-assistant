import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { BrandMark } from './BrandMark';
import { Mascot, type MascotExpression } from './Mascot';
import { MarkdownText } from './MarkdownText';
import type { SourceItem } from '../types/api';

/**
 * 会话头像。
 * AI 侧改用几何麦苗吉祥物（非拟人），用户侧保留单字，两者共用中性底 —— 不再是绿色渐变球。
 */
export function Avatar({
  self = false,
  expression = 'calm',
}: {
  self?: boolean;
  expression?: MascotExpression;
}) {
  if (self) {
    return (
      <div className="avatar self" aria-hidden="true">
        我
      </div>
    );
  }
  return (
    <div className="avatar">
      <Mascot size={24} expression={expression} />
    </div>
  );
}

/** 身份标签：品牌叶 + 极小号灰字，替换原渐变胶囊 */
export function NameChip() {
  return (
    <span className="name-chip">
      <BrandMark size="sm" />
      吉小农
    </span>
  );
}

export function Bubble({
  role,
  status,
  streaming,
  children,
}: {
  role: 'user' | 'assistant';
  status?: 'error';
  /**
   * 流式进行中（T05 UX-5）：流式期间每 token 内容都在变化，此时若走 MarkdownText，
   * 每个 token 都会触发一次全量 parse（parseBlocks + parseInline）——这是流式期间
   * 主线程最大的单点消耗。门控：streaming 时纯文本输出，done 后一次性 Markdown 化。
   */
  streaming?: boolean;
  children: ReactNode;
}) {
  const cls = role === 'user' ? 'bubble user' : status === 'error' ? 'bubble ai error' : 'bubble ai';
  // 仅 AI 正常回复且非流式时走 Markdown 渲染（消灭 **星号**）；user 输入 / error 气泡 / 流式保持纯文本；
  // 非字符串 children（如 TypingIndicator 加载动画）原样渲染。
  const renderMarkdown =
    role === 'assistant' && status !== 'error' && !streaming && typeof children === 'string';
  return <div className={cls}>{renderMarkdown ? <MarkdownText text={children} /> : children}</div>;
}

/**
 * 单条来源。
 * 部分知识库文章的 `来源:` 只写了名称而没有 URL（item.url 为空串），
 * 此时若仍渲染 <a href="">，点击会跳回当前页——退化成坏链接。
 * 因此仅在 url 是合法 http(s) 链接时才渲染 <a>，否则渲染不可点击的静态标签。
 */
export function SourceChip({ item }: { item: SourceItem }) {
  const isLink = !!item.url && /^https?:\/\//.test(item.url);
  if (!isLink) {
    return <span className="source-item static">{item.title}</span>;
  }
  return (
    <a className="source-item" href={item.url} target="_blank" rel="noreferrer">
      {item.title}
    </a>
  );
}

/**
 * 来源折叠区。
 * 来源是「可核查」而非「要炫耀」的信息，默认收起，避免每条回答后面挂一排彩色芯片抢视线。
 */
export function SourceFold({ items }: { items: SourceItem[] }) {
  if (!items.length) return null;
  return (
    <details className="source-fold">
      <summary>
        <Icon name="ChevronRight" size="inline" />
        {`${items.length} 条来源`}
      </summary>
      <div className="source-fold-body">
        {items.map((it, i) => (
          <SourceChip key={`${it.title}-${i}`} item={it} />
        ))}
      </div>
    </details>
  );
}

export function FeedbackBar({
  given,
  onFeedback,
}: {
  given: 'helpful' | 'reported' | null;
  onFeedback: (type: 'helpful' | 'reported') => void;
}) {
  return (
    <div className="feedback-bar">
      <button
        className="btn btn-ghost"
        type="button"
        disabled={!!given}
        onClick={() => onFeedback('helpful')}
      >
        <Icon name="ThumbsUp" size="inline" /> 有帮助
      </button>
      <button
        className="btn btn-ghost"
        type="button"
        disabled={!!given}
        onClick={() => onFeedback('reported')}
      >
        <Icon name="Flag" size="inline" /> 报错
      </button>
      {given && <span className="btn btn-ghost done">已收到</span>}
    </div>
  );
}

export function TypingIndicator() {
  return (
    <span className="typing" aria-label="正在输入">
      <i className="dot" />
      <i className="dot" />
      <i className="dot" />
    </span>
  );
}
