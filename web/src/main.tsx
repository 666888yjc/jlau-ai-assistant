import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyDesignTokens } from './lib/tokens';
import { applyTheme, getInitialTheme } from './lib/theme';
import { track } from './lib/analytics';
import './styles/global.css';

// 设计 Token 唯一入口：import design-tokens.json 并注入 CSS 变量（:root / .dark）。
applyDesignTokens();
// 主题初始化：在首帧渲染前应用（优先 localStorage，其次系统偏好），避免暗色用户闪白。
applyTheme(getInitialTheme());

// ERR-5：全局异常捕获 → 埋点。
// Q4 隐私红线：只上报事件类型与一个区分码（-2=window.onerror / -3=unhandledrejection），
// 绝不把错误文本 / 堆栈 / 请求体送进埋点。
window.addEventListener('error', () => {
  try {
    track({ ev: 'boundary_catch', scenario: 'unknown', code: -2 });
  } catch {
    // 埋点失败不阻断页面
  }
});
window.addEventListener('unhandledrejection', () => {
  try {
    track({ ev: 'boundary_catch', scenario: 'unknown', code: -3 });
  } catch {
    // 同上
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
