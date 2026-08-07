import type {
  CreateFeedbackInput,
  CreateHandoffInput,
  Feature,
  FeedbackFilter,
  FeedbackListResult,
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
    // A-2：仅在存在快照时落库（不传则字段缺失，与旧文档结构兼容）
    if (input.snapshot !== undefined && input.snapshot !== null) {
      rec.snapshot = input.snapshot;
    }
    await this.db.collection('feedback').add({ ...rec });
    return rec;
  }

  /**
   * A-1/A-5/A-6/A-7 管理端反馈列表。
   * where({type?/scenario_id?/note: RegExp}) → orderBy('created_at','desc') → skip/limit → count()。
   *
   * 🔒 与既有其他 list 方法的唯一差异：**items 必须保留 `_id`（不 strip）**——
   * CloudBase 文档自带 `_id`，strip 会剥掉它导致前端 React key 与引用丢失；
   * JsonStore 的 `_id` 是本地生成的，两 store 同构约定（AC-A1.5）要求字段集合完全一致。
   */
  async listFeedback(filter: FeedbackFilter = {}): Promise<FeedbackListResult> {
    const { type, scenario_id, q } = filter;
    const page = filter.page && filter.page >= 1 ? Math.floor(filter.page) : 1;
    const pageSize =
      filter.pageSize && filter.pageSize >= 1 ? Math.floor(filter.pageSize) : 20;

    const where: Record<string, unknown> = {};
    if (type !== undefined) where.type = type;
    if (scenario_id !== undefined) where.scenario_id = scenario_id;
    if (q !== undefined && q.trim() !== '') {
      // q 对 note 模糊匹配：转义正则元字符 + 不区分大小写
      where.note = this.db.RegExp({ regexp: escapeRegExp(q.trim()), options: 'i' });
    }

    let query = this.db.collection('feedback').where(where);
    query = query.orderBy('created_at', 'desc');
    query = query.skip((page - 1) * pageSize).limit(pageSize);
    const res = await query.get();
    const countRes = await this.db.collection('feedback').where(where).count();

    // 保留 _id（不 strip）——见方法头注释
    const items = (res.data || []) as FeedbackRecord[];
    return { items, total: countRes.total || 0, page, pageSize };
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

/** 转义正则元字符：用户输入的 q 作为 RegExp 字面量前必须转义，避免注入/误匹配。 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
