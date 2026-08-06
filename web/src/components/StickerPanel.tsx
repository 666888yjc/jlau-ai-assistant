import { Mascot, MASCOT_EXPRESSIONS, type MascotExpression } from './Mascot';

/** 贴纸面板可选项：复用吉祥物全部 6 种姿态，零新增图标（架构 §6.5） */
export const STICKERS: readonly MascotExpression[] = MASCOT_EXPRESSIONS;

/** 各姿态的语音标签，用于贴纸气泡的 aria-label 与可读回退文案 */
export const STICKER_LABELS: Record<MascotExpression, string> = {
  calm: '平静',
  happy: '开心',
  think: '思考',
  cheer: '加油',
  eat: '干饭',
  sleep: '睡了',
};

interface StickerPanelProps {
  /** 选中某姿态：回调给 ChatPage 落盘（本组件不碰会话状态） */
  onPick: (expression: MascotExpression) => void;
  /** 点选后是否收起面板（由 ChatPage 控制开关态） */
  onClose?: () => void;
}

/**
 * 吉祥物贴纸面板。
 * 6 列网格、每格 48×48 触控区；全部 currentColor，深浅模式自动跟随。
 * 渲染层之外的任何副作用（写会话 / 持久化）都不在本组件内发生。
 */
export function StickerPanel({ onPick, onClose }: StickerPanelProps) {
  return (
    <div className="sticker-panel" role="group" aria-label="选择一张吉祥物贴纸">
      {STICKERS.map((expr) => (
        <button
          key={expr}
          type="button"
          className="sticker-item"
          aria-label={STICKER_LABELS[expr]}
          onClick={() => {
            onPick(expr);
            onClose?.();
          }}
        >
          <Mascot size={48} expression={expr} />
        </button>
      ))}
    </div>
  );
}
