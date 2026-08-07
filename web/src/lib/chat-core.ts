/**
 * chat-core.ts —— 会话状态机纯函数层（B5 T07，UX-8/API-6 逻辑层 + 打磨点 4.1/4.2）
 *
 * ## 为什么抽成纯函数
 * B5 之前 reducer 内嵌在 useChatStream.ts，语义只能靠走查，无法单测锁死。
 * 抽成本模块后：`chatReducer` / `findContinueDraft` / `lastUserBefore` /
 * `excludeMessageIds` 全部零副作用、零 React 依赖，可被 vitest 直接覆盖，
 * 把「SEND 保留连击 / CLEAR_ERROR 保留 / RESET 清零 / ABORT 直落」等评审关注点
 * 变成可验证的硬语义。
 *
 * ## 状态机勘误（B5 起生效，架构 §4.1）
 *   - ChatPhase 无 'aborting' 相位（死分支，已删除）；
 *   - ABORT 直接落 stopped（user）/ failed（ttfb/idle-timeout）/ idle（防御性 silent）；
 *   - CLEAR_ERROR 保留 consecutiveFailures（修复 clearError 清零连击的缺陷）；
 *   - RESET 清零连击（仅场景切换路径使用）。
 *
 * ## 草稿约定（B5，架构 §2.2）
 *   status==='error' 或 stopped===true 且 content 非空的 assistant 气泡 = 草稿；
 *   continue 时草稿对（草稿气泡 + 其前一条 user）不进 history。
 */

import type { UIMessage } from '../types/chat';
import {
  INITIAL_CHAT_STATE,
  SILENT_ABORT_REASONS,
  type ChatAction,
  type ChatState,
} from '../types/chat-state';
import { isTerminalFailure } from './errors';

/**
 * 状态机 reducer（架构 §4.1 ChatAction 全量实现）。
 *
 * 语义对照表（B5 定稿）：
 * | action        | 相位       | consecutiveFailures | 说明 |
 * |---------------|-----------|---------------------|------|
 * | SEND          | sending   | 保留                | 跨轮累积（UX-4） |
 * | FIRST_TOKEN   | streaming | 保留                | |
 * | ABORT(user)   | stopped   | 保留                | 用户停止不计失败 |
 * | ABORT(ttfb/idle) | failed | 保留                | 由 FAIL 计入 |
 * | ABORT(silent) | idle      | 保留                | 防御性，正常路径不 dispatch |
 * | FAIL          | classified| +1（仅终态失败）     | isTerminalFailure 判定 |
 * | DONE          | done      | 清零                | 成功打断连击 |
 * | CLEAR_ERROR   | idle      | 保留                | B5 修复：换问法不重置连击 |
 * | RESET         | idle      | 清零                | 仅场景切换 |
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SEND':
      // 保留 consecutiveFailures（UX-4 连击跨轮累积）与 degradedFrames（每轮清零）
      return {
        ...state,
        phase: 'sending',
        requestId: action.requestId,
        retryCount: 0,
        abortReason: null,
        error: null,
        ttfbMs: null,
        degradedFrames: 0,
      };
    case 'FIRST_TOKEN':
      return { ...state, phase: 'streaming', ttfbMs: action.ttfbMs };
    case 'ABORT':
      if (action.reason === 'user') {
        return { ...state, phase: 'stopped', abortReason: action.reason };
      }
      if (SILENT_ABORT_REASONS.includes(action.reason)) {
        // 卸载/场景切换：静默回 idle，不留错误痕迹。
        // ⚠️ 防御性分支 —— 正常路径 catch 对 silent 原因不 dispatch（见 useChatStream），
        // 保留它只是为了让 reducer 对任意合法 action 都有确定输出（可单测性）。
        return { ...state, phase: 'idle', abortReason: action.reason, requestId: null };
      }
      return { ...state, phase: 'failed', abortReason: action.reason };
    case 'FAIL':
      return {
        ...state,
        phase: 'classified',
        error: action.error,
        // 只有「终态失败」才计入连击；用户主动停止不计入（isTerminalFailure）
        consecutiveFailures:
          state.consecutiveFailures + (isTerminalFailure(action.error) ? 1 : 0),
        abortReason: null,
      };
    case 'RETRY':
      return { ...state, phase: 'retrying', retryCount: state.retryCount + 1, error: null };
    case 'DONE':
      // 成功会打断「连续失败」连击
      return { ...state, phase: 'done', error: null, consecutiveFailures: 0 };
    case 'DEGRADED_FRAME':
      return { ...state, degradedFrames: state.degradedFrames + 1 };
    case 'CLEAR_ERROR':
      // B5 修复：仅清错误态，consecutiveFailures 保留 —— 与 SEND 语义一致。
      // 这样「1 败 + 换个问法 + 1 败」仍能触发 UX-4 人工兜底卡（架构 §4.2）。
      return { ...INITIAL_CHAT_STATE, consecutiveFailures: state.consecutiveFailures };
    case 'RESET':
      return { ...INITIAL_CHAT_STATE };
  }
}

/**
 * 查找「继续生成」的草稿气泡（尾扫，最后一条优先）。
 *
 * 草稿定义（架构 §2.2）：assistant 且 content 非空 且 (status==='error' 或 stopped===true)。
 * 注意：stopped 草稿的 status 是 'done'（handleUserStop 置 done+stopped），
 * 因此不能只看 status，必须显式检查 stopped 标记。
 */
export function findContinueDraft(msgs: readonly UIMessage[]): UIMessage | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== 'assistant') continue;
    if (m.content === '') continue;
    if (m.status === 'error' || m.stopped === true) return m;
  }
  return null;
}

/**
 * 草稿气泡前最近一条 user 提问（贴纸不算提问，架构 §2.6 约定 4）。
 * 找不到返回 null。
 */
export function lastUserBefore(msgs: readonly UIMessage[], draftId: string): UIMessage | null {
  const idx = msgs.findIndex((m) => m.id === draftId);
  if (idx === -1) return null;
  for (let i = idx - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === 'user' && m.kind !== 'sticker') return m;
  }
  return null;
}

/**
 * 从消息列表剔除指定 id（continue 时草稿对不进 history，架构 §2.4 注②）。
 * ids 为空时返回原数组引用（零拷贝，普通发送路径零影响）。
 */
export function excludeMessageIds(
  msgs: readonly UIMessage[],
  ids: readonly string[],
): UIMessage[] {
  if (!ids || ids.length === 0) return msgs as UIMessage[];
  const exclude = new Set(ids);
  return msgs.filter((m) => !exclude.has(m.id));
}
