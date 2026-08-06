import type { FallbackContact, SourceItem } from './api';
import type { MascotExpression } from '../components/Mascot';

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceItem[];
  guesses?: string[];
  contact?: FallbackContact;
  status: 'streaming' | 'done' | 'error';
  messageId?: string;
  feedback?: 'helpful' | 'reported' | null;
  /**
   * 消息类型。
   * - 'text'   普通文本（缺省值，保证旧会话向后兼容）
   * - 'sticker' 吉祥物贴纸（P1）
   * @see 架构 §2.6
   */
  kind?: 'text' | 'sticker';
  /** kind==='sticker' 时有效，必须是 MascotExpression 之一；
   *  从 localStorage 恢复时非法值会降级为 'text'（架构 §2.6 约定 3） */
  sticker?: MascotExpression;
}
