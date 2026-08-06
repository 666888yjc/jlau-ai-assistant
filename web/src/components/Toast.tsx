import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="toast" role="status">
      <Icon name="CheckCircle" size="inline" />
      <span>{children}</span>
    </div>
  );
}

/** Toast 自动消失时长 */
export const TOAST_DURATION_MS = 2400;

export interface ToastController {
  /** 直接塞进页面 JSX 尾部；无消息时为 null */
  toastNode: ReactNode;
  /** 弹出一条提示，TOAST_DURATION_MS 后自动消失 */
  showToast: (msg: string) => void;
}

/**
 * 极小的页面级 Toast hook —— 不引入 Context、不引入新依赖。
 * 连续调用会重置计时器，只展示最后一条。
 */
export function useToast(): ToastController {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (msg: string) => {
      if (typeof msg !== 'string' || msg.length === 0) return;
      clearTimer();
      setMessage(msg);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setMessage(null);
      }, TOAST_DURATION_MS);
    },
    [clearTimer],
  );

  // 卸载时清理 timer，避免 setState-on-unmounted 警告
  useEffect(() => clearTimer, [clearTimer]);

  return {
    toastNode: message === null ? null : <Toast>{message}</Toast>,
    showToast,
  };
}
