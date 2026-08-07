// API 契约类型（依据 openapi.yaml §5 / §components）。前后端唯一事实源。

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  scenario_id: string;
  message: string;
  history: ChatMessage[];
  conversation_id: string;
  /**
   * 幂等键（API-1）。首发与全部重试复用同一个值，服务端 idempotency 中间件
   * 据此保证 LLM 只被真正调用一次。同时经 X-Request-Id 头透传。
   */
  request_id?: string;
}

export interface SourceItem {
  title: string;
  url: string;
  updated_at: string;
}

export interface FallbackContact {
  name: string;
  phone: string;
}

// ---- SSE 事件载荷 ----
export interface TokenEvent {
  type: 'token';
  content: string;
}
export interface SourcesEvent {
  type: 'sources';
  items: SourceItem[];
}
export interface FallbackEvent {
  type: 'fallback';
  guesses: string[];
  contact: FallbackContact;
}
export interface DoneEvent {
  type: 'done';
  conversation_id: string;
  message_id: string;
  finish_reason: 'stop' | 'no_answer';
}
export interface ErrorEvent {
  type: 'error';
  code: number;
  message: string;
}
export type SSEEvent = TokenEvent | SourcesEvent | FallbackEvent | DoneEvent | ErrorEvent;

// ---- 轻量 JSON 端点 ----
export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

export interface ScenarioItem {
  id: string;
  name: string;
  icon: string;
  lucide_icon: string;
}

export interface FeatureItem {
  id: string;
  text: string;
  scenario_id: string;
}

export interface FeedbackRequest {
  message_id: string;
  type: 'helpful' | 'reported';
  note?: string;
  /**
   * A-2 问答快照（仅「报错」携带；「有帮助」不带）。
   * question ≤ 2000 字符、answer ≤ 20000 字符（前端提交前截断，服务端防御校验）。
   */
  snapshot?: { question: string; answer: string };
}

// ---- 反馈管理后台（方案 A，A-1~A-4）----

/** 管理员会话令牌（av1.<exp>.<nonce>.<hmac>）。 */
export interface AdminLoginResult {
  token: string;
  expires_at: number;
}

/** 管理端反馈列表项（两 store 同构，必含 _id）。 */
export interface AdminFeedbackItem {
  _id: string;
  message_id: string;
  type: 'helpful' | 'reported';
  note: string | null;
  scenario_id: string;
  created_at: string;
  /** 旧记录天然缺失（升级前数据） */
  snapshot?: { question: string; answer: string } | null;
}

export interface AdminFeedbackListResult {
  items: AdminFeedbackItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminFeedbackListParams {
  type?: 'helpful' | 'reported';
  scenario_id?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminKbRefreshResult {
  cleared: boolean;
  doc_count: number;
}

export interface HumanHandoffRequest {
  scenario_id: string;
  question: string;
  contact?: string;
}
