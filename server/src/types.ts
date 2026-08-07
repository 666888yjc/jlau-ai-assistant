/** 薄壳侧数据集合类型（对齐 db-schema.md §1-§4）。 */

export interface Scenario {
  _id?: string;
  id: string;
  name: string;
  lucide_icon_name: string;
  icon: string;
  kb_ref: string;
  sort: number;
  enabled: boolean;
  created_at: string;
}

export interface Feature {
  _id?: string;
  scenario_id: string;
  text: string;
  sort: number;
}

export type FeedbackType = 'helpful' | 'reported';
export type HandoffStatus = 'pending' | 'contacted' | 'resolved';

/**
 * 反馈问答快照（方案 A A-2）。
 * 前端在提交「报错」时携带：被反馈的 AI 回答 + 其前一条用户提问。
 * 服务端只做防御性校验与落库，不依赖快照做任何检索/聚合。
 * 旧记录天然缺失该字段（字段可选，免迁移）。
 */
export interface FeedbackSnapshot {
  /** 用户提问，≤2000 字符（服务端防御校验） */
  question: string;
  /** AI 回答，≤20000 字符 */
  answer: string;
}

export interface FeedbackRecord {
  _id?: string;
  message_id: string;
  type: FeedbackType;
  note: string | null;
  scenario_id: string;
  created_at: string;
  /** 新增可选；旧记录天然缺失（A-2 向后兼容） */
  snapshot?: FeedbackSnapshot | null;
}

export interface HandoffRecord {
  _id?: string;
  scenario_id: string;
  question: string;
  contact: string | null;
  status: HandoffStatus;
  created_at: string;
}

export interface CreateFeedbackInput {
  message_id: string;
  type: FeedbackType;
  note: string | null;
  scenario_id: string;
  /** 新增可选；不传时旧路径逐字节不变（A-2 免迁移） */
  snapshot?: FeedbackSnapshot | null;
}

/** A-1/A-5/A-6/A-7 反馈列表查询参数（管理端）。 */
export interface FeedbackFilter {
  type?: FeedbackType;
  scenario_id?: string;
  /** note 模糊匹配（不区分大小写，仅 note 字段） */
  q?: string;
  /** 1-based，默认 1 */
  page?: number;
  /** 默认 20 */
  pageSize?: number;
}

/** A-1 反馈列表结果。items 含 `_id`，两 store 同构（AC-A1.5）。 */
export interface FeedbackListResult {
  items: FeedbackRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateHandoffInput {
  scenario_id: string;
  question: string;
  contact: string | null;
}

/** 数据存储抽象：本地 JSON / 内存 / CloudBase 文档库共用同一接口。 */
export interface Store {
  listScenarios(enabledOnly?: boolean): Promise<Scenario[]>;
  getScenario(id: string): Promise<Scenario | null>;
  listFeatures(scenarioId?: string): Promise<Feature[]>;
  createFeedback(input: CreateFeedbackInput): Promise<FeedbackRecord>;
  createHandoff(input: CreateHandoffInput): Promise<HandoffRecord>;
  /** A-1 管理端反馈列表（含 _id，两 store 同构）。 */
  listFeedback(filter?: FeedbackFilter): Promise<FeedbackListResult>;
}
