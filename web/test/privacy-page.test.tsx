// [QA 临时文件] 测试范围 6：PrivacyPage 导出 / 单项清除 / 全部清除 / 取消确认
// 验收依据：PRD-P0-07 隐私中心；架构 §2.1（clearAll 含 jxn-theme → 必须 applyTheme 复位）

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyPage } from '../src/pages/PrivacyPage';
import {
  KEY_PROFILE,
  KEY_MEMORY,
  KEY_MODULES,
  KEY_CONV_PREFIX,
  KEY_THEME,
  listJxnKeys,
} from '../src/lib/storage';
import { DANGER_CONFIRM_RESET_MS } from '../src/components/DangerConfirmButton';

/** 捕获 Blob 下载内容 */
let capturedBlob: Blob | null = null;
let clickedDownloadName: string | null = null;

function seedAll() {
  localStorage.setItem(KEY_PROFILE, JSON.stringify({ nickname: '小吉', major: '农学', grade: '大一' }));
  localStorage.setItem(
    KEY_MEMORY,
    JSON.stringify({ items: [{ id: 'm1', text: '我喜欢银杏', source: 'manual', createdAt: 1 }] }),
  );
  localStorage.setItem(KEY_MODULES, JSON.stringify({ enabled: { calendar: false, food: true } }));
  localStorage.setItem(`${KEY_CONV_PREFIX}xuexi`, JSON.stringify({ conversationId: 'c1', messages: [] }));
  localStorage.setItem(KEY_THEME, 'dark');
}

function renderPrivacy() {
  return render(
    <MemoryRouter initialEntries={['/privacy']}>
      <PrivacyPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  capturedBlob = null;
  clickedDownloadName = null;

  // jsdom 不实现 URL.createObjectURL —— 只挂静态方法，
  // 绝不能用 vi.stubGlobal('URL', {...URL}) 覆盖整个 URL：
  // 那样会毁掉 URL 构造函数，react-router / userEvent 内部的 new URL 会全线挂起。
  let seq = 0;
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => {
    capturedBlob = b;
    return `blob:qa/${seq++}`;
  };
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => undefined;

  // 拦截 <a>.click()，jsdom 触发下载会报 Not implemented
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clickedDownloadName = this.download;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function blobText(b: Blob): Promise<string> {
  // jsdom 的 Blob.text() 可用；兜底用 FileReader
  if (typeof b.text === 'function') return b.text();
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });
}

describe('PrivacyPage —— 清单展示', () => {
  it('渲染出全部已登记数据项的中文名称与用途', () => {
    seedAll();
    renderPrivacy();
    expect(screen.getByText('本机存了什么')).toBeInTheDocument();
    // 五类描述符的 label 都应出现
    const rows = document.querySelectorAll('.storage-row');
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  it('未登记的 jxn-xxx 键也出现在清单里（不漏键）', () => {
    seedAll();
    localStorage.setItem('jxn-xxx', 'stray');
    renderPrivacy();
    expect(screen.getByText(/其他数据（jxn-xxx）/)).toBeInTheDocument();
  });

  it('空存储时导出与清除按钮均禁用', () => {
    renderPrivacy();
    expect(screen.getByRole('button', { name: /导出全部数据/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '清除全部数据' })).toBeDisabled();
  });
});

describe('PrivacyPage —— 导出 JSON', () => {
  it('【AC】导出文件可被 JSON.parse 且包含全部 jxn-* 键', async () => {
    seedAll();
    localStorage.setItem('jxn-xxx', 'stray');
    const user = userEvent.setup();
    renderPrivacy();

    await user.click(screen.getByRole('button', { name: /导出全部数据/ }));

    expect(capturedBlob, '未产生下载 Blob').not.toBeNull();
    const text = await blobText(capturedBlob!);
    const parsed = JSON.parse(text); // 不可解析会直接抛错
    expect(parsed.app).toBe('jixiaonong');
    expect(typeof parsed.exportedAt).toBe('string');
    expect(Number.isNaN(Date.parse(parsed.exportedAt))).toBe(false);

    const exportedKeys: string[] = parsed.items.map((i: { key: string }) => i.key);
    for (const k of listJxnKeys()) {
      expect(exportedKeys, `导出遗漏键 ${k}`).toContain(k);
    }
    expect(exportedKeys).toContain(KEY_THEME);
    expect(exportedKeys).toContain('jxn-xxx');
  });

  it('导出文件名以 .json 结尾且含日期', async () => {
    seedAll();
    const user = userEvent.setup();
    renderPrivacy();
    await user.click(screen.getByRole('button', { name: /导出全部数据/ }));
    expect(clickedDownloadName).toMatch(/\.json$/);
    expect(clickedDownloadName).toMatch(/\d{4}/);
  });

  it('导出是纯本地行为：不发起任何 fetch / XHR', async () => {
    seedAll();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');

    const user = userEvent.setup();
    renderPrivacy();
    await user.click(screen.getByRole('button', { name: /导出全部数据/ }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it('导出成功后提示「已导出到你的下载目录」', async () => {
    seedAll();
    const user = userEvent.setup();
    renderPrivacy();
    await user.click(screen.getByRole('button', { name: /导出全部数据/ }));
    expect(await screen.findByText('已导出到你的下载目录')).toBeInTheDocument();
  });
});

describe('PrivacyPage —— 单项清除', () => {
  it('【AC】清除档案只删 jxn-profile，其他数据保留', async () => {
    seedAll();
    const user = userEvent.setup();
    renderPrivacy();

    // 找到「个人档案」所在行的清除按钮
    const rows = Array.from(document.querySelectorAll('.storage-row')) as HTMLElement[];
    const profileRow = rows.find((r) => r.textContent?.includes('档案'));
    expect(profileRow, '未找到档案行').toBeTruthy();

    const btn = within(profileRow!).getByRole('button', { name: '清除' });
    await user.click(btn); // 进入确认态
    await user.click(within(profileRow!).getByRole('button', { name: '确定清除？' })); // 真正执行

    expect(localStorage.getItem(KEY_PROFILE)).toBeNull();
    expect(localStorage.getItem(KEY_MEMORY)).not.toBeNull();
    expect(localStorage.getItem(KEY_MODULES)).not.toBeNull();
    expect(localStorage.getItem(`${KEY_CONV_PREFIX}xuexi`)).not.toBeNull();
    expect(localStorage.getItem(KEY_THEME)).not.toBeNull();
  });

  it('清除后该行按钮变为禁用（清单实时刷新）', async () => {
    seedAll();
    const user = userEvent.setup();
    renderPrivacy();

    const rows = Array.from(document.querySelectorAll('.storage-row')) as HTMLElement[];
    const profileRow = rows.find((r) => r.textContent?.includes('档案'))!;
    await user.click(within(profileRow).getByRole('button', { name: '清除' }));
    await user.click(within(profileRow).getByRole('button', { name: '确定清除？' }));

    const refreshedRows = Array.from(document.querySelectorAll('.storage-row')) as HTMLElement[];
    const refreshed = refreshedRows.find((r) => r.textContent?.includes('档案'))!;
    expect(within(refreshed).getByRole('button', { name: '清除' })).toBeDisabled();
  });

  it('【取消确认】只点第一次不清除数据；3 秒后自动复位为「清除」', async () => {
    seedAll();
    // 注意：advanceTimers 必须包一层箭头函数，直接传 vi.advanceTimersByTime 会丢 this 绑定导致挂起
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    renderPrivacy();

    const rows = Array.from(document.querySelectorAll('.storage-row')) as HTMLElement[];
    const profileRow = rows.find((r) => r.textContent?.includes('档案'))!;
    await user.click(within(profileRow).getByRole('button', { name: '清除' }));

    // 进入确认态但未执行
    expect(within(profileRow).getByRole('button', { name: '确定清除？' })).toBeInTheDocument();
    expect(localStorage.getItem(KEY_PROFILE), '第一次点击不应删除数据').not.toBeNull();

    // 等待自动复位
    await act(async () => {
      vi.advanceTimersByTime(DANGER_CONFIRM_RESET_MS + 50);
    });
    expect(within(profileRow).getByRole('button', { name: '清除' })).toBeInTheDocument();
    expect(localStorage.getItem(KEY_PROFILE), '超时复位后数据必须还在').not.toBeNull();

    vi.useRealTimers();
  });
});

describe('PrivacyPage —— 全部清除', () => {
  it('【AC】二次确认后清空全部 jxn-*（含 jxn-theme），回到初次打开状态', async () => {
    seedAll();
    document.documentElement.classList.add('dark');
    const user = userEvent.setup();
    renderPrivacy();

    await user.click(screen.getByRole('button', { name: '清除全部数据' }));
    await user.click(screen.getByRole('button', { name: /确定清除全部数据/ }));

    expect(listJxnKeys()).toEqual([]);
    expect(localStorage.getItem(KEY_THEME)).toBeNull();
    expect(localStorage.getItem(KEY_PROFILE)).toBeNull();
    expect(localStorage.getItem(`${KEY_CONV_PREFIX}xuexi`)).toBeNull();
  });

  it('【AC】清除后调用 applyTheme(getSystemTheme()) 复位 <html>.dark，DOM 与存储一致', async () => {
    seedAll();
    document.documentElement.classList.add('dark'); // 模拟当前是暗色
    const user = userEvent.setup();
    renderPrivacy();

    await user.click(screen.getByRole('button', { name: '清除全部数据' }));
    await user.click(screen.getByRole('button', { name: /确定清除全部数据/ }));

    // setup.ts 里 matchMedia.matches = false → 系统主题为 light → 应移除 dark class
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('【AC】清除后页面不白屏：清单仍渲染、按钮变禁用、有提示文案', async () => {
    seedAll();
    const user = userEvent.setup();
    renderPrivacy();

    await user.click(screen.getByRole('button', { name: '清除全部数据' }));
    await user.click(screen.getByRole('button', { name: /确定清除全部数据/ }));

    expect(screen.getByText('本机存了什么')).toBeInTheDocument();
    expect(document.querySelectorAll('.storage-row').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByRole('button', { name: /导出全部数据/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '清除全部数据' })).toBeDisabled();
    expect(await screen.findByText('已清除全部数据')).toBeInTheDocument();
  });

  it('【取消确认】只点一次「清除全部数据」不删除任何数据', async () => {
    seedAll();
    const before = listJxnKeys().sort();
    const user = userEvent.setup();
    renderPrivacy();

    await user.click(screen.getByRole('button', { name: '清除全部数据' }));
    expect(screen.getByRole('button', { name: /确定清除全部数据/ })).toBeInTheDocument();
    expect(listJxnKeys().sort()).toEqual(before);
  });

  it('清除全部后重新渲染页面不崩溃（初次打开状态可用）', async () => {
    seedAll();
    const user = userEvent.setup();
    const { unmount } = renderPrivacy();
    await user.click(screen.getByRole('button', { name: '清除全部数据' }));
    await user.click(screen.getByRole('button', { name: /确定清除全部数据/ }));
    unmount();

    expect(() => renderPrivacy()).not.toThrow();
    expect(screen.getByText('本机存了什么')).toBeInTheDocument();
  });
});
