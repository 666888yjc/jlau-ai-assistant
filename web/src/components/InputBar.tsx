import { Icon } from './Icon';
import { Mascot } from './Mascot';

interface InputBarProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  loading?: boolean;
  placeholder?: string;
  /** P1 贴纸：点击展开贴纸面板。不传则按钮不渲染，P0 调用点行为完全不变 */
  onStickerClick?: () => void;
  /** 贴纸面板是否处于展开态（控制按钮高亮 + aria-pressed） */
  stickerOpen?: boolean;
}

/**
 * 输入栏。
 * 已删除语音输入按钮：后端无 ASR 通道，点了没反应——占位式「假功能」比少一个功能更伤信任。
 * 表面改为实色 + 发丝上边线（原毛玻璃 blur(24px) 在低端安卓上有明显掉帧）。
 */
export function InputBar({
  value,
  onChange,
  onSend,
  loading,
  placeholder,
  onStickerClick,
  stickerOpen,
}: InputBarProps) {
  const canSend = value.trim().length > 0 && !loading;
  const submit = () => {
    if (canSend) onSend();
  };
  // 不传 onStickerClick 时不渲染贴纸按钮 —— P0 调用点零改动即可编译
  const showSticker = typeof onStickerClick === 'function';

  return (
    <div className="input-bar">
      {showSticker && (
        <button
          type="button"
          className={`sticker-toggle${stickerOpen ? ' is-on' : ''}`}
          aria-label="贴纸"
          aria-pressed={stickerOpen ?? false}
          onClick={onStickerClick}
        >
          <Mascot size={20} expression="happy" />
        </button>
      )}
      <div className="input-pill">
        <input
          className="chat-input"
          value={value}
          /* 移动键盘渐进增强：普通文本键盘 + 回车键显示为「发送」。
             纯浏览器提示属性，不改 props 签名、不影响桌面端与既有调用点行为。 */
          inputMode="text"
          enterKeyHint="send"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder ?? '问问吉小农：图书馆几点关门？'}
          aria-label="输入你的问题"
        />
      </div>
      <button
        className="send-btn"
        type="button"
        onClick={submit}
        disabled={!canSend}
        aria-label="发送"
      >
        {loading ? (
          <Icon name="LoaderCircle" size="button" className="spin" />
        ) : (
          <Icon name="Send" size="button" />
        )}
      </button>
    </div>
  );
}
