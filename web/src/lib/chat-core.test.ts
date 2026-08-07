import { describe, it, expect } from 'vitest';
import {
  chatReducer,
  findContinueDraft,
  lastUserBefore,
  excludeMessageIds,
} from './chat-core';
import { classifyError, ErrorCode } from './errors';
import { trimHistory } from './context';
import { INITIAL_CHAT_STATE, type ChatState } from '../types/chat-state';
import type { UIMessage } from '../types/chat';

/**
 * 会话状态机纯函数层单测（B5 T07 验收①：≥12 例、覆盖率 ≥80%）。
 *
 * 锁死语义（评审关注点）：
 *   - SEND / CLEAR_ERROR 保留 consecutiveFailures（UX-4 连击跨「换个问法」继续累积）
 *   - RESET 清零连击（仅场景切换路径）
 *   - ABORT 直落（无 'aborting' 过渡相位；user→stopped、超时→failed、silent→idle 防御）
 *   - DONE 清零连击（成功打断连击）
 *   - continue 的草稿定位与 history 排除（草稿对不进 LLM 上下文）
 */

function makeState(partial: Partial<ChatState> = {}): ChatState {
  return { ...INITIAL_CHAT_STATE, ...partial };
}

function userMsg(id: string, content: string, over: Partial<UIMessage> = {}): UIMessage {
  return { id, role: 'user', content, status: 'done', kind: 'text', ...over };
}

function assistantMsg(id: string, content: string, over: Partial<UIMessage> = {}): UIMessage {
  return { id, role: 'assistant', content, status: 'done', ...over };
}

describe('chatReducer: SEND / FIRST_TOKEN（保留连击）', () => {
  it('1. SEND 保留 consecutiveFailures（UX-4 跨轮累积）', () => {
    const next = chatReducer(
      makeState({ phase: 'classified', consecutiveFailures: 1 }),
      { type: 'SEND', requestId: 'r-1' },
    );
    expect(next.phase).toBe('sending');
    expect(next.consecutiveFailures).toBe(1);
  });

  it('2. SEND 复位本轮字段：requestId 更新、error/abortReason/ttfbMs 清空、degradedFrames 清零', () => {
    const next = chatReducer(
      makeState({
        phase: 'classified',
        requestId: 'r-old',
        error: classifyError({ httpStatus: 500 }),
        abortReason: 'ttfb-timeout',
        ttfbMs: 3200,
        degradedFrames: 3,
        retryCount: 2,
      }),
      { type: 'SEND', requestId: 'r-new' },
    );
    expect(next.requestId).toBe('r-new');
    expect(next.error).toBeNull();
    expect(next.abortReason).toBeNull();
    expect(next.ttfbMs).toBeNull();
    expect(next.degradedFrames).toBe(0);
    expect(next.retryCount).toBe(0);
  });

  it('3. FIRST_TOKEN → streaming 并记录 ttfbMs，连击保留', () => {
    const next = chatReducer(
      makeState({ phase: 'sending', consecutiveFailures: 1 }),
      { type: 'FIRST_TOKEN', ttfbMs: 812 },
    );
    expect(next.phase).toBe('streaming');
    expect(next.ttfbMs).toBe(812);
    expect(next.consecutiveFailures).toBe(1);
  });
});

describe('chatReducer: ABORT 直落（无 aborting 过渡相位）', () => {
  it('4. ABORT(user) → stopped，连击保留（用户停止不计失败）', () => {
    const next = chatReducer(makeState({ phase: 'streaming', consecutiveFailures: 1 }), {
      type: 'ABORT',
      reason: 'user',
    });
    expect(next.phase).toBe('stopped');
    expect(next.abortReason).toBe('user');
    expect(next.consecutiveFailures).toBe(1);
  });

  it('5. ABORT(ttfb-timeout / idle-timeout) → failed，等 FAIL 计入连击', () => {
    for (const reason of ['ttfb-timeout', 'idle-timeout'] as const) {
      const next = chatReducer(makeState({ phase: 'sending' }), { type: 'ABORT', reason });
      expect(next.phase, reason).toBe('failed');
      expect(next.abortReason, reason).toBe(reason);
    }
  });

  it('6. ABORT(silent: unmount / scenario-change) → idle（防御性分支），requestId 清空', () => {
    for (const reason of ['unmount', 'scenario-change'] as const) {
      const next = chatReducer(
        makeState({ phase: 'streaming', requestId: 'r-1' }),
        { type: 'ABORT', reason },
      );
      expect(next.phase, reason).toBe('idle');
      expect(next.requestId, reason).toBeNull();
    }
  });

  it('7. 任意 ABORT 都不产出已删除的 aborting 相位（死分支删除后行为不变）', () => {
    const reasons = ['user', 'ttfb-timeout', 'idle-timeout', 'unmount', 'scenario-change'] as const;
    for (const reason of reasons) {
      const next = chatReducer(makeState({ phase: 'streaming' }), { type: 'ABORT', reason });
      expect((next.phase as string), reason).not.toBe('aborting');
    }
  });
});

describe('chatReducer: FAIL / DONE（连击累积与打断）', () => {
  it('8. FAIL 终态失败 → classified 且 consecutiveFailures +1', () => {
    const next = chatReducer(makeState({ consecutiveFailures: 1 }), {
      type: 'FAIL',
      error: classifyError({ httpStatus: 500 }),
    });
    expect(next.phase).toBe('classified');
    expect(next.error?.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(next.consecutiveFailures).toBe(2);
  });

  it('9. FAIL 非终态（用户主动停止）→ 不 +1', () => {
    const next = chatReducer(makeState({ consecutiveFailures: 1 }), {
      type: 'FAIL',
      error: classifyError({ abortReason: 'user' }),
    });
    expect(next.consecutiveFailures).toBe(1);
  });

  it('10. DONE → done 且连击清零（成功打断连击）', () => {
    const next = chatReducer(makeState({ phase: 'streaming', consecutiveFailures: 2 }), {
      type: 'DONE',
    });
    expect(next.phase).toBe('done');
    expect(next.consecutiveFailures).toBe(0);
    expect(next.error).toBeNull();
  });
});

describe('chatReducer: CLEAR_ERROR / RESET / RETRY / DEGRADED_FRAME', () => {
  it('11. CLEAR_ERROR → idle，consecutiveFailures 保留（B5 修复 clearError 清零缺陷）', () => {
    const next = chatReducer(
      makeState({
        phase: 'classified',
        consecutiveFailures: 2,
        requestId: 'r-1',
        error: classifyError({ httpStatus: 500 }),
      }),
      { type: 'CLEAR_ERROR' },
    );
    expect(next.phase).toBe('idle');
    expect(next.consecutiveFailures).toBe(2);
    expect(next.error).toBeNull();
    expect(next.requestId).toBeNull();
  });

  it('12. RESET → INITIAL，consecutiveFailures 清零（场景切换 = 新会话）', () => {
    const next = chatReducer(makeState({ phase: 'classified', consecutiveFailures: 2 }), {
      type: 'RESET',
    });
    expect(next).toEqual(INITIAL_CHAT_STATE);
    expect(next.consecutiveFailures).toBe(0);
  });

  it('13. RETRY → retrying 且 retryCount +1', () => {
    const next = chatReducer(makeState({ phase: 'failed', retryCount: 1 }), { type: 'RETRY' });
    expect(next.phase).toBe('retrying');
    expect(next.retryCount).toBe(2);
  });

  it('14. DEGRADED_FRAME 递增 degradedFrames', () => {
    const next = chatReducer(makeState({ degradedFrames: 2 }), { type: 'DEGRADED_FRAME' });
    expect(next.degradedFrames).toBe(3);
  });
});

describe('findContinueDraft: 草稿定位（尾扫）', () => {
  it('15. 返回最后一条 error 且 content 非空的 assistant 气泡', () => {
    const msgs = [
      userMsg('u1', '报到带什么'),
      assistantMsg('a1', '完整答案', { status: 'done' }),
      userMsg('u2', '宿舍呢'),
      assistantMsg('a2', '部分内容', { status: 'error' }),
    ];
    const draft = findContinueDraft(msgs);
    expect(draft?.id).toBe('a2');
  });

  it('16. 返回 stopped 草稿（status 是 done 但 stopped=true）—— 只查 status 会漏', () => {
    const msgs = [
      userMsg('u1', '报到带什么'),
      assistantMsg('a1', '已生成一部分', { status: 'done', stopped: true }),
    ];
    const draft = findContinueDraft(msgs);
    expect(draft?.id).toBe('a1');
  });

  it('17. 跳过空气泡 / streaming 中 / 正常 done 的 assistant', () => {
    const msgs = [
      userMsg('u1', '问题'),
      assistantMsg('a-empty', '', { status: 'error' }),
      assistantMsg('a-stream', '在写…', { status: 'streaming' }),
      assistantMsg('a-done', '完整', { status: 'done' }),
      assistantMsg('a-stopped', '一半', { status: 'done', stopped: true }),
    ];
    const draft = findContinueDraft(msgs);
    expect(draft?.id).toBe('a-stopped');
  });

  it('18. 无草稿返回 null（全部正常完成 / 空列表）', () => {
    expect(findContinueDraft([])).toBeNull();
    expect(
      findContinueDraft([
        userMsg('u1', '问题'),
        assistantMsg('a1', '完整', { status: 'done' }),
      ]),
    ).toBeNull();
  });
});

describe('lastUserBefore: 草稿前最近提问', () => {
  it('19. 找到草稿前最近一条 user（贴纸不算提问）', () => {
    const msgs = [
      userMsg('u1', '问题一'),
      assistantMsg('a1', '答案一', { status: 'done' }),
      userMsg('u-sticker', '[贴纸·开心]', { kind: 'sticker', sticker: 'happy' }),
      assistantMsg('a2', '一半', { status: 'done', stopped: true }),
    ];
    const u = lastUserBefore(msgs, 'a2');
    expect(u?.id).toBe('u1');
    expect(u?.content).toBe('问题一');
  });

  it('20. draftId 不存在 / 前面没有 user → null', () => {
    expect(lastUserBefore([userMsg('u1', 'q')], 'ghost')).toBeNull();
    expect(
      lastUserBefore([assistantMsg('a1', '一半', { status: 'error' })], 'a1'),
    ).toBeNull();
  });
});

describe('excludeMessageIds + trimHistory: continue 请求体 history 不含草稿对', () => {
  it('21. 剔除草稿对后 trimHistory 不再包含草稿内容（防部分答案喂给 LLM）', () => {
    const msgs = [
      userMsg('u1', '报到带什么'),
      assistantMsg('a1', '完整答案', { status: 'done' }),
      userMsg('u2', '宿舍在几号楼'),
      assistantMsg('a2', '宿舍在……', { status: 'done', stopped: true }), // 草稿
    ];
    const draft = findContinueDraft(msgs)!;
    const userMsgOfDraft = lastUserBefore(msgs, draft.id)!;
    const history = trimHistory(excludeMessageIds(msgs, [draft.id, userMsgOfDraft.id]));
    const contents = history.map((h) => h.content);
    expect(contents).toContain('报到带什么');
    expect(contents).toContain('完整答案');
    expect(contents).not.toContain('宿舍在几号楼');
    expect(contents).not.toContain('宿舍在……');
  });

  it('22. ids 为空时返回原数组引用（普通发送路径零拷贝零影响）', () => {
    const msgs = [userMsg('u1', 'q'), assistantMsg('a1', 'a', { status: 'done' })];
    expect(excludeMessageIds(msgs, [])).toBe(msgs);
  });
});
