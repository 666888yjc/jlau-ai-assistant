import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
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
import { cloneFeatures, cloneScenarios } from './seed';

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
    this.scenarios = this.loadFile<Scenario>('scenarios.json', cloneScenarios());
    this.features = this.loadFile<Feature>('features.json', cloneFeatures());
    this.feedback = this.loadFile<FeedbackRecord>('feedback.json', []);
    this.handoffs = this.loadFile<HandoffRecord>('human_handoff.json', []);
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
    this.feedback.push(rec);
    this.persist('feedback.json', this.feedback);
    return { ...rec };
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
