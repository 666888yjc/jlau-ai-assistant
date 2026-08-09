/**
 * useScrollFollow（UX-2 / 风险 R3）。
 *
 * ## 目标
 * 「上翻不跳底、贴底才跟随、有新内容给浮标」。
 *
 * ## 核心不变量
 * **`pinned` 只由用户意图写入**：
 *  - 用户在列表上滚动到 gap≤60px → 回到底部（pinned=true）；
 *  - 用户主动上翻 gap>60px → 脱离跟随（pinned=false）；
 *  - 点浮标 / 发新消息 → 显式回底（pinned=true）。
 * 渲染过程（token 追加、rAF flush、键盘 resize 触发的 scroll）**只读**，
 * 不写 pinned —— 否则每来一个 token 都会把「用户已上翻」的意图吞掉。
 *
 * ## 键盘抑制（R3）
 * `suppressUntilRef` 由 useVisualViewport 在每次 resize 时拨到 300ms 之后。
 * 抑制窗口内 onScroll 直接 return：键盘高度变化触发的 scroll 不会被误判为
 * 「用户上翻脱离」。窗口过后，若用户确实在键盘上方滚动，会正常生效。
 *
 * ## 跟随策略
 * gap（距底部距离）≤ 60px 即视为贴底，保持跟随；只有 gap > 60px 才认为用户脱离。
 * 这样「最后一条消息差半屏」时不会被误判成上翻。
 *
 * ## 初始贴底保护（修复「打开停在对话中间」）
 * 历史消息首帧渲染时，`.msg-row` 的 `content-visibility:auto`（PERF-6）会让屏幕外
 * 行的布局被跳过，`scrollHeight` 按 `contain-intrinsic-size` 的**估算值**（120px）计算；
 * 长会话下估算总高远小于真实总高，单次 `follow()` 的 `scrollToBottom()` 会停在
 * 「估算底部」——也就是对话中间。修复：
 *  - `scrollToBottomInitial()`：在首帧绘制前临时关闭跳过布局（给容器加
 *    `chat-settle` 类，CSS 把 `.msg-row` 设为 `content-visibility: visible`），
 *    量到**真实** scrollHeight 后滚到底部，再移除该类（行已记住真实尺寸，
 *    `contain-intrinsic-size:auto` 记忆生效，滚动位置不回弹）；
 *  - `initialGuardRef`：初始保护期内 `onScroll` 只读不写 pinned —— 首帧的程序化
 *    滚动 / 可能存在的浏览器滚动恢复产生的 scroll 事件，不会被误判为「用户上翻」。
 *    保护期在 `scrollToBottomInitial()` 完成时解除，另有 1.5s 兜底定时器防泄漏。
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';

/** 判贴底的距底距离（px）。架构 §6 T04 验收②：gap≤60px 才跟随。 */
export const FOLLOW_GAP_PX = 60;

/** 初始贴底沉降用的容器类（配合 global.css 的 `.chat-settle .msg-row` 规则）。 */
export const SETTLE_CLASS = 'chat-settle';

/** 初始保护兜底时长（ms）：调用方漏调 scrollToBottomInitial 时自动解除保护，防止 UX-2 上翻失效。 */
export const INITIAL_GUARD_FALLBACK_MS = 1500;

export interface UseScrollFollowOptions {
  listRef: RefObject<HTMLElement>;
  /** useVisualViewport 暴露的抑制截止时间戳 ref */
  suppressUntilRef: MutableRefObject<number>;
  /** 判贴底阈值，默认 60px */
  followGapPx?: number;
}

export interface UseScrollFollowResult {
  /** 是否跟随底部（仅用户意图写入） */
  pinned: boolean;
  /** 有新内容（用户上翻后新消息到达）→ 展示浮标 */
  hasNewContent: boolean;
  /** 立即滚到底（浮标点击 / 发送后调用） */
  scrollToBottom: () => void;
  /**
   * 首次内容就绪后调用一次：强制滚到真实底部（无视抑制窗口），
   * 并解除初始 onScroll 保护。修复「打开停在对话中间」。
   */
  scrollToBottomInitial: () => void;
  /** 内容变化后调用：pinned 时跟随，否则检测新内容 */
  follow: () => void;
}

export function useScrollFollow({
  listRef,
  suppressUntilRef,
  followGapPx = FOLLOW_GAP_PX,
}: UseScrollFollowOptions): UseScrollFollowResult {
  const [pinned, setPinnedState] = useState(true);
  const [hasNewContent, setHasNewContentState] = useState(false);
  const pinnedRef = useRef(true);
  const hasNewRef = useRef(false);
  const followGapRef = useRef(followGapPx);
  followGapRef.current = followGapPx;

  const setPinned = useCallback((v: boolean) => {
    if (pinnedRef.current === v) return;
    pinnedRef.current = v;
    setPinnedState(v);
  }, []);

  const setHasNew = useCallback((v: boolean) => {
    if (hasNewRef.current === v) return;
    hasNewRef.current = v;
    setHasNewContentState(v);
  }, []);

  /** 距底部距离；容器不可用时返回 0（视为贴底，避免误报新内容） */
  const gapToBottom = useCallback((): number => {
    const el = listRef.current;
    if (!el) return 0;
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  }, [listRef]);

  /**
   * 初始保护期标记。首次内容稳定（scrollToBottomInitial 完成）前，
   * onScroll 只读不写 pinned —— 首帧程序化滚动 / 浏览器滚动恢复触发的
   * scroll 事件不得被误判为「用户上翻」（修复「打开停在对话中间」）。
   */
  const initialGuardRef = useRef(true);
  const initialGuardTimerRef = useRef<number | null>(null);

  /** 解除初始保护（幂等）。 */
  const releaseInitialGuard = useCallback(() => {
    initialGuardRef.current = false;
    if (initialGuardTimerRef.current !== null) {
      window.clearTimeout(initialGuardTimerRef.current);
      initialGuardTimerRef.current = null;
    }
  }, []);

  // 兜底：若调用方漏调 scrollToBottomInitial，1.5s 后自动解除保护，
  // 保证「用户上翻 → 脱离跟随」的既有行为（UX-2）永不被保护期卡死。
  useEffect(() => {
    initialGuardTimerRef.current = window.setTimeout(releaseInitialGuard, INITIAL_GUARD_FALLBACK_MS);
    return () => {
      if (initialGuardTimerRef.current !== null) {
        window.clearTimeout(initialGuardTimerRef.current);
        initialGuardTimerRef.current = null;
      }
    };
  }, [releaseInitialGuard]);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    // 直接改 scrollTop（同步），比 scrollTo({behavior:'smooth'}) 更可控：
    // 不产生动画帧期间的中间 scroll 事件，避免与 onScroll 互相干扰。
    el.scrollTop = el.scrollHeight;
    // 程序化回底 = 明确的用户意图（点浮标/发消息），把跟随状态钉回底部。
    setPinned(true);
    setHasNew(false);
  }, [listRef, setPinned, setHasNew]);

  /**
   * 首次内容就绪后调用：强制滚到**真实**底部，并解除初始保护。
   *
   * 为什么不能只靠 follow()/scrollToBottom()：首帧渲染时 `.msg-row` 的
   * content-visibility:auto 让 scrollHeight 是估算值（PERF-6 的
   * contain-intrinsic-size 120px），单次 scrollTop = scrollHeight 只会到
   * 「估算底部」（对话中间）。本方法临时关闭跳过布局量到真实总高后滚底。
   *
   * 无视 suppressUntilRef（R3 抑制窗口针对键盘 resize 的滚动，与首屏贴底无关）。
   */
  const scrollToBottomInitial = useCallback(() => {
    const el = listRef.current;
    if (!el) {
      // 容器暂不可用（如首帧未渲染）：保护期交给兜底定时器解除，不做别的。
      releaseInitialGuard();
      return;
    }
    // ① 临时关闭 content-visibility 跳过布局 → 读 scrollHeight 强制真实布局
    el.classList.add(SETTLE_CLASS);
    el.scrollTop = el.scrollHeight; // 此刻 scrollHeight 是真实总高，直接落底
    // ② 恢复跳过布局；行已渲染过，contain-intrinsic-size:auto 记住真实尺寸，
    //    滚动位置不会回弹
    el.classList.remove(SETTLE_CLASS);
    // ③ 移除类后再量一次并重设，覆盖移除类后可能的重排差异（双保险）
    el.scrollTop = el.scrollHeight;
    setPinned(true);
    setHasNew(false);
    releaseInitialGuard();
  }, [listRef, releaseInitialGuard, setHasNew, setPinned]);

  /** 用户滚动（真实滚动事件）。键盘抑制期 / 初始保护期内只读。 */
  const onScroll = useCallback(() => {
    if (Date.now() < suppressUntilRef.current) return; // R3：抑制窗口只读
    if (initialGuardRef.current) return; // 初始保护：首帧滚动不写 pinned
    const gap = gapToBottom();
    if (gap <= followGapRef.current) {
      // 贴底：回到跟随，清掉新内容标记
      setPinned(true);
      setHasNew(false);
    } else if (pinnedRef.current) {
      // 用户上翻：脱离跟随
      setPinned(false);
    }
  }, [gapToBottom, setHasNew, setPinned, suppressUntilRef]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [listRef, onScroll]);

  /** 内容变化后调用：pinned → 跟随；脱离 → 检测新内容并亮浮标 */
  const follow = useCallback(() => {
    if (Date.now() < suppressUntilRef.current) return; // R3：抑制窗口不移动
    if (!pinnedRef.current) {
      if (gapToBottom() > followGapRef.current) setHasNew(true);
      return;
    }
    scrollToBottom();
  }, [gapToBottom, scrollToBottom, setHasNew, suppressUntilRef]);

  return { pinned, hasNewContent, scrollToBottom, scrollToBottomInitial, follow };
}
