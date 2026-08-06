import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { BrandMark } from './BrandMark';
import { applyTheme, getInitialTheme, persistTheme, type Theme } from '../lib/theme';

/**
 * 明/暗主题切换按钮（AppShell 顶栏右侧）。
 * 首次访问跟随系统 prefers-color-scheme；用户点击后写入 localStorage（jxn-theme），此后以用户选择为准。
 * 图标与 aria-label 随当前主题变化：暗色显示太阳（切浅色），浅色显示月亮（切暗色）。
 */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      persistTheme(next);
      return next;
    });
  }, []);

  const isDark = theme === 'dark';
  return (
    <button
      className="nav-action"
      type="button"
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      onClick={toggle}
    >
      <Icon name={isDark ? 'Sun' : 'Moon'} size="button" />
    </button>
  );
}

interface NavBarProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}

export function NavBar({ title, onBack, right }: NavBarProps) {
  return (
    <div className="nav-bar">
      {onBack ? (
        <button className="nav-back" type="button" onClick={onBack} aria-label="返回">
          <Icon name="ChevronLeft" size="button" />
        </button>
      ) : (
        <span className="nav-brand">
          <BrandMark size="md" />
        </span>
      )}
      <span className="nav-title">{title}</span>
      {right ?? <span className="nav-spacer" />}
    </div>
  );
}

/**
 * 应用外壳。
 * 已删除伪 iOS 状态栏（9:41 + 信号格 + 电池）：H5 运行在真实系统状态栏之下，
 * 再画一条假的会出现「两个状态栏」，且时间永远停在 9:41 —— 是明确的失真信号。
 * 顶栏随之从品牌绿渐变块降级为中性表面 + 发丝底线，把绿色让给主操作。
 */
export function AppShell({
  title,
  onBack,
  right,
  children,
}: NavBarProps & { children: ReactNode }) {
  return (
    <div className="app-shell">
      <div className="app-header">
        <NavBar
          title={title}
          onBack={onBack}
          right={
            <>
              <ThemeToggle />
              {right}
            </>
          }
        />
      </div>
      <div className="shell-body">{children}</div>
    </div>
  );
}
