/**
 * useVisualViewport（MOB-1 / 风险 R3）。
 *
 * ## 解决的问题
 * 移动端键盘弹起时，`100dvh`（布局视口高度）**不收缩**（尤其 iOS Safari），
 * 输入栏会被键盘顶出可视区 —— 这是「键盘遮挡输入框与最后几条消息」的真实根因。
 *
 * ## 做法
 * 监听 `window.visualViewport` 的 resize/scroll（键盘弹起/收起会触发），把
 * 实测的可视高度写入 CSS 变量：
 *   `--vvh`      = visualViewport.height（px）→ 消费方：.app-shell 高度
 *   `--kb-inset` = innerHeight - visualViewport.height（px）→ 消费方：
 *                  .app-shell 在无 visualViewport 时的 dvh 回退近似值
 * 无 visualViewport（老 webview / 桌面）时保持 dvh 原状，零回归。
 *
 * ## 风险 R3（键盘 × 滚动咬合）
 * 键盘高度变化会让浏览器**主动触发一次 scroll**，而这个滚动与「用户上翻」无法从
 * scroll 事件本身区分。因此每次 resize 都会把 `suppressUntilRef` 拨到 300ms 之后，
 * 期间 useScrollFollow 对 pinned **只读不写** —— 键盘变化不会被误判为用户脱离底部。
 */

import { useEffect, useRef, useState } from 'react';

/** 键盘高度变化后的抑制窗口（毫秒）。期间滚动跟随状态只读。 */
export const KEYBOARD_SUPPRESS_MS = 300;

export interface VisualViewportApi {
  /** 键盘占位高度（px）。桌面端恒为 0。 */
  kbInset: number;
  /** visualViewport 高度（px）。无支持时为 0（消费方走 dvh 回退）。 */
  vvh: number;
  /**
   * 抑制截止时间戳（ms）。resize 触发时拨到 Date.now()+300。
   * useScrollFollow 通过它判断当前是否处于键盘抑制期。
   */
  suppressUntilRef: React.MutableRefObject<number>;
}

export function useVisualViewport(): VisualViewportApi {
  const suppressUntilRef = useRef<number>(0);
  const [kbInset, setKbInset] = useState(0);
  const [vvh, setVvh] = useState(0);

  useEffect(() => {
    const docEl = document.documentElement;
    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;

    const apply = (): void => {
      let inset = 0;
      let height = 0;
      if (vv) {
        height = Math.round(vv.height);
        inset = Math.max(0, Math.round(window.innerHeight - vv.height));
      } else {
        // 无 visualViewport：退化为窗口高度（--vvh 保持 0 语义，CSS 走 dvh）
        height = 0;
        inset = 0;
      }
      docEl.style.setProperty('--vvh', height > 0 ? `${height}px` : '');
      docEl.style.setProperty('--kb-inset', `${inset}px`);
      setKbInset(inset);
      setVvh(height);
    };

    const onResize = (): void => {
      // R3：任何 resize（含键盘）都触发抑制窗口，让滚动 hook 在此窗口内只读
      suppressUntilRef.current = Date.now() + KEYBOARD_SUPPRESS_MS;
      apply();
    };

    apply();

    if (vv) {
      vv.addEventListener('resize', onResize);
      vv.addEventListener('scroll', onResize);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', onResize);
        vv.removeEventListener('scroll', onResize);
      }
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return { kbInset, vvh, suppressUntilRef };
}
