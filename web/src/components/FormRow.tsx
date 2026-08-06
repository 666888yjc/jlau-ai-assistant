// 发丝线表单行 + 药丸单选组。
// 只被 /profile 消费，但拆成独立文件是因为 PillRadio 后续会被筛选类页面复用。

import { useId } from 'react';
import type { ReactNode } from 'react';

interface FormRowProps {
  label: string;
  /** 表单控件；传入 htmlFor 时会与 label 关联 */
  children: ReactNode;
  /** 与内部输入框的 id 关联；不传则 label 仅作视觉标签 */
  htmlFor?: string;
}

export function FormRow({ label, children, htmlFor }: FormRowProps) {
  return (
    <div className="form-row">
      {htmlFor ? (
        <label className="form-row-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="form-row-label">{label}</span>
      )}
      <div className="form-row-field">{children}</div>
    </div>
  );
}

interface PillRadioProps<T extends string> {
  options: readonly T[];
  value: T | '';
  onChange: (next: T) => void;
  /** 整组的无障碍名称，如「年级」 */
  groupLabel: string;
}

/**
 * 药丸单选组。
 * 用 role="radiogroup" + role="radio" 而非原生 input，
 * 以便完全掌控视觉；键盘可达性由原生 button 的 Space/Enter 保证。
 */
export function PillRadio<T extends string>({
  options,
  value,
  onChange,
  groupLabel,
}: PillRadioProps<T>) {
  const groupId = useId();

  return (
    <div className="pill-radio" role="radiogroup" aria-label={groupLabel}>
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <button
            key={`${groupId}-${opt}`}
            type="button"
            role="radio"
            aria-checked={selected}
            className={selected ? 'pill-radio-item is-on' : 'pill-radio-item'}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
