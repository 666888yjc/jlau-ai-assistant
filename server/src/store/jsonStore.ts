import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
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
import { cloneFeatures, cloneScenarios } from './seed';

/**
 * 只读种子目录：部署包内置的初始数据（server/data/，含 65 条历史反馈）。
 *
 * 路径推算（不猜）：源码位于 `server/src/store/`，编译产物位于 `server/dist/store/`，
 * 云函数部署包内位于 `<bundle>/dist/store/`——三者相对 server/ 都是两层目录，
 * 因此 `join(__dirname, '..', '..', 'data')` 统一解析到 `server/data/`（部署包内的只读区）。
 */
const SEED_DIR = join(__dirname, '..', '..', 'data');

/** init() 需要保证存在的数据文件（与 loadFile 调用一一对应）。 */
const DATA_FILES = ['scenarios.json', 'features.json', 'feedback.json', 'human_handoff.json'];

/**
 * 本地存储实现：默认落盘到 JSON 文件（对齐 db-schema.md 集合结构）；
 * dataDir 传 ':memory:' 时退化为进程内数组（测试用，零 IO、可重复）。
 *
 * MVP 并发极低（单用户答疑），写操作采用「数组 + 整文件重写」足以满足；
 * 部署到 CloudBase 时由 cloudbaseStore 替换，接口保持一致。
 */
export class JsonStore implements Store {
  private memory: boolean;
  private dir: string;

  private scenarios: Scenario[] = [];
  private features: Feature[] = [];
  private feedback: FeedbackRecord[] = [];
  private handoffs: HandoffRecord[] = [];

  constructor(dataDir: string) {
    this.dir = dataDir;
    this.memory = dataDir === ':memory:';
  }

  /** 初始化：内存模式直接灌种子；文件模式按需建库/落盘。 */
  async init(): Promise<void> {
    if (this.memory) {
      this.scenarios = cloneScenarios();
      this.features = cloneFeatures();
      return;
    }
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    this.seedFromReadonlyDir();
    this.scenarios = this.loadFile<Scenario>('scenarios.json', cloneScenarios());
    this.features = this.loadFile<Feature>('features.json', cloneFeatures());
    this.feedback = this.loadFile<FeedbackRecord>('feedback.json', []);
    this.handoffs = this.loadFile<HandoffRecord>('human_handoff.json', []);
  }

  /**
   * 种子迁移：dataDir（可写区，如 /tmp/data）为空时，从只读种子目录拷贝初始数据，
   * 再交给 loadFile 加载。云函数文件系统只读（仅 /tmp 可写）：
   * - 首次冷启动：从种子拷贝 65 条历史反馈 → 后续写入 dataDir 不再崩溃、历史不丢；
   * - 实例重启：dataDir 已有数据直接复用；若 /tmp 被清空，重新从种子拷贝（种子永远在包内）。
   * 幂等：目标文件已存在则跳过；dataDir 就是种子目录本身（本地开发默认）时跳过，避免自己拷自己。
   */
  private seedFromReadonlyDir(): void {
    if (resolve(this.dir) === resolve(SEED_DIR)) return;
    for (const name of DATA_FILES) {
      const target = join(this.dir, name);
      const source = join(SEED_DIR, name);
      if (existsSync(target)) continue;
      if (!existsSync(source)) continue;
      copyFileSync(source, target);
    }
  }

  private loadFile<T>(name: string, fallback: T[]): T[] {
    const p = join(this.dir, name);
    if (!existsSync(p)) {
      writeFileSync(p, JSON.stringify(fallback, null, 2), 'utf-8');
      return fallback;
    }
    try {
      return JSON.parse(readFileSync(p, 'utf-8')) as T[];
    } catch {
      return fallback;
    }
  }

  private persist(name: string, data: unknown): void {
    if (this.memory) return;
    writeFileSync(join(this.dir, name), JSON.stringify(data, null, 2), 'utf-8');
  }

  async listScenarios(enabledOnly = false): Promise<Scenario[]> {
    const list = enabledOnly ? this.scenarios.filter((s) => s.enabled) : this.scenarios;
    return list.map((s) => ({ ...s }));
  }

  async getScenario(id: string): Promise<Scenario | null> {
    const s = this.scenarios.find((x) => x.id === id);
    return s ? { ...s } : null;
  }

  async listFeatures(scenarioId?: string): Promise<Feature[]> {
    const list = scenarioId ? this.features.filter((f) => f.scenario_id === scenarioId) : this.features;
    return list
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((f) => ({ ...f }));
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
    // A-2：仅在存在快照时落库（不传则字段缺失，与旧版文件结构逐字节一致）
    if (input.snapshot !== undefined && input.snapshot !== null) {
      rec.snapshot = input.snapshot;
    }
    this.feedback.push(rec);
    this.persist('feedback.json', this.feedback);
    return { ...rec };
  }

  /**
   * A-1/A-5/A-6/A-7 管理端反馈列表。
   * 内存过滤（type/scenario_id 精确、q 对 note includes 不区分大小写）→
   * created_at 倒序 → 分页切片。items **含 `_id`**，与 CloudBaseStore 输出同构（AC-A1.5）。
   */
  async listFeedback(filter: FeedbackFilter = {}): Promise<FeedbackListResult> {
    const { type, scenario_id, q } = filter;
    const page = filter.page && filter.page >= 1 ? Math.floor(filter.page) : 1;
    const pageSize =
      filter.pageSize && filter.pageSize >= 1 ? Math.floor(filter.pageSize) : 20;

    let list = this.feedback.slice();
    if (type !== undefined) list = list.filter((f) => f.type === type);
    if (scenario_id !== undefined) list = list.filter((f) => f.scenario_id === scenario_id);
    if (q !== undefined && q.trim() !== '') {
      const needle = q.trim().toLowerCase();
      list = list.filter((f) => (f.note ?? '').toLowerCase().includes(needle));
    }

    // 倒序：created_at 是 ISO-8601 UTC 字符串，字典序即时间序
    list.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

    const total = list.length;
    const start = (page - 1) * pageSize;
    const items = list.slice(start, start + pageSize).map((f) => ({ ...f }));
    return { items, total, page, pageSize };
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
    this.handoffs.push(rec);
    this.persist('human_handoff.json', this.handoffs);
    return { ...rec };
  }
}
