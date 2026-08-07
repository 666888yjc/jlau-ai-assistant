#!/usr/bin/env node
/**
 * scan-secrets.mjs —— 密钥扫描门禁（SEC-7 / B5 T06）
 *
 * 背景：SEC-7 验收「构建产物 AKID 零命中」在 B1-B4 已天然满足，本脚本把该状态
 * 固化为防回归门禁：任何后续改动一旦把腾讯云 SecretId / 私钥 / 令牌格式的串
 * 打进构建产物或源码，`scripts/gate.sh` 就会红灯。
 *
 * 保守低误报模式（只针对腾讯云/通用密钥格式，不扫普通单词）：
 *   1. Tencent SecretId：    AKID + 13 位以上字母数字
 *   2. 显式密钥赋值：        SecretId/SecretKey/accessKey/apiKey 等 `: 或 =` 后带引号值
 *   3. 私钥块：              -----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----
 *   4. OpenAI 风格 token：   sk- 开头 16 位以上
 *   5. Bearer token：        Bearer 后跟 20 位以上令牌字符
 *
 * 用法：
 *   node scripts/scan-secrets.mjs                  # 默认目录：web/dist server/dist server/src web/src .env.example
 *   node scripts/scan-secrets.mjs --dir web/dist   # 只扫一个目录（可重复）
 * 退出码：0=零命中；1=有命中；2=用法/环境错误。
 *
 * 白名单（SCAN_IGNORE）：默认空。加白必须写理由 —— 一条注释就是一个事故记录，
 * 宁可在下面多写三行解释，也不要让一个真实密钥靠沉默过关。
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

/** 默认扫描目标：构建产物 + 源码 + 环境变量模板。目录不存在时按 WARN 处理（不判失败）。 */
const DEFAULT_TARGETS = ['web/dist', 'server/dist', 'server/src', 'web/src', '.env.example'];

/** 密钥格式特征（正则） */
const PATTERNS = [
  { name: 'Tencent SecretId (AKID...)', re: /\bAKID[A-Za-z0-9]{13,}\b/ },
  {
    name: '显式密钥赋值 (SecretId/SecretKey/accessKey/apiKey=...)',
    re: /(?:SecretId|SecretKey|secret_id|secret_key|accessKey|access_key|api[_-]?key|apikey)\s*[:=]\s*["'][^"']{8,}["']/i,
  },
  {
    name: '私钥块 (BEGIN PRIVATE KEY)',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  },
  { name: 'OpenAI 风格 token (sk-...)', re: /\bsk-[A-Za-z0-9]{16,}/ },
  { name: 'Bearer token', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/ },
];

/**
 * 白名单：{ file: 相对仓库根的路径, reason: 加白理由 }。
 * 默认空 —— 任何命中都必须先在这里登记理由，且只允许对「结构上必然出现该串」的
 * 文件加白（例如某个专测正则引擎的测试夹具）。业务代码一律不许加白。
 */
const SCAN_IGNORE = [
  // 例：{ file: 'server/test/fixtures/private-key-sample.txt', reason: '测试夹具，仅用于正则引擎单元测试，非真实密钥' },
];

/** 命令行解析：--dir 可重复，出现任一 --dir 即覆盖默认目标。 */
function parseArgs(argv) {
  const targets = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir' && argv[i + 1]) {
      targets.push(argv[++i]);
    }
  }
  return { targets: targets.length > 0 ? targets : [...DEFAULT_TARGETS] };
}

/** 递归列出目录下所有文件绝对路径。 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** 解析目标：目录展开为文件列表，文件直接加入。返回 { files, missing }。 */
function resolveFiles(targets) {
  const files = [];
  const missing = [];
  for (const t of targets) {
    const abs = resolve(REPO_ROOT, t);
    if (!existsSync(abs)) {
      missing.push(t);
      continue;
    }
    if (statSync(abs).isDirectory()) files.push(...walk(abs));
    else files.push(abs);
  }
  return { files, missing };
}

/** 对单个文件跑全部模式，返回命中列表 [{ pattern, line, snippet }]。 */
function scanFile(file) {
  const hits = [];
  const lines = readFileSync(file, 'utf-8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const p of PATTERNS) {
      if (!p.re.test(line)) continue;
      const m = line.match(p.re);
      if (!m) continue;
      hits.push({ pattern: p.name, line: i + 1, snippet: mask(m[0]) });
    }
  }
  return hits;
}

/** 脱敏截断：只保留前 8 后 4，中间省略号。 */
function mask(raw) {
  if (raw.length <= 16) return raw;
  return `${raw.slice(0, 8)}…${raw.slice(-4)}`;
}

function rel(p) {
  return p === REPO_ROOT ? '.' : p.startsWith(REPO_ROOT) ? p.slice(REPO_ROOT.length + 1) : p;
}

function main() {
  const { targets } = parseArgs(process.argv.slice(2));
  const { files, missing } = resolveFiles(targets);

  console.log('');
  console.log('==========================================================');
  console.log(' 密钥扫描门禁（SEC-7）');
  console.log('==========================================================');

  for (const t of missing) {
    console.log(`  ⚠️  目标不存在（跳过，不判失败）: ${t}`);
  }
  console.log(`  扫描文件数: ${files.length}`);
  console.log('');

  let total = 0;
  for (const file of files) {
    const hits = scanFile(file);
    if (hits.length === 0) continue;
    // 白名单命中：仅提示，不计失败（但必须登记了理由）
    const r = rel(file);
    const ignored = SCAN_IGNORE.find((e) => e.file === r);
    if (ignored) {
      console.log(`  \x1b[33m⏭  白名单跳过\x1b[0m ${r}（理由: ${ignored.reason}）`);
      continue;
    }
    total += hits.length;
    console.log(`  \x1b[31m❌ ${r}\x1b[0m`);
    for (const h of hits) {
      console.log(`      ${h.pattern} @ 行 ${h.line}: ${h.snippet}`);
    }
  }

  console.log('----------------------------------------------------------');
  if (total > 0) {
    console.error(`\x1b[31m❌ 发现 ${total} 处疑似密钥 —— 门禁不通过\x1b[0m`);
    console.error('   处理：①确认是真实密钥 → 立即轮换并从仓库/产物中移除；');
    console.error('        ②确认是测试/文档里的格式样例 → 在 SCAN_IGNORE 登记理由后加白。');
    process.exit(1);
  }
  console.log('\x1b[32m✅ 零命中（AKID/SecretId/私钥/令牌均未出现）\x1b[0m');
  process.exit(0);
}

main();
