/**
 * ErrorBoundary（ERR-4）—— 业务级错误边界。
 *
 * ## 目标
 * 渲染期抛错只降级局部，绝不白屏：
 *  - `inline` 模式用于**每条消息行**的局部降级（验收⑦：消息项 throw 仅该区降级）；
 *  - 默认模式用于页面级降级（T05 会在 App 外层再包一层，这里先具备能力）。
 *
 * ## 上报
 * componentDidCatch 里 track('boundary_catch')，错误信息不落埋点（Q4 零文本）。
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { track } from '../lib/analytics';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 局域降级时的兜底内容；缺省用通用降级卡 */
  fallback?: ReactNode;
  /** 降级卡使用紧凑行内样式（消息行级） */
  inline?: boolean;
  /** 埋点用场景 id */
  scenario?: string;
  /** 额外上报回调（组件内部已 track boundary_catch） */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      track({ ev: 'boundary_catch', scenario: this.props.scenario ?? 'unknown' });
    } catch {
      // 埋点失败不阻断降级
    }
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    const cls = this.props.inline ? 'boundary-fallback inline' : 'boundary-fallback';
    return (
      <div className={cls} role="alert">
        <p>这部分显示出了问题</p>
        <button type="button" className="btn btn-ghost" onClick={this.reset}>
          重试
        </button>
      </div>
    );
  }
}
