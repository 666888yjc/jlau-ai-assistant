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
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';

/** 判贴底的距底距离（px）。架构 §6 T04 验收②：gap≤60px 才跟随。 */
export const FOLLOW_GAP_PX = 60;

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

  /** 用户滚动（真实滚动事件）。键盘抑制期内只读。 */
  const onScroll = useCallback(() => {
    if (Date.now() < suppressUntilRef.current) return; // R3：抑制窗口只读
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

  return { pinned, hasNewContent, scrollToBottom, follow };
}
