#!/usr/bin/env node
/**
 * check-bundle-size.mjs —— 首屏体积门禁（T01 / LOAD-4 · MAINT-5）
 *
 * 判据（架构 §2.1 C5）：**首屏 JS gzip 后 ≤ 150KB**。
 * 「首屏」= index.html 里通过 <script type="module"> 与 <link rel="modulepreload">
 * 直接引用的 chunk 之和 —— 也就是浏览器在首帧之前一定会下载解析的那部分。
 * 路由级 lazy 出去的 chunk 不计入（那是 T05 的收益，不该在这里被重复计算）。
 *
 * 用法：
 *   node scripts/check-bundle-size.mjs              # 默认 web/dist，阈值 150KB
 *   node scripts/check-bundle-size.mjs --dist web/dist --limit 150
 *   npm run size --prefix web
 *
 * 退出码：0=达标；1=超限；2=用法/环境错误（如未构建）。
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

/** 解析命令行参数，返回带默认值的配置对象。 */
function parseArgs(argv) {
  const opts = { dist: join(REPO_ROOT, 'web', 'dist'), limitKb: 150, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dist' && argv[i + 1]) {
      opts.dist = resolve(process.cwd(), argv[++i]);
    } else if (a === '--limit' && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0) opts.limitKb = n;
    } else if (a === '--verbose' || a === '-v') {
      opts.verbose = true;
    }
  }
  return opts;
}

/** 递归列出目录下所有文件的绝对路径。 */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** 从 index.html 抽取首屏必载的 JS 路径（module script + modulepreload）。 */
function extractEntryScripts(html) {
  const found = new Set();
  const scriptRe = /<script[^>]+type=["']module["'][^>]*src=["']([^"']+)["']/gi;
  const preloadRe = /<link[^>]+rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/gi;
  for (const re of [scriptRe, preloadRe]) {
    let m;
    while ((m = re.exec(html)) !== null) found.add(m[1]);
  }
  return [...found];
}

/** 把 html 中的引用路径映射到 dist 下的真实文件。 */
function resolveDistFile(distDir, ref) {
  const clean = ref.split('?')[0].split('#')[0];
  const rel = clean.replace(/^\.?\//, '');
  const p = join(distDir, rel);
  return existsSync(p) ? p : null;
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1);
}

function main() {
  const { dist, limitKb, verbose } = parseArgs(process.argv.slice(2));

  if (!existsSync(dist)) {
    console.error(`[size] 找不到构建产物目录: ${dist}`);
    console.error('[size] 请先执行: npm run build --prefix web');
    process.exit(2);
  }

  const indexHtml = join(dist, 'index.html');
  if (!existsSync(indexHtml)) {
    console.error(`[size] 找不到 ${indexHtml}`);
    process.exit(2);
  }

  const html = readFileSync(indexHtml, 'utf-8');
  const refs = extractEntryScripts(html);

  const entries = [];
  for (const ref of refs) {
    const file = resolveDistFile(dist, ref);
    if (!file) {
      console.warn(`[size] ⚠️  index.html 引用了不存在的资源: ${ref}`);
      continue;
    }
    const raw = readFileSync(file);
    entries.push({
      file,
      rel: relative(dist, file).replace(/\\/g, '/'),
      rawBytes: raw.length,
      gzipBytes: gzipSync(raw, { level: 9 }).length,
    });
  }

  if (entries.length === 0) {
    console.error('[size] 未能从 index.html 解析出任何首屏 JS，无法判定体积。');
    process.exit(2);
  }

  const totalRaw = entries.reduce((s, e) => s + e.rawBytes, 0);
  const totalGzip = entries.reduce((s, e) => s + e.gzipBytes, 0);
  const limitBytes = limitKb * 1024;

  console.log('');
  console.log('==========================================================');
  console.log(' 首屏 JS 体积门禁（LOAD-4）');
  console.log('==========================================================');
  for (const e of entries.sort((a, b) => b.gzipBytes - a.gzipBytes)) {
    console.log(`  ${e.rel.padEnd(46)} raw ${kb(e.rawBytes).padStart(8)}KB  gzip ${kb(e.gzipBytes).padStart(7)}KB`);
  }
  console.log('  ' + '-'.repeat(54));
  console.log(`  ${'首屏合计'.padEnd(44)} raw ${kb(totalRaw).padStart(8)}KB  gzip ${kb(totalGzip).padStart(7)}KB`);
  console.log(`  预算上限: ${limitKb}KB (gzip)`);

  if (verbose) {
    const all = walk(dist).filter((f) => f.endsWith('.js'));
    const lazy = all.filter((f) => !entries.some((e) => e.file === f));
    if (lazy.length > 0) {
      console.log('');
      console.log('  懒加载 chunk（不计入首屏预算）:');
      for (const f of lazy) {
        const raw = readFileSync(f);
        console.log(
          `    ${relative(dist, f).replace(/\\/g, '/').padEnd(44)} gzip ${kb(gzipSync(raw, { level: 9 }).length).padStart(7)}KB`,
        );
      }
    }
    console.log(`  chunk 总数（含懒加载）: ${all.length}`);
  }

  console.log('==========================================================');
  if (totalGzip > limitBytes) {
    const over = kb(totalGzip - limitBytes);
    console.error(`\x1b[31m❌ 超出预算 ${over}KB —— 门禁不通过\x1b[0m`);
    console.error('   建议：①路由级 React.lazy 拆分（T05 / LOAD-4）；');
    console.error('        ②确认 lucide-react 按需引入未打成全量；');
    console.error('        ③检查是否误引入了新的运行时依赖（本项目硬约束：零新增运行时依赖）。');
    process.exit(1);
  }
  const left = kb(limitBytes - totalGzip);
  console.log(`\x1b[32m✅ 达标，剩余余量 ${left}KB\x1b[0m`);
  process.exit(0);
}

main();
