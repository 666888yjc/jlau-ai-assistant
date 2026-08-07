#!/usr/bin/env node
/**
 * 吉小农薄壳后端 —— 反馈管理后台部署验证脚本（方案 A，可复跑）。
 *
 * 链路（架构 §5 时序图）：登录 → 拉列表 → 刷新知识库。
 * 依赖：服务端已配置 ADMIN_PASSWORD（未配置时登录/列表/刷新一律 503 code 4011，本脚本会报 FAIL）。
 *
 * 用法：
 *   node scripts/verify-admin.mjs                 # 默认打 http://localhost:3100，密码取 ADMIN_PASSWORD
 *   BASE_URL=http://localhost:3100 ADMIN_PASSWORD=xxx node scripts/verify-admin.mjs
 *
 * 退出码：全部通过 0，任一失败 1。
 */

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}

async function main() {
  console.log(`== 反馈管理后台部署验证 @ ${BASE} ==`);

  if (!ADMIN_PASSWORD) {
    console.log('SKIP | 未设置 ADMIN_PASSWORD 环境变量，跳过全部（部署时须显式配置）');
    process.exit(0);
  }

  // 1) 登录（正确密码 -> av1 令牌）
  let token = '';
  try {
    const res = await fetch(`${BASE}/api/v1/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    });
    const body = await res.json();
    const ok = res.status === 200 && body?.code === 0 && typeof body?.data?.token === 'string' && body.data.token.startsWith('av1.');
    check('POST /api/v1/admin/login 签发 av1 令牌', ok, `status=${res.status} code=${body?.code}`);
    if (ok) token = body.data.token;
  } catch (e) {
    check('POST /api/v1/admin/login', false, String(e));
  }
  if (!token) {
    const failed = results.filter((r) => !r.ok);
    console.log(`== 结果：${results.length - failed.length}/${results.length} 通过 ==`);
    process.exit(1);
  }

  const adminHeaders = { 'X-Admin-Token': token };

  // 2) 反馈列表（空/非空都算成功，关键是无 401/503）
  try {
    const res = await fetch(`${BASE}/api/v1/admin/feedback`, { headers: adminHeaders });
    const body = await res.json();
    const ok = res.status === 200 && body?.code === 0 && Array.isArray(body?.data?.items) && typeof body.data.total === 'number';
    check('GET /api/v1/admin/feedback 列表', ok, `status=${res.status} total=${body?.data?.total}`);
  } catch (e) {
    check('GET /api/v1/admin/feedback', false, String(e));
  }

  // 3) 知识库刷新（成功 -> cleared:true + doc_count）
  try {
    const res = await fetch(`${BASE}/api/v1/admin/kb/refresh`, {
      method: 'POST',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await res.json();
    const ok = res.status === 200 && body?.code === 0 && body?.data?.cleared === true && typeof body.data.doc_count === 'number';
    check('POST /api/v1/admin/kb/refresh', ok, `status=${res.status} doc_count=${body?.data?.doc_count}`);
  } catch (e) {
    check('POST /api/v1/admin/kb/refresh', false, String(e));
  }

  // 4) 登出（轻量对称端点）
  try {
    const res = await fetch(`${BASE}/api/v1/admin/logout`, {
      method: 'POST',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await res.json();
    check('POST /api/v1/admin/logout', res.status === 200 && body?.code === 0, `status=${res.status} code=${body?.code}`);
  } catch (e) {
    check('POST /api/v1/admin/logout', false, String(e));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`== 结果：${results.length - failed.length}/${results.length} 通过 ==`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('验证脚本异常：', e);
  process.exit(1);
});
