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
  /**
   * 用户主动停止生成的回答（UX-1）。status 已置 'done'（不再流式），
   * 但内容是不完整的，用独立标记呈现「已停止」，不把标记写进 content——
   * 否则 trimHistory 会把「已停止」字样喂给 LLM。
   */
  stopped?: boolean;
}
