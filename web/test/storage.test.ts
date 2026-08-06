// [QA 临时文件] 测试范围 1：storage.ts 单一出口
// 验收依据：架构 §2.1 描述符注册表 + 未登记键扫描；PRD-P0-07 隐私中心

import { describe, it, expect } from 'vitest';
import {
  STORAGE_DESCRIPTORS,
  KEY_PROFILE,
  KEY_MEMORY,
  KEY_MODULES,
  KEY_CONV_PREFIX,
  KEY_THEME,
  listJxnKeys,
  listUnknownKeys,
  inventory,
  exportAll,
  clearAll,
  clearById,
  writeJson,
  readJson,
  UNKNOWN_PURPOSE,
} from '../src/lib/storage';

/** 构造一份「全量占位数据」，覆盖 5 类描述符 + 未登记键 */
function seedAll() {
  localStorage.setItem(KEY_PROFILE, JSON.stringify({ nickname: '小吉', major: '农学', grade: '大一' }));
  localStorage.setItem(KEY_MEMORY, JSON.stringify({ items: [] }));
  localStorage.setItem(KEY_MODULES, JSON.stringify({ enabled: { calendar: true } }));
  localStorage.setItem(`${KEY_CONV_PREFIX}xuexi`, JSON.stringify({ conversationId: 'c1', messages: [] }));
  localStorage.setItem(`${KEY_CONV_PREFIX}shenghuo`, JSON.stringify({ conversationId: 'c2', messages: [] }));
  localStorage.setItem(KEY_THEME, 'dark');
}

describe('storage.ts —— 描述符注册表完整性', () => {
  it('STORAGE_DESCRIPTORS 覆盖 profile / memory / modules / conversations / theme 五类', () => {
    const ids = STORAGE_DESCRIPTORS.map((d) => d.id).sort();
    expect(ids).toEqual([
      'conversations',
      'gpa',
      'lostfound',
      'memory',
      'modules',
      'profile',
      'theme',
    ]);
  });

  it('conversations 是 prefix 型，其余 exact 型；theme 为 managed:false（外部 theme.ts 写入）', () => {
    const byId = Object.fromEntries(STORAGE_DESCRIPTORS.map((d) => [d.id, d]));
    expect(byId.conversations.kind).toBe('prefix');
    expect(byId.conversations.key).toBe(KEY_CONV_PREFIX);
    expect(byId.profile.kind).toBe('exact');
    expect(byId.memory.kind).toBe('exact');
    expect(byId.modules.kind).toBe('exact');
    expect(byId.theme.kind).toBe('exact');
    expect(byId.theme.key).toBe(KEY_THEME);
    expect(byId.theme.managed).toBe(false);
    expect(byId.profile.managed).toBe(true);
    expect(byId.memory.managed).toBe(true);
    expect(byId.modules.managed).toBe(true);
    expect(byId.conversations.managed).toBe(true);
  });

  it('每个描述符都有中文 label 与 purpose（隐私中心「说人话」要求）', () => {
    for (const d of STORAGE_DESCRIPTORS) {
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.purpose.length).toBeGreaterThan(0);
      // 至少包含一个 CJK 字符
      expect(/[\u4e00-\u9fa5]/.test(d.label)).toBe(true);
      expect(/[\u4e00-\u9fa5]/.test(d.purpose)).toBe(true);
    }
  });
});

describe('storage.ts —— listUnknownKeys 未登记键扫描', () => {
  it('全部为已登记键时返回空数组', () => {
    seedAll();
    expect(listUnknownKeys()).toEqual([]);
  });

  it('【关键】构造未登记的 jxn-xxx 键，必须被 listUnknownKeys 捕获', () => {
    seedAll();
    localStorage.setItem('jxn-xxx', 'some-value');
    const unknown = listUnknownKeys();
    expect(unknown).toContain('jxn-xxx');
    expect(unknown).toHaveLength(1);
  });

  it('多个未登记键全部捕获，且不误报已登记键', () => {
    seedAll();
    localStorage.setItem('jxn-experiment-flag', '1');
    localStorage.setItem('jxn-draft-cache', '{}');
    const unknown = listUnknownKeys().sort();
    expect(unknown).toEqual(['jxn-draft-cache', 'jxn-experiment-flag']);
    expect(unknown).not.toContain(KEY_PROFILE);
    expect(unknown).not.toContain(KEY_THEME);
  });

  it('非 jxn- 前缀的第三方键不纳入扫描范围（不越权）', () => {
    localStorage.setItem('some-other-app', 'x');
    localStorage.setItem('token', 'y');
    expect(listJxnKeys()).toEqual([]);
    expect(listUnknownKeys()).toEqual([]);
  });

  it('jxn-conv-* 任意后缀都视为已登记（prefix 匹配生效）', () => {
    localStorage.setItem(`${KEY_CONV_PREFIX}any-new-scenario`, '{}');
    expect(listUnknownKeys()).toEqual([]);
  });
});

describe('storage.ts —— inventory 清单', () => {
  it('返回中文名称、用途说明与条目数摘要', () => {
    seedAll();
    const list = inventory();
    const profileEntry = list.find((e) => e.id === 'profile');
    expect(profileEntry).toBeDefined();
    expect(/[\u4e00-\u9fa5]/.test(profileEntry!.label)).toBe(true);
    expect(/[\u4e00-\u9fa5]/.test(profileEntry!.purpose)).toBe(true);
    expect(profileEntry!.empty).toBe(false);
    expect(profileEntry!.keys).toContain(KEY_PROFILE);
  });

  it('conversations 汇总多个 key 并给出条数', () => {
    seedAll();
    const conv = inventory().find((e) => e.id === 'conversations');
    expect(conv).toBeDefined();
    expect(conv!.keys).toHaveLength(2);
    expect(conv!.summary).toMatch(/2/);
  });

  it('空存储时各项 empty=true', () => {
    const list = inventory();
    for (const e of list) {
      expect(e.empty).toBe(true);
    }
  });

  it('未登记键以「其他数据（key）」形式出现在清单中，用途为未登记说明', () => {
    seedAll();
    localStorage.setItem('jxn-xxx', 'abcdef');
    const entry = inventory().find((e) => e.keys.includes('jxn-xxx'));
    expect(entry).toBeDefined();
    expect(entry!.label).toContain('其他数据');
    expect(entry!.label).toContain('jxn-xxx');
    expect(entry!.purpose).toBe(UNKNOWN_PURPOSE);
    expect(entry!.summary).toMatch(/6\s*字符/);
  });
});

describe('storage.ts —— exportAll 导出结构', () => {
  it('结构包含 exportedAt / app / 数据项，且 exportedAt 是合法 ISO 时间', () => {
    seedAll();
    const bundle = exportAll();
    expect(bundle.app).toBe('jixiaonong');
    expect(bundle.version).toBe(1);
    expect(typeof bundle.exportedAt).toBe('string');
    expect(Number.isNaN(Date.parse(bundle.exportedAt))).toBe(false);
    expect(Array.isArray(bundle.items)).toBe(true);
    expect(bundle.note.length).toBeGreaterThan(0);
  });

  it('导出结果可被 JSON.stringify / parse 往返且包含全部 jxn-* 键', () => {
    seedAll();
    localStorage.setItem('jxn-xxx', 'unregistered');
    const text = JSON.stringify(exportAll(), null, 2);
    const parsed = JSON.parse(text);
    const exportedKeys: string[] = parsed.items.map((i: { key: string }) => i.key);
    for (const k of listJxnKeys()) {
      expect(exportedKeys).toContain(k);
    }
    // 未登记键也必须导出（用户数据不遗漏）
    expect(exportedKeys).toContain('jxn-xxx');
  });

  it('空存储导出不报错，items 为空数组', () => {
    const bundle = exportAll();
    expect(bundle.items).toEqual([]);
  });
});

describe('storage.ts —— clearAll / clearById', () => {
  it('clearAll 遍历运行时快照，清空全部 jxn-* 且不抛错', () => {
    seedAll();
    localStorage.setItem('jxn-xxx', 'x');
    localStorage.setItem('unrelated-app-key', 'keep-me');
    expect(() => clearAll()).not.toThrow();
    expect(listJxnKeys()).toEqual([]);
    // 不越权删除第三方键
    expect(localStorage.getItem('unrelated-app-key')).toBe('keep-me');
  });

  it('clearAll 对空存储幂等，不抛错', () => {
    expect(() => clearAll()).not.toThrow();
    expect(() => clearAll()).not.toThrow();
    expect(listJxnKeys()).toEqual([]);
  });

  it('clearById 单项清除只删目标，其他数据保留', () => {
    seedAll();
    clearById('profile');
    expect(localStorage.getItem(KEY_PROFILE)).toBeNull();
    expect(localStorage.getItem(KEY_MEMORY)).not.toBeNull();
    expect(localStorage.getItem(KEY_MODULES)).not.toBeNull();
    expect(localStorage.getItem(KEY_THEME)).not.toBeNull();
  });

  it('clearById(conversations) 删除全部 prefix 匹配键', () => {
    seedAll();
    clearById('conversations');
    expect(localStorage.getItem(`${KEY_CONV_PREFIX}xuexi`)).toBeNull();
    expect(localStorage.getItem(`${KEY_CONV_PREFIX}shenghuo`)).toBeNull();
    expect(localStorage.getItem(KEY_PROFILE)).not.toBeNull();
  });

  it('clearById 支持 unknown:<key> 形式清除未登记键', () => {
    seedAll();
    localStorage.setItem('jxn-xxx', 'x');
    clearById('unknown:jxn-xxx');
    expect(localStorage.getItem('jxn-xxx')).toBeNull();
    expect(localStorage.getItem(KEY_PROFILE)).not.toBeNull();
  });
});

describe('storage.ts —— readJson 容错', () => {
  it('非法 JSON 时回退到 fallback，不抛错', () => {
    localStorage.setItem('jxn-profile', '{ this is not json');
    const guard = (v: unknown): v is { a: number } => typeof v === 'object' && v !== null;
    const fallback = { a: 1 };
    expect(readJson('jxn-profile', guard, fallback)).toBe(fallback);
  });

  it('guard 不通过时回退到 fallback', () => {
    localStorage.setItem('jxn-profile', '123');
    const guard = (v: unknown): v is { a: number } => typeof v === 'object' && v !== null;
    const fallback = { a: 1 };
    expect(readJson('jxn-profile', guard, fallback)).toBe(fallback);
  });

  it('writeJson 正常返回 true 并可回读', () => {
    const ok = writeJson('jxn-profile', { nickname: 'x' });
    expect(ok).toBe(true);
    expect(JSON.parse(localStorage.getItem('jxn-profile')!)).toEqual({ nickname: 'x' });
  });
});
