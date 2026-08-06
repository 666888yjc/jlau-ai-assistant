import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyDesignTokens } from './lib/tokens';
import { applyTheme, getInitialTheme } from './lib/theme';
import './styles/global.css';

// 设计 Token 唯一入口：import design-tokens.json 并注入 CSS 变量（:root / .dark）。
applyDesignTokens();
// 主题初始化：在首帧渲染前应用（优先 localStorage，其次系统偏好），避免暗色用户闪白。
applyTheme(getInitialTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
