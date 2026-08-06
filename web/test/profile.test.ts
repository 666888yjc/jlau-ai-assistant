// [QA 临时文件] 测试范围 2：profile.ts —— 问候语降级链 + 记忆容量/截断
// 验收依据：PRD-P0-02 问候语 A1；架构 §2.9；PRD-P0-03 记忆 50 条上限 / 100 字截断

import { describe, it, expect } from 'vitest';
import {
  buildGreeting,
  DEFAULT_GREETING,
  GREETING_MEMORY_MAX,
  readProfile,
  writeProfile,
  readMemory,
  addMemory,
  addMemoryBatch,
  removeMemory,
  normalizeMemoryText,
  isMemoryTextTruncated,
  isProfileFilled,
} from '../src/lib/profile';
import {
  EMPTY_PROFILE,
  EMPTY_MEMORY,
  MEMORY_MAX,
  MEMORY_TEXT_MAX,
  PROFILE_NICKNAME_MAX,
  PROFILE_MAJOR_MAX,
  GRADE_OPTIONS,
} from '../src/types/local';
import type { ProfileData, MemoryData, MemoryItem } from '../src/types/local';
import { KEY_PROFILE, KEY_MEMORY } from '../src/lib/storage';

function profile(nickname = '', major = '', grade: ProfileData['grade'] = ''): ProfileData {
  return { nickname, major, grade } as ProfileData;
}

function memory(...texts: string[]): MemoryData {
  const items: MemoryItem[] = texts.map((text, i) => ({
    id: `m${i}`,
    text,
    source: 'manual',
    createdAt: 1700000000000 + i,
  }));
  return { items };
}

describe('buildGreeting —— 四级降级链', () => {
  it('L0：昵称/专业/记忆全空 → 逐字返回 DEFAULT_GREETING', () => {
    const g = buildGreeting(EMPTY_PROFILE, EMPTY_MEMORY, 0);
    expect(g).toBe(DEFAULT_GREETING);
    expect(g).toBe('同学你好，我是吉小农，吉林农业大学的一站式校园 AI 助手，随时问我～');
  });

  it('L0：全是空白字符也视为全空（trim 后判定）', () => {
    expect(buildGreeting(profile('   ', '  '), memory('   '), 0)).toBe(DEFAULT_GREETING);
  });

  it('L1a：仅昵称 → 「{nickname}，你好呀～」', () => {
    expect(buildGreeting(profile('小吉'), EMPTY_MEMORY, 0)).toBe('小吉，你好呀～');
  });

  it('L1b：无昵称但有专业 → 「同学你好，我是吉小农。」+ 专业句', () => {
    expect(buildGreeting(profile('', '农学'), EMPTY_MEMORY, 0)).toBe(
      '同学你好，我是吉小农。农学的事，我也知道一点。',
    );
  });

  it('L2：昵称 + 专业 逐级叠加', () => {
    expect(buildGreeting(profile('小吉', '农学'), EMPTY_MEMORY, 0)).toBe(
      '小吉，你好呀～农学的事，我也知道一点。',
    );
  });

  it('【A1】L3：记忆被问候语消费，输出「记得你说过：…」', () => {
    const g = buildGreeting(profile('小吉', '农学'), memory('我喜欢吃食堂三楼的麻辣烫'), 0);
    expect(g).toBe('小吉，你好呀～农学的事，我也知道一点。记得你说过：我喜欢吃食堂三楼的麻辣烫。');
    expect(g).toContain('记得你说过：');
  });

  it('L3：无昵称无专业但有记忆 → L1b + 记忆句（不返回 DEFAULT_GREETING）', () => {
    const g = buildGreeting(EMPTY_PROFILE, memory('我在图书馆自习'), 0);
    expect(g).toBe('同学你好，我是吉小农。记得你说过：我在图书馆自习。');
    expect(g).not.toBe(DEFAULT_GREETING);
  });

  it('L3：记忆原文超过 24 字在问候语中截断并补省略号（不影响存储原文）', () => {
    const long = '一'.repeat(40);
    const g = buildGreeting(profile('小吉'), memory(long), 0);
    expect(g).toBe(`小吉，你好呀～记得你说过：${'一'.repeat(GREETING_MEMORY_MAX)}…。`);
    expect(g).toContain('…');
  });

  it('L3：恰好 24 字不截断', () => {
    const exact = '一'.repeat(GREETING_MEMORY_MAX);
    const g = buildGreeting(profile('小吉'), memory(exact), 0);
    expect(g).toBe(`小吉，你好呀～记得你说过：${exact}。`);
    expect(g).not.toContain('…');
  });

  it('seed 稳定：同一 seed 多次调用结果一致（同一天不抖动）', () => {
    const m = memory('A', 'B', 'C');
    const p = profile('小吉');
    const first = buildGreeting(p, m, 12345);
    for (let i = 0; i < 5; i++) {
      expect(buildGreeting(p, m, 12345)).toBe(first);
    }
  });

  it('seed 轮换：不同 seed 可挑到不同记忆（多样性）', () => {
    const m = memory('A', 'B', 'C');
    const results = new Set([0, 1, 2].map((s) => buildGreeting(profile('小吉'), m, s)));
    expect(results.size).toBe(3);
  });

  it('seed 为非法值（NaN/Infinity/负数）时不崩溃且落在合法索引', () => {
    const m = memory('A', 'B', 'C');
    for (const s of [NaN, Infinity, -7, -0.5]) {
      const g = buildGreeting(profile('小吉'), m, s);
      expect(g).toMatch(/记得你说过：[ABC]。$/);
    }
  });

  it('记忆项中的空白条目被过滤，不会产出「记得你说过：。」', () => {
    const g = buildGreeting(profile('小吉'), memory('  ', ''), 0);
    expect(g).toBe('小吉，你好呀～');
    expect(g).not.toContain('记得你说过');
  });
});

describe('profile.ts —— 非法 JSON 兜底', () => {
  it('jxn-profile 是非法 JSON 时 readProfile 回退空档案，不抛错', () => {
    localStorage.setItem(KEY_PROFILE, '{ broken');
    expect(() => readProfile()).not.toThrow();
    expect(readProfile()).toEqual(EMPTY_PROFILE);
  });

  it('jxn-memory 是非法 JSON 时 readMemory 回退空记忆，不抛错', () => {
    localStorage.setItem(KEY_MEMORY, 'not-json-at-all');
    expect(() => readMemory()).not.toThrow();
    expect(readMemory().items).toEqual([]);
  });

  it('结构不符（items 非数组）时同样回退', () => {
    localStorage.setItem(KEY_MEMORY, JSON.stringify({ items: 'oops' }));
    expect(readMemory().items).toEqual([]);
  });

  it('损坏数据下 buildGreeting 仍返回默认问候语（端到端兜底）', () => {
    localStorage.setItem(KEY_PROFILE, '<<<');
    localStorage.setItem(KEY_MEMORY, '>>>');
    expect(buildGreeting(readProfile(), readMemory(), 0)).toBe(DEFAULT_GREETING);
  });
});

describe('addMemory —— 上限与截断', () => {
  it('正常添加返回 ok 并可回读', () => {
    expect(addMemory('我喜欢农学院的银杏', 'manual')).toBe('ok');
    expect(readMemory().items).toHaveLength(1);
    expect(readMemory().items[0].text).toBe('我喜欢农学院的银杏');
  });

  it('空内容返回 empty，不写入', () => {
    expect(addMemory('', 'manual')).toBe('empty');
    expect(addMemory('    ', 'manual')).toBe('empty');
    expect(readMemory().items).toHaveLength(0);
  });

  it('重复内容返回 duplicate，不重复写入', () => {
    addMemory('同一句话', 'manual');
    expect(addMemory('同一句话', 'manual')).toBe('duplicate');
    expect(readMemory().items).toHaveLength(1);
  });

  it('【50 条上限】写满 50 条后第 51 条返回 full 且总数仍为 50', () => {
    for (let i = 0; i < MEMORY_MAX; i++) {
      expect(addMemory(`记忆-${i}`, 'manual')).toBe('ok');
    }
    expect(readMemory().items).toHaveLength(MEMORY_MAX);
    expect(addMemory('第51条', 'manual')).toBe('full');
    expect(readMemory().items).toHaveLength(MEMORY_MAX);
    expect(readMemory().items.some((i) => i.text === '第51条')).toBe(false);
  });

  it('【100 字截断】超长文本按 MEMORY_TEXT_MAX 截断后存储', () => {
    const long = '农'.repeat(150);
    expect(addMemory(long, 'manual')).toBe('ok');
    const stored = readMemory().items[0].text;
    expect(stored).toHaveLength(MEMORY_TEXT_MAX);
    expect(stored).toBe('农'.repeat(MEMORY_TEXT_MAX));
  });

  it('恰好 100 字不截断', () => {
    const exact = '农'.repeat(MEMORY_TEXT_MAX);
    addMemory(exact, 'manual');
    expect(readMemory().items[0].text).toHaveLength(MEMORY_TEXT_MAX);
    expect(isMemoryTextTruncated(exact)).toBe(false);
  });

  it('normalizeMemoryText / isMemoryTextTruncated 判定一致', () => {
    expect(normalizeMemoryText('  前后空白  ')).toBe('前后空白');
    expect(normalizeMemoryText('农'.repeat(120))).toHaveLength(MEMORY_TEXT_MAX);
    expect(isMemoryTextTruncated('农'.repeat(101))).toBe(true);
    expect(isMemoryTextTruncated('短')).toBe(false);
  });

  it('removeMemory 只删目标条目', () => {
    addMemory('A', 'manual');
    addMemory('B', 'manual');
    const target = readMemory().items.find((i) => i.text === 'A')!;
    removeMemory(target.id);
    const rest = readMemory().items;
    expect(rest).toHaveLength(1);
    expect(rest[0].text).toBe('B');
  });
});

describe('addMemoryBatch —— 触顶只导入前 N 条、不回滚', () => {
  it('普通批量导入全部成功', () => {
    const r = addMemoryBatch(['一', '二', '三'], 'note');
    expect(r.added).toBe(3);
    expect(r.skipped).toBe(0);
    expect(readMemory().items).toHaveLength(3);
  });

  it('批量导入的 source 为 note', () => {
    addMemoryBatch(['笔记一'], 'note');
    expect(readMemory().items[0].source).toBe('note');
  });

  it('【触顶不回滚】已有 48 条，导入 5 条 → 只加前 2 条，已导入部分保留', () => {
    for (let i = 0; i < MEMORY_MAX - 2; i++) addMemory(`已有-${i}`, 'manual');
    expect(readMemory().items).toHaveLength(MEMORY_MAX - 2);

    const r = addMemoryBatch(['新一', '新二', '新三', '新四', '新五'], 'note');
    expect(r.added).toBe(2);
    expect(r.skipped).toBe(3);
    expect(r.reason).toBe('full');

    const items = readMemory().items;
    expect(items).toHaveLength(MEMORY_MAX);
    // 前 2 条已入库（不回滚）
    expect(items.some((i) => i.text === '新一')).toBe(true);
    expect(items.some((i) => i.text === '新二')).toBe(true);
    // 后 3 条未入库
    expect(items.some((i) => i.text === '新三')).toBe(false);
    expect(items.some((i) => i.text === '新五')).toBe(false);
  });

  it('已满时批量导入 added=0、reason=full，不抛错', () => {
    for (let i = 0; i < MEMORY_MAX; i++) addMemory(`满-${i}`, 'manual');
    const r = addMemoryBatch(['x', 'y'], 'note');
    expect(r.added).toBe(0);
    expect(r.reason).toBe('full');
    expect(readMemory().items).toHaveLength(MEMORY_MAX);
  });

  it('空数组 / 全空白行 → added=0，不写入', () => {
    expect(addMemoryBatch([], 'note').added).toBe(0);
    expect(addMemoryBatch(['', '   ', '\t'], 'note').added).toBe(0);
    expect(readMemory().items).toHaveLength(0);
  });

  it('批量内部去重 + 与已有记忆去重', () => {
    addMemory('重复句', 'manual');
    const r = addMemoryBatch(['重复句', '重复句', '新句'], 'note');
    expect(r.added).toBe(1);
    expect(readMemory().items).toHaveLength(2);
  });

  it('批量导入的超长行同样按 100 字截断', () => {
    addMemoryBatch(['农'.repeat(200)], 'note');
    expect(readMemory().items[0].text).toHaveLength(MEMORY_TEXT_MAX);
  });
});

describe('writeProfile / isProfileFilled', () => {
  it('写入后可回读（grade 必须是合法枚举值）', () => {
    expect(writeProfile({ nickname: '小吉', major: '农学', grade: '2026级' })).toBe(true);
    const p = readProfile();
    expect(p.nickname).toBe('小吉');
    expect(p.major).toBe('农学');
    expect(p.grade).toBe('2026级');
    expect(p.version).toBe(1);
    expect(p.updatedAt).toBeGreaterThan(0);
  });

  it('超长昵称截断到 12 字、超长专业截断到 20 字', () => {
    writeProfile({ nickname: '吉'.repeat(30), major: '农'.repeat(50), grade: '2025级' });
    const p = readProfile();
    expect(p.nickname).toHaveLength(PROFILE_NICKNAME_MAX);
    expect(p.major).toHaveLength(PROFILE_MAJOR_MAX);
  });

  it('首尾空白被 trim', () => {
    writeProfile({ nickname: '  小吉  ', major: '  农学  ', grade: '' });
    expect(readProfile().nickname).toBe('小吉');
    expect(readProfile().major).toBe('农学');
  });

  it('【稳健性】写入非法 grade 后 guard 拒绝、回退空档案（不会读出脏数据）', () => {
    // TS 层面 Grade 已约束，此处模拟外部篡改 localStorage 的场景
    localStorage.setItem(
      KEY_PROFILE,
      JSON.stringify({ version: 1, nickname: '小吉', major: '农学', grade: '大一', updatedAt: 1 }),
    );
    expect(readProfile()).toEqual(EMPTY_PROFILE);
  });

  it('GRADE_OPTIONS 中的每个值都能正常往返', () => {
    for (const g of GRADE_OPTIONS) {
      writeProfile({ nickname: 'n', major: 'm', grade: g });
      expect(readProfile().grade).toBe(g);
    }
  });

  it('isProfileFilled 对空档案返回 false，有任一字段返回 true', () => {
    expect(isProfileFilled(EMPTY_PROFILE)).toBe(false);
    expect(isProfileFilled(profile('小吉'))).toBe(true);
    expect(isProfileFilled(profile('', '农学'))).toBe(true);
  });
});
