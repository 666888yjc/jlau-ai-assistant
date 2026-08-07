/**
 * admin.ts —— 反馈管理后台前端助手（方案 A A-4）。
 *
 * 两部分职责刻意分离（架构 §7.2）：
 *  - **纯逻辑**：`adminErrorMessage()` 管理端专属文案映射，零副作用、可单测；
 *  - **副作用**：localStorage 令牌助手（get/set/clear/有效期判定），
 *    管理端页面唯一入口，不允许在别处散落 ADMIN_TOKEN_KEY 字面量。
 */

import { ADMIN_TOKEN_KEY } from './config';

// ---------------------------------------------------------------------------
// 纯逻辑：管理端错误文案映射（架构 §4.3）
// ---------------------------------------------------------------------------

/**
 * 管理端专属文案映射（不依赖 classifyError，架构 §2.3.3 注）。
 * 4290 的 {n} 用 retryAfterSec 填充；未提供时按 60 兜底（服务端必下发 Retry-After）。
 */
export function adminErrorMessage(code: number, retryAfterSec?: number): string {
  switch (code) {
    case 4011:
      return '管理后台未启用（未配置 ADMIN_PASSWORD）';
    case 4012:
      return '登录已失效，请重新登录';
    case 4013:
      return '密码错误';
    case 4290:
      return `尝试次数过多，请 ${Math.max(1, Math.ceil(retryAfterSec ?? 60))} 秒后再试`;
    default:
      return '请求失败，请稍后重试';
  }
}

// ---------------------------------------------------------------------------
// 副作用：会话令牌 localStorage 助手
// ---------------------------------------------------------------------------

interface StoredAdminSession {
  token: string;
  expiresAt: number;
}

/** 读取本地保存的 admin 会话；缺失/过期/解析失败返回 null。 */
export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAdminSession>;
    if (typeof parsed.token !== 'string' || parsed.token === '') return null;
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) {
      // 过期令牌直接清理，避免残留
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

/** 是否已登录（令牌存在且未过期）。 */
export function isAdminLoggedIn(): boolean {
  return getAdminToken() !== null;
}

/** 保存会话令牌。 */
export function setAdminToken(token: string, expiresAt: number): void {
  if (typeof window === 'undefined') return;
  const payload: StoredAdminSession = { token, expiresAt };
  try {
    window.localStorage.setItem(ADMIN_TOKEN_KEY, JSON.stringify(payload));
  } catch {
    /* 隐私模式/配额失败不影响使用（每次需重新登录） */
  }
}

/** 清除会话令牌（退出 / 会话过期回登录态）。 */
export function clearAdminToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* noop */
  }
}
