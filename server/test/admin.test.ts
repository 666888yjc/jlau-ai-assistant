import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { issueAdminSession } from '../src/middleware/auth';
import { reloadKb } from '../src/kb/retrieve';
import { getStore, resetStoreForTest } from '../src/store';
import { resetAdminLoginFails } from '../src/routes/admin';

const app = createApp();

const ADMIN_PW = 's3cret-test-pw';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('A-4 门禁：未配置 ADMIN_PASSWORD -> 一律 503 code 4011', () => {
  beforeEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it('login -> 503 4011「管理后台未启用」，无空密码放行路径', async () => {
    const res = await request(app).post('/api/v1/admin/login').send({ password: '' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe(4011);
    expect(res.body.data).toBeNull();
  });

  it('反馈列表 -> 503 4011（先于令牌校验）', async () => {
    const res = await request(app).get('/api/v1/admin/feedback');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe(4011);
    expect(res.body.data).toBeNull();
  });

  it('KB 刷新 -> 503 4011', async () => {
    const res = await request(app).post('/api/v1/admin/kb/refresh');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe(4011);
  });
});

describe('A-4 登录与失败限流', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = ADMIN_PW;
    resetAdminLoginFails();
  });
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it('正确密码 -> 200，签发 av1 前缀令牌 + expires_at', async () => {
    const res = await request(app).post('/api/v1/admin/login').send({ password: ADMIN_PW });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.token).toMatch(/^av1\./);
    expect(res.body.data.expires_at).toBeGreaterThan(Date.now());
  });

  it('错误密码 -> 401 code 4013', async () => {
    const res = await request(app).post('/api/v1/admin/login').send({ password: 'wrong-pw' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(4013);
    expect(res.body.data).toBeNull();
  });

  it('连续 5 次失败后第 6 次 429（即使密码正确也拒）+ Retry-After', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/v1/admin/login').send({ password: 'wrong-pw' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(4013);
    }
    const res6 = await request(app).post('/api/v1/admin/login').send({ password: ADMIN_PW });
    expect(res6.status).toBe(429);
    expect(res6.body.code).toBe(4290);
    expect(Number(res6.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('窗口过期后自动解锁', async () => {
    const origWindow = config.admin.loginFailWindowMs;
    try {
      // 窗口取 100ms：小于「5 次失败的总耗时」，能累计到锁定；
      // 大于单次请求耗时，不会在累计途中被误判过期（1ms 会因每请求 ~2-5ms 而重置计数）。
      config.admin.loginFailWindowMs = 100;
      for (let i = 0; i < 5; i++) {
        await request(app).post('/api/v1/admin/login').send({ password: 'wrong-pw' });
      }
      const locked = await request(app).post('/api/v1/admin/login').send({ password: ADMIN_PW });
      expect(locked.status).toBe(429);
      await sleep(150); // 等待窗口过期
      const unlocked = await request(app).post('/api/v1/admin/login').send({ password: ADMIN_PW });
      expect(unlocked.status).toBe(200);
      expect(unlocked.body.data.token).toMatch(/^av1\./);
    } finally {
      config.admin.loginFailWindowMs = origWindow;
    }
  });

  it('成功登录清空失败计数', async () => {
    for (let i = 0; i < 4; i++) {
      await request(app).post('/api/v1/admin/login').send({ password: 'wrong-pw' });
    }
    const ok = await request(app).post('/api/v1/admin/login').send({ password: ADMIN_PW });
    expect(ok.status).toBe(200);
    // 计数已清：再来 4 次错误密码仍 401，而非立即 429
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/api/v1/admin/login').send({ password: 'wrong-pw' });
      expect(res.status).toBe(401);
    }
  });

  it('logout 对称端点：带令牌 -> 200 {ok:true}', async () => {
    const login = await request(app).post('/api/v1/admin/login').send({ password: ADMIN_PW });
    const token = login.body.data.token;
    const res = await request(app).post('/api/v1/admin/logout').set('X-Admin-Token', token);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });
  });
});

describe('A-4 令牌校验（requireAdmin）', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = ADMIN_PW;
    resetAdminLoginFails();
  });
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it('无令牌 -> 401 code 4012', async () => {
    const res = await request(app).get('/api/v1/admin/feedback');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(4012);
    expect(res.body.data).toBeNull();
  });

  it('坏令牌（格式非法）-> 401 code 4012', async () => {
    const res = await request(app).get('/api/v1/admin/feedback').set('X-Admin-Token', 'av1.bad.token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(4012);
  });

  it('伪造令牌（签名不匹配）-> 401 code 4012', async () => {
    const res = await request(app)
      .get('/api/v1/admin/feedback')
      .set('X-Admin-Token', 'av1.9999999999999.abcdefghijkl.YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(4012);
  });

  it('过期令牌 -> 401 code 4012', async () => {
    const expired = issueAdminSession(Date.now() - config.admin.sessionTtlMs - 1000);
    const res = await request(app).get('/api/v1/admin/feedback').set('X-Admin-Token', expired.ticket);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(4012);
  });

  it('有效令牌 -> 通过（空列表 200 code 0）', async () => {
    resetStoreForTest();
    const login = await request(app).post('/api/v1/admin/login').send({ password: ADMIN_PW });
    const token = login.body.data.token;
    const res = await request(app).get('/api/v1/admin/feedback').set('X-Admin-Token', token);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.items).toEqual([]);
  });
});

describe('GET /api/v1/admin/feedback 列表（A-1/A-5/A-6/A-7）', () => {
  beforeEach(async () => {
    process.env.ADMIN_PASSWORD = ADMIN_PW;
    resetAdminLoginFails();
    resetStoreForTest();
  });
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  async function loginToken(): Promise<string> {
    const login = await request(app).post('/api/v1/admin/login').send({ password: ADMIN_PW });
    return login.body.data.token as string;
  }

  async function seedFeedback(rows: { message_id: string; type: 'helpful' | 'reported'; note?: string; scenario_id?: string; snapshot?: { question: string; answer: string } }[]): Promise<void> {
    for (const r of rows) {
      await request(app).post('/api/v1/feedback').send({
        message_id: r.message_id,
        type: r.type,
        note: r.note,
        scenario_id: r.scenario_id,
        snapshot: r.snapshot,
      });
      await sleep(2); // 保证 created_at 毫秒级错开
    }
  }

  it('默认倒序 + items 含 _id 与 snapshot', async () => {
    const token = await loginToken();
    await seedFeedback([
      { message_id: 'm-old', type: 'reported', note: '最早的', snapshot: { question: 'q1', answer: 'a1' } },
      { message_id: 'm-new', type: 'reported', note: '最新的' },
    ]);
    const res = await request(app).get('/api/v1/admin/feedback').set('X-Admin-Token', token);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items[0].message_id).toBe('m-new');
    expect(res.body.data.items[1].message_id).toBe('m-old');
    // 两 store 同构约定：必含 _id
    expect(typeof res.body.data.items[0]._id).toBe('string');
    // 快照透传；无快照记录字段缺失
    expect(res.body.data.items[1].snapshot).toEqual({ question: 'q1', answer: 'a1' });
    expect(res.body.data.items[0].snapshot).toBeUndefined();
  });

  it('type 过滤', async () => {
    const token = await loginToken();
    await seedFeedback([
      { message_id: 'm-h', type: 'helpful', note: '有帮助' },
      { message_id: 'm-r', type: 'reported', note: '报错' },
    ]);
    const res = await request(app).get('/api/v1/admin/feedback').query({ type: 'reported' }).set('X-Admin-Token', token);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].message_id).toBe('m-r');
  });

  it('type 非法 -> 400 code 4001', async () => {
    const token = await loginToken();
    const res = await request(app).get('/api/v1/admin/feedback').query({ type: 'bad' }).set('X-Admin-Token', token);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(4001);
  });

  it('scenario_id 过滤', async () => {
    const token = await loginToken();
    await seedFeedback([
      { message_id: 'm-b', type: 'reported', note: '报到', scenario_id: 'baodao' },
      { message_id: 'm-s', type: 'reported', note: '宿舍', scenario_id: 'dorm' },
    ]);
    const res = await request(app)
      .get('/api/v1/admin/feedback')
      .query({ scenario_id: 'dorm' })
      .set('X-Admin-Token', token);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].message_id).toBe('m-s');
  });

  it('q 对 note 模糊匹配（不区分大小写）', async () => {
    const token = await loginToken();
    await seedFeedback([
      { message_id: 'm-1', type: 'reported', note: '缴费入口写错了' },
      { message_id: 'm-2', type: 'reported', note: '床位尺寸不对' },
    ]);
    const res = await request(app).get('/api/v1/admin/feedback').query({ q: '缴费' }).set('X-Admin-Token', token);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].message_id).toBe('m-1');
  });

  it('分页：pageSize=2 分两页，total 正确', async () => {
    const token = await loginToken();
    await seedFeedback([
      { message_id: 'm-1', type: 'reported', note: 'n1' },
      { message_id: 'm-2', type: 'reported', note: 'n2' },
      { message_id: 'm-3', type: 'reported', note: 'n3' },
    ]);
    const p1 = await request(app).get('/api/v1/admin/feedback').query({ page: 1, pageSize: 2 }).set('X-Admin-Token', token);
    expect(p1.body.data.total).toBe(3);
    expect(p1.body.data.items.length).toBe(2);
    expect(p1.body.data.page).toBe(1);
    expect(p1.body.data.pageSize).toBe(2);
    // 倒序：第一页 = 最新的两条（m-3, m-2）
    expect(p1.body.data.items[0].message_id).toBe('m-3');
    expect(p1.body.data.items[1].message_id).toBe('m-2');

    const p2 = await request(app).get('/api/v1/admin/feedback').query({ page: 2, pageSize: 2 }).set('X-Admin-Token', token);
    expect(p2.body.data.items.length).toBe(1);
    expect(p2.body.data.items[0].message_id).toBe('m-1'); // 第二页 = 最旧的一条
  });
});

describe('POST /api/v1/admin/kb/refresh（A-3）', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = ADMIN_PW;
    resetAdminLoginFails();
  });
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  async function loginToken(): Promise<string> {
    const login = await request(app).post('/api/v1/admin/login').send({ password: ADMIN_PW });
    return login.body.data.token as string;
  }

  it('临时 KB_DIR 存在 md -> 200 {cleared:true, doc_count}', async () => {
    const token = await loginToken();
    const dir = mkdtempSync(join(tmpdir(), 'admin-kb-'));
    const origKbDir = config.kbDir;
    try {
      writeFileSync(join(dir, 'a.md'), '# 标题A\n\n报到流程正文内容足够长的一段话。\n');
      writeFileSync(join(dir, 'b.md'), '# 标题B\n\n宿舍分配正文内容足够长的一段话。\n');
      config.kbDir = dir;
      const res = await request(app).post('/api/v1/admin/kb/refresh').set('X-Admin-Token', token);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ cleared: true, doc_count: 2 });
    } finally {
      config.kbDir = origKbDir;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('目录不存在 -> 500 code 5002 明确文案（不静默）', async () => {
    const token = await loginToken();
    const origKbDir = config.kbDir;
    try {
      config.kbDir = join(tmpdir(), 'no-such-kb-' + Date.now());
      const res = await request(app).post('/api/v1/admin/kb/refresh').set('X-Admin-Token', token);
      expect(res.status).toBe(500);
      expect(res.body.code).toBe(5002);
      expect(res.body.message).toContain('知识库刷新失败');
      expect(res.body.message).toContain('目录不存在');
    } finally {
      config.kbDir = origKbDir;
    }
  });

  it('reloadKb 单元：目录存在返回 docCount / 目录缺失显式 error / 读文件抛错被捕获', () => {
    const origKbDir = config.kbDir;
    try {
      // 目录存在
      const dir = mkdtempSync(join(tmpdir(), 'admin-kb-unit-'));
      writeFileSync(join(dir, 'a.md'), '# 标题A\n\n正文足够长的一段话用于切块。\n');
      config.kbDir = dir;
      expect(reloadKb()).toEqual({ ok: true, docCount: 1 });

      // 缓存已清：新增文件后再次 refresh 能读到（AC-A3.2 的缓存行为）
      writeFileSync(join(dir, 'b.md'), '# 标题B\n\n另一段足够长的正文内容。\n');
      expect(reloadKb()).toEqual({ ok: true, docCount: 2 });

      // 目录缺失
      config.kbDir = join(tmpdir(), 'no-such-kb-unit-' + Date.now());
      const missing = reloadKb();
      expect(missing.ok).toBe(false);
      expect(missing.error).toContain('目录不存在');

      // 读文件抛错：用子目录冒充 .md（readFileSync 抛 EISDIR）被捕获为显式错误
      const badDir = mkdtempSync(join(tmpdir(), 'admin-kb-bad-'));
      writeFileSync(join(badDir, 'real.md'), '# 真实\n\n正文足够长。\n');
      mkdirSync(join(badDir, 'fake.md')); // 目录名以 .md 结尾，readdir 命中后 readFileSync 抛 EISDIR
      config.kbDir = badDir;
      const bad = reloadKb();
      expect(bad.ok).toBe(false);
      expect(typeof bad.error).toBe('string');
      rmSync(badDir, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    } finally {
      config.kbDir = origKbDir;
    }
  });
});
