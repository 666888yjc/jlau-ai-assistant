// [QA 临时文件] 移动端体验打磨 4 项改动验收
// 范围：1) viewport 放开缩放  2) InputBar inputmode/enterkeyhint
//       3) SSE 息屏挂起检测与重连（A/B/C/D 四场景）  4) .sticker-item 微动效 reduced-motion 安全
// 不属于交付物；tsconfig.json 的 include 只有 "src"，本目录不进 tsc --noEmit。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SSEEvent } from '../src/types/api';

/** 读取仓库内文件：vitest 的 import.meta.url 不是 file: 协议，统一按 web/ 根目录解析 */
function readRepoFile(rel: string): string {
  const candidates = [resolve(process.cwd(), rel), resolve(process.cwd(), 'web', rel)];
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error(`找不到待审查文件: ${rel}（尝试过 ${candidates.join(' | ')}）`);
  return readFileSync(hit, 'utf8');
}

/* ============================ api 层 mock ============================ */
// 关键：捕获每次调用的 (req, onEvent, signal)，供后续手动推流 / 断言 abort。
interface CapturedCall {
  req: Record<string, unknown>;
  onEvent: (ev: SSEEvent) => void;
  signal?: AbortSignal;
}
const calls: CapturedCall[] = [];

/** 挂起流：永不 resolve，只有被 abort 时才 reject（模拟息屏后死掉的 SSE） */
function hungImpl(req: unknown, onEvent: (ev: SSEEvent) => void, signal?: AbortSignal) {
  calls.push({ req: req as Record<string, unknown>, onEvent, signal });
  return new Promise<void>((_resolve, reject) => {
    if (!signal) return; // 无 signal 就真的永远挂着
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
}

const streamChatMock = vi.fn(hungImpl);
const getFeaturesMock = vi.fn(async () => ({ data: [] }));
const postFeedbackMock = vi.fn(async () => ({ data: { ok: true } }));

vi.mock('../src/lib/api', () => ({
  streamChat: (...args: unknown[]) =>
    (streamChatMock as unknown as (...a: unknown[]) => Promise<void>)(...args),
  getFeatures: () => getFeaturesMock(),
  postFeedback: () => postFeedbackMock(),
}));

import { ChatPage } from '../src/pages/ChatPage';
import { InputBar } from '../src/components/InputBar';

const CONV_KEY = 'jxn-conv-baodao';
const STALL_PROMPT = '连接似乎中断了，内容可能没有更新。';

beforeEach(() => {
  calls.length = 0;
  streamChatMock.mockReset();
  streamChatMock.mockImplementation(hungImpl);
  getFeaturesMock.mockClear();
  postFeedbackMock.mockClear();
  localStorage.clear();
});

function renderChat(path = '/chat?scenario=baodao') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ChatPage />
    </MemoryRouter>,
  );
}

/** 发一条问题并等 streamChat 被调用（流保持挂起，loading 维持 true） */
async function sendAndHang(user: ReturnType<typeof userEvent.setup>, question: string) {
  await user.type(screen.getByRole('textbox'), question);
  await user.keyboard('{Enter}');
  await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(calls.length));
  expect(calls.length).toBeGreaterThan(0);
}

/** 把「现在」推到 lastTokenAt 之后 ms 毫秒（不用 fake timers，避免 userEvent 卡死） */
function advanceWallClock(ms: number) {
  const real = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(real + ms);
}
function restoreWallClock() {
  const spy = Date.now as unknown as { mockRestore?: () => void };
  spy.mockRestore?.();
}

/** 派发一次「回到前台」 */
function fireBackToForeground() {
  expect(document.visibilityState).toBe('visible');
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/* ==================== 1. viewport 放开双指缩放 ==================== */
describe('改动 1 —— index.html viewport 允许缩放（无障碍）', () => {
  const html = readRepoFile('index.html');

  it('【核心】不含 user-scalable / maximum-scale 任何限制缩放的声明', () => {
    const hits = html.match(/user-scalable|maximum-scale/g) ?? [];
    expect(hits, `仍在限制缩放: ${hits.join(', ')}`).toHaveLength(0);
  });

  it('viewport content 精确为 width=device-width, initial-scale=1, viewport-fit=cover', () => {
    const m = html.match(/name="viewport"[\s\S]*?content="([^"]+)"/);
    expect(m, '未找到 viewport meta').not.toBeNull();
    expect(m![1].trim()).toBe('width=device-width, initial-scale=1, viewport-fit=cover');
  });

  it('viewport-fit=cover 保留（刘海屏安全区不回退）', () => {
    expect(html).toMatch(/viewport-fit=cover/);
  });
});

/* ============ 2. InputBar 移动键盘属性（inputmode / enterkeyhint） ============ */
describe('改动 2 —— InputBar 移动键盘渐进增强', () => {
  it('【核心】输入框渲染出 inputmode="text" 与 enterkeyhint="send"', () => {
    render(<InputBar value="" onChange={() => {}} onSend={() => {}} />);
    const box = screen.getByRole('textbox');
    expect(box.getAttribute('inputmode')).toBe('text');
    expect(box.getAttribute('enterkeyhint')).toBe('send');
  });

  it('props 签名未变：只传 value/onChange/onSend 也能渲染，且不渲染贴纸按钮', () => {
    render(<InputBar value="" onChange={() => {}} onSend={() => {}} />);
    expect(screen.queryByRole('button', { name: '贴纸' })).toBeNull();
    expect(screen.getByRole('button', { name: '发送' })).toBeInTheDocument();
  });

  it('回车发送行为未被属性改动破坏（Enter 触发 onSend、Shift+Enter 不触发）', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<InputBar value="有内容" onChange={() => {}} onSend={onSend} />);
    const box = screen.getByRole('textbox');
    box.focus();
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledTimes(1);
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('ChatPage 内的输入框同样带上这两个属性（真实调用点）', async () => {
    renderChat();
    const box = await screen.findByRole('textbox');
    expect(box.getAttribute('inputmode')).toBe('text');
    expect(box.getAttribute('enterkeyhint')).toBe('send');
  });
});

/* ============ 3. SSE 息屏挂起检测与重连 —— 场景 A/B/C/D ============ */
describe('改动 3 —— SSE 息屏挂起检测（场景 A：挂起 → 出提示，且不自动重发）', () => {
  it('【核心 A1】回前台且距上一 token > 8s → 出现挂起提示条与「重新生成」按钮', async () => {
    const user = userEvent.setup();
    renderChat();
    await sendAndHang(user, '食堂几点开门');

    expect(screen.queryByText(STALL_PROMPT), '未挂起时不应出现提示').toBeNull();

    advanceWallClock(20000);
    fireBackToForeground();

    expect(screen.getByText(STALL_PROMPT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重新生成/ })).toBeInTheDocument();
    restoreWallClock();
  });

  it('【核心 A2】挂起提示出现后 streamChat 没有被自动再次调用（只提示、不自动重发）', async () => {
    const user = userEvent.setup();
    renderChat();
    await sendAndHang(user, '图书馆几点关门');
    expect(streamChatMock).toHaveBeenCalledTimes(1);

    advanceWallClock(20000);
    fireBackToForeground();
    expect(screen.getByText(STALL_PROMPT)).toBeInTheDocument();
    restoreWallClock();

    // 再等一会儿，确认没有任何延迟触发的自动重发
    await new Promise((r) => setTimeout(r, 400));
    expect(streamChatMock, '自动重发会在用户不知情时多消耗一次额度').toHaveBeenCalledTimes(1);
  });

  it('提示条复用既有 .fallback-note + .btn.btn-ghost（零新增 CSS）', async () => {
    const user = userEvent.setup();
    renderChat();
    await sendAndHang(user, '宿舍报修找谁');
    advanceWallClock(20000);
    fireBackToForeground();

    const note = document.querySelector('.fallback-note');
    expect(note?.textContent).toBe(STALL_PROMPT);
    const btn = screen.getByRole('button', { name: /重新生成/ });
    expect(btn.className).toContain('btn');
    expect(btn.className).toContain('btn-ghost');
    // 无障碍：提示条走 role=status + aria-live
    const region = btn.closest('.msg-row');
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    restoreWallClock();
  });

  it('【边界】距上一 token 未超阈值（<8s）→ 不出提示', async () => {
    const user = userEvent.setup();
    renderChat();
    await sendAndHang(user, '快问快答');
    advanceWallClock(3000);
    fireBackToForeground();
    expect(screen.queryByText(STALL_PROMPT)).toBeNull();
    restoreWallClock();
  });

  it('【边界】不在 loading 中（无在途请求）→ 回前台不出提示', () => {
    renderChat();
    advanceWallClock(60000);
    fireBackToForeground();
    expect(screen.queryByText(STALL_PROMPT)).toBeNull();
    restoreWallClock();
  });
});

describe('改动 3 —— 场景 B：收到新 token → 提示自动消失', () => {
  it('【核心 B】stalled 态下 appendToken 收到内容 → 提示条撤下、内容继续追加', async () => {
    const user = userEvent.setup();
    renderChat();
    await sendAndHang(user, '选课系统怎么进');

    advanceWallClock(20000);
    fireBackToForeground();
    expect(screen.getByText(STALL_PROMPT)).toBeInTheDocument();
    restoreWallClock();

    // 流「活过来」了：推一个 token
    act(() => {
      calls[0].onEvent({ type: 'token', content: '教务系统入口在……' } as SSEEvent);
    });

    await waitFor(() => expect(screen.queryByText(STALL_PROMPT)).toBeNull());
    expect(screen.getByText('教务系统入口在……')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /重新生成/ })).toBeNull();
  });

  it('提示撤下后再次挂起仍可复现（状态不是一次性的）', async () => {
    const user = userEvent.setup();
    renderChat();
    await sendAndHang(user, '再来一次');

    advanceWallClock(20000);
    fireBackToForeground();
    expect(screen.getByText(STALL_PROMPT)).toBeInTheDocument();
    restoreWallClock();

    act(() => {
      calls[0].onEvent({ type: 'token', content: '嗯' } as SSEEvent);
    });
    await waitFor(() => expect(screen.queryByText(STALL_PROMPT)).toBeNull());

    advanceWallClock(20000);
    fireBackToForeground();
    expect(screen.getByText(STALL_PROMPT)).toBeInTheDocument();
    restoreWallClock();
  });
});

describe('改动 3 —— 场景 C：重新生成 = 只多发一次，history 与首发一致', () => {
  const QUESTION = '奖学金什么时候发';

  function seedHistory() {
    localStorage.setItem(
      CONV_KEY,
      JSON.stringify({
        conversationId: 'conv-seed',
        messages: [
          { id: 'h1', role: 'user', content: '历史提问', status: 'done' },
          { id: 'h2', role: 'assistant', content: '历史回答', status: 'done' },
        ],
      }),
    );
  }

  it('【核心 C】点「重新生成」后 streamChat 总调用次数 = 2，且第二次 history 与第一次逐字一致', async () => {
    seedHistory();
    const user = userEvent.setup();
    renderChat();
    await sendAndHang(user, QUESTION);
    expect(streamChatMock).toHaveBeenCalledTimes(1);

    advanceWallClock(20000);
    fireBackToForeground();
    restoreWallClock();

    await user.click(screen.getByRole('button', { name: /重新生成/ }));
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(2));

    // 再多等一会儿，确认不会滚出第 3 次（effect 循环重发）
    await new Promise((r) => setTimeout(r, 400));
    expect(streamChatMock, '重发只能发生一次').toHaveBeenCalledTimes(2);

    expect(calls[1].req.history).toEqual(calls[0].req.history);
    expect(calls[1].req.history).toEqual([
      { role: 'user', content: '历史提问' },
      { role: 'assistant', content: '历史回答' },
    ]);
    expect(calls[1].req.message).toBe(QUESTION);
    expect(calls[1].req.scenario_id).toBe(calls[0].req.scenario_id);
    expect(calls[1].req.conversation_id).toBe(calls[0].req.conversation_id);
  });

  it('【核心 C】重发后没有重复的用户气泡、没有卡死的空 assistant 占位', async () => {
    seedHistory();
    const user = userEvent.setup();
    renderChat();
    await sendAndHang(user, QUESTION);

    advanceWallClock(20000);
    fireBackToForeground();
    restoreWallClock();

    await user.click(screen.getByRole('button', { name: /重新生成/ }));
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(2));

    // 同一个问题只出现一次（不是「摘除失败又追加一条」）
    expect(screen.getAllByText(QUESTION)).toHaveLength(1);
    // 只有一个正在输入指示器（挂死的那个空 assistant 已被摘除）
    await waitFor(() => expect(document.querySelectorAll('.typing')).toHaveLength(1));
    // 挂起提示条已撤下
    expect(screen.queryByText(STALL_PROMPT)).toBeNull();
  });

  it('重发的请求体字段结构逐字节不变（scenario_id / message / history / conversation_id 四字段）', async () => {
    const user = userEvent.setup();
    renderChat();
    await sendAndHang(user, QUESTION);
    advanceWallClock(20000);
    fireBackToForeground();
    restoreWallClock();
    await user.click(screen.getByRole('button', { name: /重新生成/ }));
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(2));

    for (const c of calls) {
      expect(Object.keys(c.req).sort()).toEqual(
        ['conversation_id', 'history', 'message', 'scenario_id'].sort(),
      );
      expect(c.req).not.toHaveProperty('signal');
      expect(c.req).not.toHaveProperty('abort');
    }
  });

  it('signal 走 streamChat 第三个既有形参传入，且是 AbortSignal', async () => {
    const user = userEvent.setup();
    renderChat();
    await sendAndHang(user, QUESTION);
    expect(streamChatMock.mock.calls[0]).toHaveLength(3);
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
    expect(calls[0].signal!.aborted).toBe(false);
  });
});

describe('改动 3 —— 场景 D：主动 abort 不写回错误态', () => {
  it('【核心 D】abort 掉挂死的流后，不出现 error-banner / 「网络开小差」', async () => {
    const user = userEvent.setup();
    renderChat();
    await sendAndHang(user, '这条会被掐掉');

    advanceWallClock(20000);
    fireBackToForeground();
    restoreWallClock();

    await user.click(screen.getByRole('button', { name: /重新生成/ }));

    // 第一条流确实被 abort 了（catch 里靠 controller.signal.aborted 早退）
    await waitFor(() => expect(calls[0].signal!.aborted).toBe(true));
    // 给 rejection 充分的传播时间
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });

    expect(document.querySelector('.error-banner'), '主动中断被误报为网络故障').toBeNull();
    expect(screen.queryByText(/网络开小差/)).toBeNull();
    expect(screen.queryByRole('button', { name: /点击重发/ })).toBeNull();
  });

  it('【反证】非 abort 的真实失败仍然要报错（早退没有把错误吞掉）', async () => {
    streamChatMock.mockImplementation((req: unknown, onEvent, signal?: AbortSignal) => {
      calls.push({ req: req as Record<string, unknown>, onEvent, signal });
      return Promise.reject(new Error('boom'));
    });
    const user = userEvent.setup();
    renderChat();
    await user.type(screen.getByRole('textbox'), '真的失败了');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByText(/网络开小差，请稍后重试/)).toBeInTheDocument());
    expect(document.querySelector('.error-banner')).not.toBeNull();
  });
});

/* ============ 4. .sticker-item 微动效（reduced-motion 安全） ============ */
describe('改动 4 —— .sticker-item 微动效', () => {
  const cssRaw = readRepoFile('src/styles/global.css');
  const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, ''); // 去注释，只审真实声明

  interface Rule {
    selector: string;
    body: string;
    media: string[];
  }

  function parseRules(src: string): Rule[] {
    const out: Rule[] = [];
    const stack: string[] = [];
    let buf = '';
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '{') {
        const head = buf.trim();
        buf = '';
        if (head.startsWith('@media') || head.startsWith('@supports')) {
          stack.push(head);
          i++;
          continue;
        }
        let depth = 1;
        let body = '';
        i++;
        while (i < src.length) {
          if (src[i] === '{') depth++;
          else if (src[i] === '}') {
            depth--;
            if (depth === 0) break;
          }
          body += src[i];
          i++;
        }
        i++; // 跳过配对的 }
        out.push({ selector: head, body, media: [...stack] });
        continue;
      }
      if (ch === '}') {
        stack.pop();
        buf = '';
        i++;
        continue;
      }
      buf += ch;
      i++;
    }
    return out;
  }

  const rules = parseRules(css).filter((r) => /\.sticker-item\b/.test(r.selector));
  const inReduce = rules.filter((r) => r.media.some((m) => /prefers-reduced-motion:\s*reduce/.test(m)));
  const inNoPref = rules.filter((r) =>
    r.media.some((m) => /prefers-reduced-motion:\s*no-preference/.test(m)),
  );
  const unguarded = rules.filter((r) => !r.media.some((m) => /prefers-reduced-motion/.test(m)));

  it('确实解析到了 .sticker-item 规则（防止解析器空跑导致假绿）', () => {
    expect(rules.length).toBeGreaterThanOrEqual(4);
    expect(inReduce.length).toBeGreaterThan(0);
    expect(inNoPref.length).toBeGreaterThan(0);
  });

  it('【核心】no-preference 下有 transform 变换，且 hover 态被 (hover: hover) 二次守卫', () => {
    const withTransform = inNoPref.filter((r) => /(^|[\s;{])transform\s*:/.test(r.body));
    expect(withTransform.length, 'no-preference 下没有任何 transform 变换').toBeGreaterThan(0);
    expect(withTransform.some((r) => /rotate\(/.test(r.body))).toBe(true);
    expect(withTransform.some((r) => /translateY\(/.test(r.body))).toBe(true);

    const hoverRules = inNoPref.filter((r) => /:hover/.test(r.selector) && /transform\s*:/.test(r.body));
    expect(hoverRules.length, 'hover 微动效必须存在').toBeGreaterThan(0);
    for (const r of hoverRules) {
      expect(
        r.media.some((m) => /hover:\s*hover/.test(m)),
        `hover 变换未被 (hover: hover) 守卫，触屏会粘住: ${r.selector}`,
      ).toBe(true);
    }
  });

  it('【核心】任何 .sticker-item 规则都不得使用 scale（贴纸「仅 opacity、无 scale」约定）', () => {
    for (const r of rules) {
      expect(/scale\s*\(/.test(r.body), `${r.selector} 使用了 scale: ${r.body.trim()}`).toBe(false);
    }
  });

  it('【核心】prefers-reduced-motion: reduce 下 transform 显式归零（none !important）', () => {
    const zeroed = inReduce.filter((r) => /transform\s*:\s*none\s*!important/.test(r.body));
    expect(zeroed.length, 'reduce 下未把位移显式归零').toBeGreaterThan(0);
    // 覆盖基态 / hover / active 三种选择器
    const covered = zeroed.map((r) => r.selector).join(' ');
    expect(covered).toMatch(/\.sticker-item\b/);
    expect(covered).toMatch(/:hover/);
    expect(covered).toMatch(/:active/);
  });

  it('未被 reduced-motion 守卫的 .sticker-item 规则里没有 transform（动效全部条件化）', () => {
    for (const r of unguarded) {
      expect(
        /(^|[\s;{])transform\s*:/.test(r.body),
        `${r.selector} 在无媒体查询守卫下直接声明了 transform`,
      ).toBe(false);
    }
  });

  it('触控目标未被缩小：.sticker-item 高度仍为 48px（≥44px）', () => {
    const base = rules.find((r) => r.selector.trim() === '.sticker-item' && r.media.length === 0);
    expect(base, '找不到 .sticker-item 基础规则').toBeTruthy();
    expect(base!.body).toMatch(/height:\s*48px/);
  });
});

/* ============ 5. 回归护栏：本轮改动不得动持久化 / 请求体 ============ */
describe('回归护栏 —— 会话持久化与请求体零改动', () => {
  it('挂起→重新生成全过程后，localStorage 仍只写 jxn-conv-<scenario> 一个键', async () => {
    const user = userEvent.setup();
    renderChat();
    await sendAndHang(user, '会不会多写键');
    advanceWallClock(20000);
    fireBackToForeground();
    restoreWallClock();
    await user.click(screen.getByRole('button', { name: /重新生成/ }));
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(localStorage.getItem(CONV_KEY)).not.toBeNull(), { timeout: 2000 });
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('jxn-'));
    expect(keys).toEqual([CONV_KEY]);
  });

  it('卸载立即落盘链路仍然有效（250ms 防抖 + 卸载兜底未被改坏）', async () => {
    const user = userEvent.setup();
    const { unmount } = renderChat();
    await user.type(screen.getByRole('textbox'), '落盘验证');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(streamChatMock).toHaveBeenCalledTimes(1));
    act(() => unmount());

    const raw = localStorage.getItem(CONV_KEY);
    expect(raw, '卸载未立即落盘').not.toBeNull();
    const parsed = JSON.parse(raw!) as { messages: { content: string }[] };
    expect(parsed.messages.some((m) => m.content === '落盘验证')).toBe(true);
  });
});
