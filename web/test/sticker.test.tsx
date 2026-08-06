// [QA 临时文件] 测试范围 7（P1）：贴纸不触发请求 / 不进 history / 恢复容错 / 持久化
// 验收依据：PRD-P1-01；架构 §2.6 约定 1~4、§6.5；N5「贴纸不得进入 LLM 上下文」

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SSEEvent } from '../src/types/api';

/* ---------------- api 层 mock：streamChat / getFeatures / postFeedback ---------------- */
// SSE 契约（src/types/api.ts）：{ type:'token', content } / { type:'done', message_id }
const streamChatMock = vi.fn(
  async (_req: unknown, onEvent: (ev: SSEEvent) => void) => {
    onEvent({ type: 'token', content: '好的' } as SSEEvent);
    onEvent({ type: 'done', message_id: 'srv-1' } as SSEEvent);
  },
);
const getFeaturesMock = vi.fn(async () => ({ data: [] }));
const postFeedbackMock = vi.fn(async () => ({ data: { ok: true } }));

vi.mock('../src/lib/api', () => ({
  streamChat: (...args: unknown[]) =>
    (streamChatMock as unknown as (...a: unknown[]) => Promise<void>)(...args),
  getFeatures: () => getFeaturesMock(),
  postFeedback: () => postFeedbackMock(),
}));

import { ChatPage } from '../src/pages/ChatPage';
import { STICKER_LABELS } from '../src/components/StickerPanel';
import { MASCOT_EXPRESSIONS } from '../src/components/Mascot';

const CONV_KEY = 'jxn-conv-baodao';

function renderChat(path = '/chat?scenario=baodao') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ChatPage />
    </MemoryRouter>,
  );
}

/** 打开贴纸面板并点选某姿态 */
async function pickSticker(user: ReturnType<typeof userEvent.setup>, label = '开心') {
  await user.click(screen.getByRole('button', { name: '贴纸' }));
  await user.click(await screen.findByRole('button', { name: label }));
}

beforeEach(() => {
  streamChatMock.mockClear();
  getFeaturesMock.mockClear();
  postFeedbackMock.mockClear();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('贴纸插入 —— 不触发任何后端请求（架构 §2.6 约定 1）', () => {
  it('【核心】插入贴纸后 streamChat 一次都没有被调用', async () => {
    const user = userEvent.setup();
    renderChat();
    await pickSticker(user, '开心');

    expect(streamChatMock, 'insertSticker 不得调用 /api/v1/chat').not.toHaveBeenCalled();
  });

  it('连续插入 6 张贴纸仍然零请求', async () => {
    const user = userEvent.setup();
    renderChat();
    for (const expr of MASCOT_EXPRESSIONS) {
      await pickSticker(user, STICKER_LABELS[expr]);
    }
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it('插入贴纸不产生 assistant 占位气泡、不进入 loading 态', async () => {
    const user = userEvent.setup();
    renderChat();
    await pickSticker(user, '开心');

    // 没有「正在输入」指示器
    expect(document.querySelector('.typing')).toBeNull();
    // 消息里只有用户那条贴纸（无 assistant 空气泡）
    const bubbles = document.querySelectorAll('.bubble');
    expect(bubbles.length).toBe(1);
  });

  it('贴纸气泡带可读回退文案 [贴纸·标签]，不是空气泡', async () => {
    const user = userEvent.setup();
    renderChat();
    await pickSticker(user, '干饭');

    await waitFor(() => {
      const raw = localStorage.getItem(CONV_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.messages[0].content).toBe('[贴纸·干饭]');
    });
  });

  it('点选贴纸后面板自动收起', async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(screen.getByRole('button', { name: '贴纸' }));
    expect(document.querySelector('.sticker-panel')).not.toBeNull();
    await user.click(await screen.findByRole('button', { name: '平静' }));
    await waitFor(() => expect(document.querySelector('.sticker-panel')).toBeNull());
  });
});

describe('send() —— history 过滤贴纸（架构 §2.6 约定 4 / N5）', () => {
  it('【核心】发送提问时 history 中不包含任何 [贴纸·…] 内容', async () => {
    const user = userEvent.setup();
    renderChat();

    // 先发一条正常消息，让 history 里有内容
    const input = screen.getByRole('textbox');
    await user.type(input, '第一句正常提问');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(1));
    // 必须等首轮流式结束（loading 归位），否则 send() 会因 loading 直接 return
    await waitFor(() => expect(screen.getByText('好的')).toBeInTheDocument());
    await waitFor(() => expect(document.querySelector('.typing')).toBeNull());

    // 插入贴纸
    await pickSticker(user, '开心');
    expect(streamChatMock).toHaveBeenCalledTimes(1); // 仍然只有 1 次

    // 再发一条提问
    await user.type(screen.getByRole('textbox'), '第二句正常提问');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(2));

    const secondReq = streamChatMock.mock.calls[1][0] as {
      history: { role: string; content: string }[];
      message: string;
    };

    // 断言 1：history 里没有任何贴纸回退文案
    for (const h of secondReq.history) {
      expect(h.content, `history 混入贴纸: ${h.content}`).not.toMatch(/\[贴纸·/);
    }
    // 断言 2：正常消息仍在 history 中（不是把 history 整个清空来「作弊」）
    expect(secondReq.history.some((h) => h.content === '第一句正常提问')).toBe(true);
    expect(secondReq.message).toBe('第二句正常提问');
  });

  it('请求体字段结构不变（scenario_id / message / history / conversation_id）', async () => {
    const user = userEvent.setup();
    renderChat();
    await user.type(screen.getByRole('textbox'), '你好');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(streamChatMock).toHaveBeenCalled());

    const req = streamChatMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(req).sort()).toEqual(
      ['conversation_id', 'history', 'message', 'scenario_id'].sort(),
    );
    expect(req.scenario_id).toBe('baodao');
    expect(Array.isArray(req.history)).toBe(true);
  });

  it('会话里只有贴纸时，history 为空数组（不是 undefined、不报错）', async () => {
    const user = userEvent.setup();
    renderChat();
    await pickSticker(user, '睡了');
    await user.type(screen.getByRole('textbox'), '在吗');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(streamChatMock).toHaveBeenCalled());

    const req = streamChatMock.mock.calls[0][0] as { history: unknown[] };
    expect(req.history).toEqual([]);
  });
});

describe('normalizeRestoredMessage —— 贴纸字段恢复与容错（架构 §2.6 约定 3）', () => {
  it('kind/sticker 原样透传：刷新后贴纸仍是贴纸', async () => {
    localStorage.setItem(
      CONV_KEY,
      JSON.stringify({
        conversationId: 'c1',
        messages: [
          { id: 'a1', role: 'user', content: '[贴纸·开心]', kind: 'sticker', sticker: 'happy', status: 'done' },
        ],
      }),
    );
    renderChat();
    // 贴纸气泡渲染出来（aria-label 用标签文案）
    await waitFor(() => {
      expect(document.querySelector('.bubble.sticker')).not.toBeNull();
    });
  });

  it('【容错】sticker 姿态非法 → 降级为纯文本气泡，不出空气泡', async () => {
    localStorage.setItem(
      CONV_KEY,
      JSON.stringify({
        conversationId: 'c1',
        messages: [
          {
            id: 'a1',
            role: 'user',
            content: '[贴纸·未知]',
            kind: 'sticker',
            sticker: 'not-a-real-pose',
            status: 'done',
          },
        ],
      }),
    );
    renderChat();
    await waitFor(() => {
      // 降级后不应命中 sticker 气泡类
      expect(document.querySelector('.bubble.sticker')).toBeNull();
      // 但可读文案仍然显示（不是空气泡）
      expect(screen.getByText('[贴纸·未知]')).toBeInTheDocument();
    });
  });

  it('【容错】声明 kind=sticker 但完全缺 sticker 字段 → 降级为文本', async () => {
    localStorage.setItem(
      CONV_KEY,
      JSON.stringify({
        conversationId: 'c1',
        messages: [{ id: 'a1', role: 'user', content: '[贴纸·丢了]', kind: 'sticker', status: 'done' }],
      }),
    );
    renderChat();
    await waitFor(() => {
      expect(document.querySelector('.bubble.sticker')).toBeNull();
      expect(screen.getByText('[贴纸·丢了]')).toBeInTheDocument();
    });
  });

  it('【向后兼容】旧会话无 kind 字段 → 按普通文本恢复，不崩', async () => {
    localStorage.setItem(
      CONV_KEY,
      JSON.stringify({
        conversationId: 'c1',
        messages: [
          { id: 'old1', role: 'user', content: '老消息', status: 'done' },
          { id: 'old2', role: 'assistant', content: '老回复', status: 'done' },
        ],
      }),
    );
    expect(() => renderChat()).not.toThrow();
    await waitFor(() => {
      expect(screen.getByText('老消息')).toBeInTheDocument();
      expect(screen.getByText('老回复')).toBeInTheDocument();
    });
  });

  it('【容错】整份会话是损坏 JSON → 空会话启动、显示默认问候语，不白屏', async () => {
    localStorage.setItem(CONV_KEY, '{{{ broken');
    expect(() => renderChat()).not.toThrow();

    await waitFor(() => {
      // 空态问候语气泡出现（这就是「不白屏」的证据）
      expect(
        screen.getByText('同学你好，我是吉小农，吉林农业大学的一站式校园 AI 助手，随时问我～'),
      ).toBeInTheDocument();
    });
    // 没有任何用户消息被错误恢复出来
    expect(document.querySelector('.bubble.user')).toBeNull();
    expect(document.querySelector('.bubble.sticker')).toBeNull();
    // 输入框可用，应用处于可交互状态
    expect(screen.getByRole('textbox')).toBeEnabled();
  });

  it('恢复后的贴纸不会进入下一次请求的 history', async () => {
    localStorage.setItem(
      CONV_KEY,
      JSON.stringify({
        conversationId: 'c1',
        messages: [
          { id: 'a1', role: 'user', content: '历史提问', status: 'done' },
          { id: 'a2', role: 'user', content: '[贴纸·开心]', kind: 'sticker', sticker: 'happy', status: 'done' },
        ],
      }),
    );
    const user = userEvent.setup();
    renderChat();
    await user.type(screen.getByRole('textbox'), '新提问');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(streamChatMock).toHaveBeenCalled());

    const req = streamChatMock.mock.calls[0][0] as { history: { content: string }[] };
    expect(req.history.map((h) => h.content)).toEqual(['历史提问']);
  });
});

describe('贴纸持久化 —— 复用既有 localStorage 链路（会话持久化逻辑零改动）', () => {
  it('插入贴纸后经既有 250ms 防抖写入 jxn-conv-<scenario>', async () => {
    const user = userEvent.setup();
    renderChat();
    await pickSticker(user, '加油');

    await waitFor(
      () => {
        const raw = localStorage.getItem(CONV_KEY);
        expect(raw, '贴纸未落盘到既有会话键').not.toBeNull();
        const parsed = JSON.parse(raw!);
        expect(parsed.messages).toHaveLength(1);
        expect(parsed.messages[0].kind).toBe('sticker');
        expect(parsed.messages[0].sticker).toBe('cheer');
        expect(parsed.messages[0].role).toBe('user');
        expect(parsed.messages[0].status).toBe('done');
      },
      { timeout: 2000 },
    );
  });

  it('未引入新的存储键：只写 jxn-conv-*，不新增任何 jxn-sticker-* 之类的键', async () => {
    const user = userEvent.setup();
    renderChat();
    await pickSticker(user, '开心');
    await waitFor(() => expect(localStorage.getItem(CONV_KEY)).not.toBeNull());

    const keys = Object.keys(localStorage).filter((k) => k.startsWith('jxn-'));
    expect(keys).toEqual([CONV_KEY]);
  });

  it('卸载时立即落盘：不等防抖也不丢最后一张贴纸', async () => {
    const user = userEvent.setup();
    const { unmount } = renderChat();
    await pickSticker(user, '思考');
    act(() => unmount());

    const raw = localStorage.getItem(CONV_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.messages[0].sticker).toBe('think');
  });

  it('刷新往返：插入 → 卸载 → 重新挂载，贴纸仍在且仍是贴纸', async () => {
    const user = userEvent.setup();
    const { unmount } = renderChat();
    await pickSticker(user, '开心');
    act(() => unmount());

    renderChat();
    await waitFor(() => {
      expect(document.querySelector('.bubble.sticker')).not.toBeNull();
    });
  });
});

describe('StickerPanel —— 6 种姿态完整可选', () => {
  it('面板渲染 6 个按钮，标签与 STICKER_LABELS 一致', async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(screen.getByRole('button', { name: '贴纸' }));

    for (const expr of MASCOT_EXPRESSIONS) {
      expect(screen.getByRole('button', { name: STICKER_LABELS[expr] })).toBeInTheDocument();
    }
    expect(document.querySelectorAll('.sticker-item')).toHaveLength(6);
  });

  it('每个贴纸按钮都有 aria-label（无障碍）', async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(screen.getByRole('button', { name: '贴纸' }));
    document.querySelectorAll('.sticker-item').forEach((el) => {
      expect(el.getAttribute('aria-label')).toBeTruthy();
    });
  });

  it('贴纸按钮 aria-pressed 随面板开关切换', async () => {
    const user = userEvent.setup();
    renderChat();
    const toggle = screen.getByRole('button', { name: '贴纸' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });
});
