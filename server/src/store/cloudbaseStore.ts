import type {
  CreateFeedbackInput,
  CreateHandoffInput,
  Feature,
  FeedbackRecord,
  HandoffRecord,
  Scenario,
  Store,
} from '../types';
import { newFeedbackId, newHandoffId } from '../utils/id';

/**
 * CloudBase 文档库存储实现（部署形态）。
 * 通过 tcb-admin-node 访问云函数配套文档数据库，集合结构对齐 db-schema.md。
 * 本实现仅在 STORE_KIND=cloudbase 时由 getStore() 动态加载，本地验证默认走 JsonStore。
 */
export class CloudBaseStore implements Store {
  private db: any;

  async init(): Promise<void> {
    // 动态加载，避免本地无依赖时启动失败
    const tcb = await import('tcb-admin-node');
    this.db = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV }).database();
    await this.ensureIndexes().catch(() => undefined);
  }

  private async ensureIndexes(): Promise<void> {
    const scenarios = this.db.collection('scenarios');
    await scenarios.createIndex({ id: 1 }, { unique: true }).catch(() => undefined);
    await scenarios.createIndex({ sort: 1 }).catch(() => undefined);
    await scenarios.createIndex({ enabled: 1 }).catch(() => undefined);

    const feedback = this.db.collection('feedback');
    await feedback.createIndex({ scenario_id: 1 }).catch(() => undefined);
    await feedback.createIndex({ created_at: 1 }).catch(() => undefined);
    await feedback.createIndex({ scenario_id: 1, created_at: -1 }).catch(() => undefined);

    const handoff = this.db.collection('human_handoff');
    await handoff.createIndex({ status: 1 }).catch(() => undefined);
    await handoff.createIndex({ created_at: 1 }).catch(() => undefined);
    await handoff.createIndex({ status: 1, created_at: -1 }).catch(() => undefined);

    const features = this.db.collection('features');
    await features.createIndex({ scenario_id: 1 }).catch(() => undefined);
    await features.createIndex({ scenario_id: 1, sort: 1 }).catch(() => undefined);
  }

  async listScenarios(enabledOnly = false): Promise<Scenario[]> {
    let query = this.db.collection('scenarios');
    if (enabledOnly) query = query.where({ enabled: true });
    const res = await query.orderBy('sort', 'asc').get();
    return (res.data || []).map((d: any) => this.strip(d));
  }

  async getScenario(id: string): Promise<Scenario | null> {
    const res = await this.db.collection('scenarios').doc(id).get();
    const d = res.data;
    return d ? this.strip(d) : null;
  }

  async listFeatures(scenarioId?: string): Promise<Feature[]> {
    let query = this.db.collection('features');
    if (scenarioId) query = query.where({ scenario_id: scenarioId });
    const res = await query.orderBy('sort', 'asc').get();
    return (res.data || []).map((d: any) => this.strip(d));
  }

  async createFeedback(input: CreateFeedbackInput): Promise<FeedbackRecord> {
    const rec: FeedbackRecord = {
      _id: newFeedbackId(),
      message_id: input.message_id,
      type: input.type,
      note: input.note,
      scenario_id: input.scenario_id,
      created_at: new Date().toISOString(),
    };
    await this.db.collection('feedback').add({ ...rec });
    return rec;
  }

  async createHandoff(input: CreateHandoffInput): Promise<HandoffRecord> {
    const rec: HandoffRecord = {
      _id: newHandoffId(),
      scenario_id: input.scenario_id,
      question: input.question,
      contact: input.contact,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    await this.db.collection('human_handoff').add({ ...rec });
    return rec;
  }

  private strip<T>(doc: T): T {
    const { _id, ...rest } = doc as any;
    void _id;
    return rest as T;
  }
}
