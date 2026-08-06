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
}

export interface HumanHandoffRequest {
  scenario_id: string;
  question: string;
  contact?: string;
}
