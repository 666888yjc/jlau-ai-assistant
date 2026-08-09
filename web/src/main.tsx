import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyDesignTokens } from './lib/tokens';
import { applyTheme, getInitialTheme } from './lib/theme';
import { track } from './lib/analytics';
import { isMiniProgram } from './lib/miniprogram';
import './styles/global.css';

// 设计 Token 唯一入口：import design-tokens.json 并注入 CSS 变量（:root / .dark）。
applyDesignTokens();
// 主题初始化：在首帧渲染前应用（优先 localStorage，其次系统偏好），避免暗色用户闪白。
applyTheme(getInitialTheme());

// M-5.①：小程序 web-view 环境钩子 —— 检测到小程序环境时给 <html> 加 in-miniprogram class，
// 供 CSS 微调「浏览器专属 UI」预留（当前 H5 无此类按钮，为审计/未来用）。
// 普通浏览器 / 微信内置浏览器中 isMiniProgram() 为 false，行为零变化。
if (isMiniProgram()) {
  document.documentElement.classList.add('in-miniprogram');
}

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
