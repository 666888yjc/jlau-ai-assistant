/**
 * ErrorNotice（UX-3 / UX-4）—— 六类分级错误卡 + 人工兜底卡。
 *
 * ## UX-3
 * 错误文案与按钮**全部来自 errors.ts 的 classifyError**（MAINT-3 唯一分类入口），
 * 本组件禁止出现任何错误字面量。六类：
 *   offline（重试）/ timeout（重试）/ server（重试）/
 *   rate-limited（Retry-After 倒计时）/ client（换个问法）/ degraded（换个问法）
 * 429 时主按钮进入倒计时禁用，倒计时结束后恢复「重试」。
 *
 * ## UX-4
 * showHandoff=true 时在错误卡上方展示人工引导卡，按钮直通 /handoff。
 * 由 ChatPage 的 goHandoff 触发 navigate，本组件只负责呈现与上报。
 */

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { track } from '../lib/analytics';
import type { ClassifiedError } from '../lib/errors';

interface ErrorNoticeProps {
  error: ClassifiedError | null;
  /** 连续终态失败达到阈值（UX-4） */
  showHandoff: boolean;
  /** B5 UX-8：存在可续接草稿（超时卡的主按钮切换为「继续生成」） */
  continueAvailable: boolean;
  onRetry: () => void;
  onRephrase: () => void;
  onHandoff: () => void;
  /** B5 UX-8：续接入口（替换式重生成） */
  onContinue: () => void;
  scenario: string;
}

export function ErrorNotice({
  error,
  showHandoff,
  continueAvailable,
  onRetry,
  onRephrase,
  onHandoff,
  onContinue,
  scenario,
}: ErrorNoticeProps) {
  const [remaining, setRemaining] = useState(0);

  // 429 倒计时：error 变化时按 retryAfterSec 重置
  useEffect(() => {
    setRemaining(error?.cls === 'rate-limited' ? Math.max(1, Math.ceil(error.retryAfterSec ?? 5)) : 0);
  }, [error]);

  const counting = remaining > 0;
  useEffect(() => {
    if (!counting) return;
    const t = window.setInterval(() => setRemaining((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(t);
  }, [counting]);

  if (!error && !showHandoff) return null;

  let actionButton: React.ReactNode = null;
  if (error) {
    switch (error.action) {
      case 'retry': {
        // B5 UX-8：超时卡有草稿时主按钮切换为「继续生成」（走替换式续接，不追加重复）；
        // 无草稿仍「重试」（append 式）。429 倒计时期间两者都禁用。
        const isContinue = error.cls === 'timeout' && continueAvailable;
        actionButton = (
          <button
            className="btn btn-primary"
            type="button"
            onClick={isContinue ? onContinue : onRetry}
            disabled={counting}
          >
            {counting ? (
              <>
                <Icon name="LoaderCircle" size="inline" className="spin" />
                {remaining} 秒后可继续
              </>
            ) : isContinue ? (
              '继续生成'
            ) : (
              '重试'
            )}
          </button>
        );
        break;
      }
      case 'rephrase':
        actionButton = (
          <button className="btn btn-primary" type="button" onClick={onRephrase}>
            换个问法
          </button>
        );
        break;
      case 'handoff':
        actionButton = (
          <button className="btn btn-primary" type="button" onClick={onHandoff}>
            转人工
          </button>
        );
        break;
      case 'none':
        actionButton = null;
        break;
    }
  }

  return (
    <div className="error-notice" role="alert" aria-live="polite">
      {showHandoff && (
        <div className="handoff-card">
          <div className="handoff-card-copy">
            <p className="handoff-card-title">连续几次都没回答成功</p>
            <p className="handoff-card-desc">转人工更快，值班志愿者会直接帮你处理。</p>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              track({ ev: 'handoff_click', scenario });
              onHandoff();
            }}
          >
            转人工
          </button>
        </div>
      )}
      {error && (
        <div className="error-card">
          <div className="error-card-copy">
            <p className="error-card-title">{error.title}</p>
            {error.cls === 'degraded' && (
              <p className="error-card-desc">已生成的内容会保留，但可能不完整。</p>
            )}
            {error.cls === 'rate-limited' && (
              <p className="error-card-desc">稍等一下再发，服务会恢复正常。</p>
            )}
          </div>
          {actionButton}
        </div>
      )}
    </div>
  );
}
