// 主题（明/暗）接入层。
// tokens.ts 已注入 .dark CSS 变量覆盖，这里只负责：
// 1) 读取偏好（localStorage jxn-theme，无存储时跟随系统 prefers-color-scheme）；
// 2) 在根元素 <html> 上切换 .dark class（变量级联到 body / #root 全部后代）。
// 禁止在组件里手写主题判断逻辑，统一走本模块。

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'jxn-theme';

/** 读取系统偏好（无 window 环境（SSR/测试）一律视为 light） */
export function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 读取用户上次的选择；无存储值返回 null（此时应跟随系统） */
export function getStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === 'dark' || raw === 'light' ? raw : null;
  } catch {
    return null;
  }
}

/** 初始主题：优先用户选择，其次系统偏好 */
export function getInitialTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

/** 在根元素上应用主题（.dark class 覆盖 token 变量） */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/** 持久化用户选择（隐私模式等存储失败不影响使用） */
export function persistTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* 忽略存储失败 */
  }
}
