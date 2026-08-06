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

export interface FeedbackRecord {
  _id?: string;
  message_id: string;
  type: FeedbackType;
  note: string | null;
  scenario_id: string;
  created_at: string;
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
}
