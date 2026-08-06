// 会话状态机类型（PRD §7.1 / 架构 §4.1）。
//
// 纯类型模块：编译后不产生任何运行时代码，因此与 lib/errors.ts 之间的相互引用
// 是「类型层循环」而非运行时循环 —— 两侧一律用 `import type`，TS 会完全擦除。
// tsconfig 开了 isolatedModules，写成 `import type` 也是硬性要求。

import type { ClassifiedError } from '../lib/errors';

/** 会话相位。严格对应 PRD §7.1 状态机 */
export type ChatPhase =
  | 'idle' // 空闲，可发送
  | 'sending' // 已发出，等首 token（TTFB 计时中）
  | 'streaming' // 首 token 已达，流式中（空闲计时中）
  | 'aborting' // 中止进行中（三源之一已触发 abort）
  | 'stopped' // 已停止，保留已生成内容
  | 'failed' // 失败，待分类
  | 'retrying' // 退避等待中，将复用同一 request_id
  | 'classified' // 已分级，展示分级文案与按钮
  | 'handoff' // 连续 2 次终态失败，展示人工兜底
  | 'done'; // 正常完成

/**
 * 中止原因。三个中止源共用一个 AbortController，仅本字段不同 —— PRD 核心设计。
 *
 * ⚠️ 时序不变量（架构 §5.2 / 风险 R4）：必须先写 abortReasonRef 再调 abort()，
 * 否则 catch 块读到 stale 值，用户点「停止」却弹出错误卡。
 */
export type AbortReason =
  | 'user' // 用户点「停止生成」(UX-1)
  | 'ttfb-timeout' // 首 token 超时 15s (ERR-1)
  | 'idle-timeout' // 首 token 后空闲 30s (ERR-1)
  | 'unmount' // 组件卸载
  | 'scenario-change'; // 场景切换 (ERR-6)

/** 用户主动中止与组件生命周期中止不应弹错误卡，只有超时类才走分级。 */
export const SILENT_ABORT_REASONS: readonly AbortReason[] = ['unmount', 'scenario-change'];

export interface ChatState {
  phase: ChatPhase;
  /** 当前轮的幂等键，重试时复用 (API-1) */
  requestId: string | null;
  /** 本轮已重试次数，上限 2 (ERR-2) */
  retryCount: number;
  /** 终态失败连击数，达 2 触发 handoff (UX-4) */
  consecutiveFailures: number;
  abortReason: AbortReason | null;
  error: ClassifiedError | null;
  /** 本轮首 token 耗时，埋点用 (MAINT-1) */
  ttfbMs: number | null;
  /** SSE 解析失败帧计数，>0 时会话末提示「内容可能不完整」(ERR-3) */
  degradedFrames: number;
}

export type ChatAction =
  | { type: 'SEND'; requestId: string }
  | { type: 'FIRST_TOKEN'; ttfbMs: number }
  | { type: 'ABORT'; reason: AbortReason }
  | { type: 'FAIL'; error: ClassifiedError }
  | { type: 'RETRY' }
  | { type: 'DONE' }
  | { type: 'DEGRADED_FRAME' }
  | { type: 'RESET' };

/** 状态机初值。T04 的 useChatStream 以此为 useReducer 初始状态。 */
export const INITIAL_CHAT_STATE: ChatState = {
  phase: 'idle',
  requestId: null,
  retryCount: 0,
  consecutiveFailures: 0,
  abortReason: null,
  error: null,
  ttfbMs: null,
  degradedFrames: 0,
};
