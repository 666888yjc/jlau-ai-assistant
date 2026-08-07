import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { JsonStore } from '../src/store/jsonStore';

/**
 * jsonStore 种子迁移单测：dataDir（可写区）为空时，从只读种子目录
 * （部署包内置 server/data/）拷贝初始数据，再加载。
 * 覆盖：冷启动拷贝、幂等、dataDir=种子目录跳过、:memory: 跳过。
 */

/** 真实种子目录（server/test/../data → server/data/），与 SEED_DIR 解析结果一致。 */
const SEED_DIR = resolve(join(__dirname, '..', 'data'));
const DATA_FILES = ['scenarios.json', 'features.json', 'feedback.json', 'human_handoff.json'];

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'jsonstore-seed-'));
  tempDirs.push(dir);
  return dir;
}

function byteEqual(a: string, b: string): boolean {
  return readFileSync(a).equals(readFileSync(b));
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('JsonStore 种子迁移', () => {
  it('冷启动：空 dataDir 从只读种子目录拷贝 4 个数据文件（feedback 65 条），且可正常写入', async () => {
    expect(existsSync(SEED_DIR)).toBe(true);
    const dir = makeTempDir();
    const store = new JsonStore(dir);
    await store.init();

    for (const f of DATA_FILES) {
      expect(existsSync(join(dir, f)), `${f} 应被拷贝到 dataDir`).toBe(true);
      expect(byteEqual(join(dir, f), join(SEED_DIR, f)), `${f} 应与种子逐字节一致`).toBe(true);
    }

    const feedback = JSON.parse(readFileSync(join(dir, 'feedback.json'), 'utf-8')) as unknown[];
    expect(feedback.length).toBe(65);

    // 读接口不丢历史
    const listed = await store.listFeedback({ page: 1, pageSize: 100 });
    expect(listed.total).toBe(65);

    // 写接口在可写区正常落盘（云函数崩溃场景回归）
    await store.createFeedback({ message_id: 'seed-test-1', type: 'downvote', note: 'sim' });
    const after = JSON.parse(readFileSync(join(dir, 'feedback.json'), 'utf-8')) as unknown[];
    expect(after.length).toBe(66);
  });

  it('幂等：二次 init 不重复拷贝、不覆盖已写入数据', async () => {
    const dir = makeTempDir();
    const store = await storeCreateFeedback(dir); // init 一次并写入 1 条
    const beforeContent = readFileSync(join(dir, 'feedback.json'), 'utf-8');
    const beforeMtime = statSync(join(dir, 'feedback.json')).mtimeMs;

    await new JsonStore(dir).init(); // 二次 init

    expect(readFileSync(join(dir, 'feedback.json'), 'utf-8')).toBe(beforeContent);
    expect(statSync(join(dir, 'feedback.json')).mtimeMs).toBe(beforeMtime);
    expect((await store.listFeedback({ page: 1, pageSize: 100 })).total).toBe(66);
  });

  it('dataDir 即种子目录：跳过拷贝（不自己拷自己），仍正常加载', async () => {
    const dir = makeTempDir();
    for (const f of DATA_FILES) copyFileSync(join(SEED_DIR, f), join(dir, f));
    const beforeMtime = statSync(join(dir, 'feedback.json')).mtimeMs;

    const store = new JsonStore(dir);
    await store.init();

    // 二次 init 也不改文件
    await new JsonStore(dir).init();
    expect(statSync(join(dir, 'feedback.json')).mtimeMs).toBe(beforeMtime);
    expect((await store.listFeedback({ page: 1, pageSize: 100 })).total).toBe(65);
  });

  it('dataDir 就是真实种子目录（server/data）：init 只读加载，不改动任何文件', async () => {
    for (const f of DATA_FILES) expect(existsSync(join(SEED_DIR, f)), `种子 ${f} 应存在`).toBe(true);
    const before = new Map<string, { mtime: number; content: string }>();
    for (const f of DATA_FILES) {
      const p = join(SEED_DIR, f);
      before.set(f, { mtime: statSync(p).mtimeMs, content: readFileSync(p, 'utf-8') });
    }

    const store = new JsonStore(SEED_DIR);
    await store.init();
    await new JsonStore(SEED_DIR).init(); // 二次 init 同样不写

    for (const f of DATA_FILES) {
      const p = join(SEED_DIR, f);
      const snap = before.get(f)!;
      expect(readFileSync(p, 'utf-8'), `${f} 内容不应被改动`).toBe(snap.content);
      expect(statSync(p).mtimeMs, `${f} mtime 不应被改动`).toBe(snap.mtime);
    }
    expect((await store.listFeedback({ page: 1, pageSize: 100 })).total).toBe(65);
  });

  it(':memory: 模式跳过种子拷贝，零 IO 可重复', async () => {
    const store = new JsonStore(':memory:');
    await store.init();
    expect((await store.listFeedback({ page: 1, pageSize: 100 })).total).toBe(0);
  });
});

/** 辅助：在 dir 上 init 后写入一条反馈（返回 store 复用）。 */
async function storeCreateFeedback(dir: string): Promise<JsonStore> {
  const store = new JsonStore(dir);
  await store.init();
  await store.createFeedback({ message_id: 'seed-test-2', type: 'upvote', note: 'sim2' });
  return store;
}
