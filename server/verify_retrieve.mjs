// 临时验证脚本：用 retrieve.ts 的关键词打分逻辑跑几个 query，
// 确认 server/kb 下新增的 25-31 篇能被检索命中。
// 逻辑 1:1 复刻 server/src/kb/retrieve.ts（解析/H1/主题/段落/二元组打分）。
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const KB_DIR = join(process.cwd(), 'kb');

function extractFirstUrl(raw) {
  const m = raw.match(/(https?:\/\/[^\s()（）[\]<>"']+)/);
  return m ? m[1] : '';
}
function parseDoc(path) {
  const raw = readFileSync(path, 'utf-8');
  const file = path.split(/[\\/]/).pop() || path;
  const t = raw.match(/^#\s+(.+)$/m);
  const title = t ? t[1].trim() : file;
  const url = extractFirstUrl(raw);
  const theme = raw.match(/主题:\s*(.+)/);
  const header = [title, theme ? theme[1].trim() : ''].filter(Boolean).join(' ');
  const paragraphs = raw.split(/\n\s*\n/).map((s) => s.trim()).filter((p) => p.length >= 12);
  return { file, title, header, url, paragraphs };
}
function tokenize(q) {
  const tokens = [];
  const cjk = q.match(/[一-鿿]+/g) || [];
  for (const seg of cjk) {
    if (seg.length >= 2) { for (let i = 0; i < seg.length - 1; i++) tokens.push(seg.slice(i, i + 2)); }
    else if (seg.length === 1) tokens.push(seg);
  }
  const ascii = q.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  tokens.push(...ascii);
  return tokens;
}
const ALIASES = {
  吉农: ['农大', '学校', '吉林农业大学'], 吉小农: ['农大', '学校', '吉林农业大学'],
  农大: ['学校', '吉林农业大学'], 报到: ['报道', '入学', '迎新'],
};
function expandQuery(q) {
  let e = q;
  for (const [k, a] of Object.entries(ALIASES)) if (q.includes(k)) e += a.join('');
  return e;
}
function countOcc(hay, needle) {
  if (!needle) return 0; let c = 0, p = hay.indexOf(needle);
  while (p !== -1) { c++; p = hay.indexOf(needle, p + needle.length); }
  return c;
}
function retrieve(query, topK = 8) {
  const dir = KB_DIR;
  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('00-INDEX'));
  const docs = files.map((f) => parseDoc(join(dir, f)));
  const tokens = tokenize(expandQuery(query));
  if (docs.length === 0 || tokens.length === 0) return { sources: [] };
  const scored = [];
  for (const doc of docs) {
    doc.paragraphs.forEach((para) => {
      const searchText = `${doc.header} ${para}`;
      let score = 0;
      for (const t of tokens) score += countOcc(searchText, t);
      if (tokens.some((t) => doc.title.includes(t))) score += 3;
      if (score > 0) scored.push({ doc, para, score });
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const picked = []; const seen = new Set();
  for (const s of scored) {
    if (picked.length >= topK) break;
    const key = `${s.doc.file}#${s.para.slice(0, 24)}`;
    if (seen.has(key)) continue;
    picked.push({ doc: s.doc, para: s.para }); seen.add(key);
  }
  const srcMap = new Map();
  for (const p of picked) if (!srcMap.has(p.doc.file)) srcMap.set(p.doc.file, { file: p.doc.file, title: p.doc.title, url: p.doc.url });
  return { sources: [...srcMap.values()] };
}

const queries = ['奖学金多少钱', '怎么申请助学贷款', '挂科处分', '转专业条件', '学费减免多少钱', '勤工助学一小时多少钱', '学术不端会有什么后果', '学校章程规定学生有哪些权利'];
const want = ['25-学籍管理办法.md', '26-奖助学金一览.md', '27-国家助学贷款.md', '28-学费减免与勤工助学.md', '29-学生违纪处分与申诉.md', '30-学术规范与学术不端.md', '31-学校概况与章程要点.md'];
let out = 'KB_DIR=' + KB_DIR + '\n';
for (const q of queries) {
  const r = retrieve(q);
  const hit = r.sources.map((s) => s.file);
  const wantHit = hit.filter((f) => want.includes(f));
  out += `\nQ="${q}" -> 命中 ${hit.length} 篇: ${hit.join(', ')}\n  其中新增25-31命中: ${wantHit.join(', ') || '(none)'}\n`;
}
// 整体覆盖检查：7 篇至少在一个 query 的 top8 出现
const allHit = new Set();
for (const q of queries) retrieve(q).sources.forEach((s) => allHit.add(s.file));
const missing = want.filter((f) => !allHit.has(f));
out += `\n=== 新增7篇整体命中覆盖(全部8个query): ${want.length - missing.length}/${want.length} ===\n`;
out += missing.length ? `未命中: ${missing.join(', ')}\n` : '全部命中 OK\n';
// 逐篇字符数（正文=去 frontmatter 后）
for (const w of want) {
  const p = join(KB_DIR, w);
  if (existsSync(p)) {
    const raw = readFileSync(p, 'utf-8');
    const body = raw.replace(/^---[\s\S]*?---/, '').trim();
    out += `字数 ${w}: 正文 ${body.length} 字符 / 全文 ${raw.length} 字符\n`;
  }
}
process.stdout.write('===RESULT_START===\n' + out + '===RESULT_END===\n');
