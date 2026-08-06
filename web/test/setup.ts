// [QA 临时文件] 测试环境初始化。
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom 不实现 matchMedia，theme.ts 的 getSystemTheme 依赖它
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

// jsdom 不实现 scrollTo / requestAnimationFrame 的部分行为
if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(Date.now()), 0)) as typeof window.requestAnimationFrame;
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  // 防止某个用例中途失败导致 fake timers 泄漏到后续用例（会让 userEvent 全部超时）
  vi.useRealTimers();
});
