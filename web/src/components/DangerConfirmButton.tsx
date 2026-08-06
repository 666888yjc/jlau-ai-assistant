// 就地二次确认按钮。
// 交互：第一次点击进入「确认态」（文案变为确认语），3 秒内无操作自动复位；
//       第二次点击才真正执行 onConfirm。
// 相比 window.confirm 的优势：不打断页面上下文、样式可控、移动端不弹系统弹窗。
//
// 硬约束：卸载时必须清 timer，避免 setState-on-unmounted 警告。

import { useCallback, useEffect, useRef, useState } from 'react';

/** 确认态自动复位时长 */
export const DANGER_CONFIRM_RESET_MS = 3000;

interface DangerConfirmButtonProps {
  /** 常态文案，如「清除」 */
  label: string;
  /** 确认态文案，如「确定清除？」 */
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** 追加的类名，如 'btn-quiet' */
  className?: string;
}

export function DangerConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled = false,
  className,
}: DangerConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 卸载时清理 timer
  useEffect(() => clearTimer, [clearTimer]);

  // 变为可用/禁用切换时退出确认态，避免停留在危险文案上
  useEffect(() => {
    if (disabled && confirming) {
      clearTimer();
      setConfirming(false);
    }
  }, [disabled, confirming, clearTimer]);

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (confirming) {
      clearTimer();
      setConfirming(false);
      onConfirm();
      return;
    }
    setConfirming(true);
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setConfirming(false);
    }, DANGER_CONFIRM_RESET_MS);
  }, [confirming, disabled, clearTimer, onConfirm]);

  const classes = ['danger-btn'];
  if (confirming) classes.push('confirming');
  if (className) classes.push(className);

  return (
    <button type="button" className={classes.join(' ')} disabled={disabled} onClick={handleClick}>
      {confirming ? confirmLabel : label}
    </button>
  );
}
