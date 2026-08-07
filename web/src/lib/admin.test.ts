import { describe, expect, it } from 'vitest';
import { adminErrorMessage } from './admin';

describe('adminErrorMessage（架构 §4.3 管理端专属文案映射）', () => {
  it('4011 -> 管理后台未启用（未配置 ADMIN_PASSWORD）', () => {
    expect(adminErrorMessage(4011)).toBe('管理后台未启用（未配置 ADMIN_PASSWORD）');
  });

  it('4012 -> 登录已失效，请重新登录', () => {
    expect(adminErrorMessage(4012)).toBe('登录已失效，请重新登录');
  });

  it('4013 -> 密码错误', () => {
    expect(adminErrorMessage(4013)).toBe('密码错误');
  });

  it('4290 带 retryAfterSec -> 文案含秒数', () => {
    expect(adminErrorMessage(4290, 30)).toBe('尝试次数过多，请 30 秒后再试');
  });

  it('4290 缺 retryAfterSec -> 按 60 兜底', () => {
    expect(adminErrorMessage(4290)).toBe('尝试次数过多，请 60 秒后再试');
  });

  it('4290 retryAfterSec 为小数 -> 向上取整且至少 1', () => {
    expect(adminErrorMessage(4290, 0.5)).toBe('尝试次数过多，请 1 秒后再试');
  });

  it('其他码值 -> 通用文案', () => {
    expect(adminErrorMessage(5002)).toBe('请求失败，请稍后重试');
    expect(adminErrorMessage(0)).toBe('请求失败，请稍后重试');
  });
});
