// 开关控件。
// 无障碍：原生 <button> + role="switch" + aria-checked，Tab 可聚焦、Space/Enter 可切换
// （原生 button 默认就响应 Space/Enter，无需手写 onKeyDown）。
// 视觉：轨道 44×24、滑块 20px，开态 --accent 实色，全部走 global.css 的 .switch 类。

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** 屏幕阅读器朗读的名称，如「校历作息」 */
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={checked ? 'switch on' : 'switch'}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  );
}
