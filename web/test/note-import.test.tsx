// [QA 临时文件] 测试范围 8（P1）：笔记导入
// 验收依据：PRD-P1-02（5 行 → +5 条、原文一字不改）；架构 T5.6（触顶只导入前 N 条、不回滚）；D4 不做语义解析

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteImportPanel } from '../src/components/NoteImportPanel';
import { readMemory, addMemory } from '../src/lib/profile';
import { MEMORY_MAX, MEMORY_TEXT_MAX } from '../src/types/local';

function renderPanel(remaining = MEMORY_MAX) {
  const onImported = vi.fn();
  const showToast = vi.fn();
  const utils = render(
    <NoteImportPanel remaining={remaining} onImported={onImported} showToast={showToast} />,
  );
  return { ...utils, onImported, showToast };
}

/** 粘贴多行文本（userEvent.type 对换行较慢，直接 paste） */
async function paste(user: ReturnType<typeof userEvent.setup>, text: string) {
  const ta = screen.getByRole('textbox', { name: /粘贴纯文本笔记/ });
  ta.focus();
  await user.paste(text);
  return ta;
}

async function importAll(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /导入/ }));
  await user.click(screen.getByRole('button', { name: '确认导入' }));
}

describe('笔记导入 —— 基础链路', () => {
  it('【AC】粘贴 5 行 → 确认导入 → 记忆增加 5 条', async () => {
    const user = userEvent.setup();
    const { onImported } = renderPanel();

    await paste(user, '我不太能吃辣\n周三下午没课\n宿舍在 6 号楼\n喜欢在图书馆自习\n每周二有社团活动');
    expect(screen.getByText(/将导入 5 条/)).toBeInTheDocument();

    await importAll(user);

    const items = readMemory().items;
    expect(items).toHaveLength(5);
    expect(onImported).toHaveBeenCalled();
  });

  it('【AC·D4】导入内容一字不改（不做任何语义解析/改写）', async () => {
    const user = userEvent.setup();
    renderPanel();
    const raw = ['我不太能吃辣', '周三下午没课', '宿舍在 6 号楼', '喜欢在图书馆自习', '每周二有社团活动'];
    await paste(user, raw.join('\n'));
    await importAll(user);

    const texts = readMemory().items.map((i) => i.text);
    for (const line of raw) {
      expect(texts, `原文被改写或丢失: ${line}`).toContain(line);
    }
  });

  it('导入的记忆 source 标记为 note（可与手动录入区分）', async () => {
    const user = userEvent.setup();
    renderPanel();
    await paste(user, '来自笔记的一条');
    await importAll(user);
    expect(readMemory().items[0].source).toBe('note');
  });

  it('行首尾空白被 trim，但行内空格保留', async () => {
    const user = userEvent.setup();
    renderPanel();
    await paste(user, '   我 不太 能吃辣   \n  宿舍在 6 号楼  ');
    await importAll(user);
    const texts = readMemory().items.map((i) => i.text);
    expect(texts).toContain('我 不太 能吃辣');
    expect(texts).toContain('宿舍在 6 号楼');
  });

  it('空行被跳过：5 行内容夹 3 个空行 → 仍只导入 5 条', async () => {
    const user = userEvent.setup();
    renderPanel();
    await paste(user, 'A\n\nB\n\n\nC\nD\nE');
    expect(screen.getByText(/将导入 5 条/)).toBeInTheDocument();
    await importAll(user);
    expect(readMemory().items).toHaveLength(5);
  });

  it('CRLF 换行同样正确切分（Windows 粘贴场景）', async () => {
    const user = userEvent.setup();
    renderPanel();
    await paste(user, 'A\r\nB\r\nC');
    expect(screen.getByText(/将导入 3 条/)).toBeInTheDocument();
    await importAll(user);
    expect(readMemory().items).toHaveLength(3);
  });

  it('导入成功后输入框清空', async () => {
    const user = userEvent.setup();
    renderPanel();
    const ta = await paste(user, 'A\nB');
    await importAll(user);
    expect((ta as HTMLTextAreaElement).value).toBe('');
  });

  it('导入成功提示条数', async () => {
    const user = userEvent.setup();
    const { showToast } = renderPanel();
    await paste(user, 'A\nB\nC');
    await importAll(user);
    expect(showToast).toHaveBeenCalledWith('已导入 3 条');
  });
});

describe('笔记导入 —— 空输入拒绝', () => {
  it('【AC】未输入时导入按钮禁用，提示「先写点内容」', () => {
    renderPanel();
    expect(screen.getByText('先写点内容')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /导入/ })).toBeDisabled();
  });

  it('【AC】只输入空白/空行时按钮仍禁用，不写入任何记忆', async () => {
    const user = userEvent.setup();
    renderPanel();
    await paste(user, '   \n\n\t\n   ');
    expect(screen.getByRole('button', { name: /导入/ })).toBeDisabled();
    expect(readMemory().items).toHaveLength(0);
  });

  it('剩余容量为 0 时按钮禁用', () => {
    renderPanel(0);
    expect(screen.getByRole('button', { name: /导入/ })).toBeDisabled();
  });
});

describe('笔记导入 —— 触顶只导入前 N 条、不回滚（架构 T5.6）', () => {
  it('【AC】剩余容量 2，粘贴 5 行 → 预览提示只导入 2 条并说明 3 条不会导入', async () => {
    const user = userEvent.setup();
    renderPanel(2);
    await paste(user, 'A\nB\nC\nD\nE');
    expect(screen.getByText(/将导入 2 条/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /导入/ }));
    expect(screen.getByText(/确认导入这 2 条/)).toBeInTheDocument();
    expect(screen.getByText(/还有 3 条不会被导入/)).toBeInTheDocument();
  });

  it('【AC】已有 48 条 + 粘贴 5 行 → 实际入库前 2 条，已导入部分不回滚', async () => {
    for (let i = 0; i < MEMORY_MAX - 2; i++) addMemory(`已有-${i}`, 'manual');
    const user = userEvent.setup();
    const { showToast } = renderPanel(2);

    await paste(user, '新一\n新二\n新三\n新四\n新五');
    await importAll(user);

    const texts = readMemory().items.map((i) => i.text);
    expect(readMemory().items).toHaveLength(MEMORY_MAX);
    expect(texts).toContain('新一');
    expect(texts).toContain('新二');
    expect(texts).not.toContain('新三');
    expect(texts).not.toContain('新五');
    expect(showToast).toHaveBeenCalledWith('已导入 2 条，跳过 3 条');
  });

  it('记忆已满时导入 → added=0 并给出提示，不抛错', async () => {
    for (let i = 0; i < MEMORY_MAX; i++) addMemory(`满-${i}`, 'manual');
    const user = userEvent.setup();
    const { showToast } = renderPanel(0);
    // remaining=0 时按钮禁用，用 remaining>0 但实际已满的边界再验一次
    expect(screen.getByRole('button', { name: /导入/ })).toBeDisabled();

    // 模拟父组件传入过期的 remaining（竞态）
    renderPanel(5);
    const tas = screen.getAllByRole('textbox', { name: /粘贴纯文本笔记/ });
    tas[tas.length - 1].focus();
    await user.paste('溢出一\n溢出二');
    const btns = screen.getAllByRole('button', { name: /导入/ });
    await user.click(btns[btns.length - 1]);
    await user.click(screen.getByRole('button', { name: '确认导入' }));

    expect(readMemory().items).toHaveLength(MEMORY_MAX);
    expect(showToast).not.toHaveBeenCalledWith(expect.stringMatching(/^已导入 [1-9]/));
  });

  it('超长行按 100 字截断后入库', async () => {
    const user = userEvent.setup();
    renderPanel();
    await paste(user, '农'.repeat(200));
    await importAll(user);
    expect(readMemory().items[0].text).toHaveLength(MEMORY_TEXT_MAX);
  });
});

describe('笔记导入 —— 二次确认交互', () => {
  it('点「导入」只进入确认态，不写入数据', async () => {
    const user = userEvent.setup();
    renderPanel();
    await paste(user, 'A\nB');
    await user.click(screen.getByRole('button', { name: /导入/ }));
    expect(screen.getByText(/确认导入这 2 条/)).toBeInTheDocument();
    expect(readMemory().items).toHaveLength(0);
  });

  it('点「再看看」取消，数据不写入且草稿保留', async () => {
    const user = userEvent.setup();
    renderPanel();
    await paste(user, 'A\nB');
    await user.click(screen.getByRole('button', { name: /导入/ }));
    await user.click(screen.getByRole('button', { name: '再看看' }));

    expect(readMemory().items).toHaveLength(0);
    expect(screen.getByText(/将导入 2 条/)).toBeInTheDocument();
    expect((screen.getByRole('textbox', { name: /粘贴纯文本笔记/ }) as HTMLTextAreaElement).value).toBe('A\nB');
  });

  it('确认态下继续编辑文本会退出确认态（避免确认的是旧内容）', async () => {
    const user = userEvent.setup();
    renderPanel();
    await paste(user, 'A\nB');
    await user.click(screen.getByRole('button', { name: /导入/ }));
    expect(screen.getByText(/确认导入这 2 条/)).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /粘贴纯文本笔记/ }), '\nC');
    expect(screen.queryByText(/确认导入这/)).not.toBeInTheDocument();
    expect(screen.getByText(/将导入 3 条/)).toBeInTheDocument();
  });

  it('重复内容被去重，提示跳过条数', async () => {
    addMemory('已存在的一条', 'manual');
    const user = userEvent.setup();
    const { showToast } = renderPanel();
    await paste(user, '已存在的一条\n全新的一条');
    await importAll(user);

    expect(readMemory().items).toHaveLength(2);
    expect(showToast).toHaveBeenCalledWith('已导入 1 条，跳过 1 条');
  });
});
