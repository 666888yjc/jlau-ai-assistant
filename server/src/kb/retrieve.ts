import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config';

/**
 * 本地知识库检索（route-B 零代码维护核心）。
 * 不依赖向量数据库：把 .md 按段落切块，用中文字二元组 + ASCII 词做关键词打分，取 top-K 作为上下文。
 * 替换/增删 server/kb 下的 .md 即可更新知识，无需改代码。
 */

export interface KbSource {
  title: string;
  url: string;
  updated_at?: string;
}

export interface Retrieved {
  context: string;
  sources: KbSource[];
}

interface KbDoc {
  file: string;
  title: string;
  header: string;
  url: string;
  updatedAt: string;
  paragraphs: string[];
}

/**
 * 提取原文中的第一个「干净」URL。
 *
 * 终止字符除空白、半角 `()[]<>"'` 外，还必须包含全角括号 `（）`——
 * KB 的 `来源:` 行常写成 `名称（https://a/）、名称2（https://b/）`，
 * 若不排除 `）`，正则会把中间的中文与第二个链接一并吞进第一个 URL，
 * 产出点不开的畸形链接。
 *
 * @param raw markdown 原文
 * @returns 第一个 URL；不存在时返回空串
 */
export function extractFirstUrl(raw: string): string {
  const urlMatch = raw.match(/(https?:\/\/[^\s()（）[\]<>"']+)/);
  return urlMatch ? urlMatch[1] : '';
}

let cache: KbDoc[] | null = null;

function loadDocs(): KbDoc[] {
  if (cache) return cache;
  const dir = config.kbDir;
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('00-INDEX'));
  cache = files.map((f) => parseDoc(join(dir, f)));
  return cache;
}

/**
 * 清空模块级缓存（方案 A A-3）。下一次 `loadDocs()` 强制重读磁盘。
 *
 * 🔒 保护对象：`loadDocs()` 本体（含缓存命中与目录缺失=空上下文）**一字不改**；
 * 本方法只负责把 `cache` 置 null，chat 路径的既有行为完全不受影响。
 */
export function clearKbCache(): void {
  cache = null;
}

export interface KbReloadResult {
  ok: boolean;
  docCount: number;
  /** ok=false 时的显式错误原因（AC-A3.4 不静默） */
  error?: string;
}

/**
 * 清缓存并立即重读一次（方案 A A-3）。
 *
 * 与 chat 路径的区别：`reloadKb` 在调用 `loadDocs` 前**自行**做目录存在性检查，
 * 以给出明确错误（目录缺失 → `{ok:false, error}`），而不是像 chat 那样
 * 静默返回空上下文。读取抛错同样显式返回，绝不吞异常（AC-A3.4）。
 */
export function reloadKb(): KbReloadResult {
  cache = null;
  try {
    if (!existsSync(config.kbDir)) {
      return { ok: false, docCount: 0, error: `知识库目录不存在: ${config.kbDir}` };
    }
    const docs = loadDocs();
    return { ok: true, docCount: docs.length };
  } catch (e) {
    cache = null;
    return { ok: false, docCount: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

function parseDoc(path: string): KbDoc {
  const raw = readFileSync(path, 'utf-8');
  const file = path.split(/[\\/]/).pop() || path;
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : file;
  const url = extractFirstUrl(raw);
  const dateMatch = raw.match(/(\d{4}-\d{2}-\d{2})/);
  const updatedAt = dateMatch ? dateMatch[1] : '';
  const themeMatch = raw.match(/主题:\s*(.+)/);
  const header = [title, themeMatch ? themeMatch[1].trim() : ''].filter(Boolean).join(' ');
  const paragraphs = raw
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((p) => p.length >= 12);
  return { file, title, header, url, updatedAt, paragraphs };
}

/** 中文二元组 + ASCII 词分词（过滤标点与单字噪声）。 */
function tokenize(q: string): string[] {
  const tokens: string[] = [];
  const cjk = q.match(/[一-鿿]+/g) || [];
  for (const seg of cjk) {
    if (seg.length >= 2) {
      for (let i = 0; i < seg.length - 1; i++) tokens.push(seg.slice(i, i + 2));
    } else if (seg.length === 1) {
      tokens.push(seg);
    }
  }
  const ascii = q.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  tokens.push(...ascii);
  return tokens;
}

/**
 * 同义词 / 简称扩展：用户口语与知识库书面语不一致时，补齐检索词。
 * 例：「吉农周边有啥好吃的」→ 补「农大/学校/美食/餐厅/吃」，让标题含「周边美食」的美食篇能命中。
 */
const ALIASES: Record<string, string[]> = {
  吉农: ['农大', '学校', '吉林农业大学'],
  吉小农: ['农大', '学校', '吉林农业大学'],
  农大: ['学校', '吉林农业大学'],
  好吃: ['美食', '餐厅', '吃'],
  吃的: ['美食', '餐厅', '吃'],
  美食: ['好吃', '餐厅', '吃'],
  吃饭: ['美食', '餐厅', '吃'],
  玩: ['景点', '周边', '游玩'],
  游玩: ['景点', '周边'],
  附近: ['周边'],
  报到: ['报道', '入学', '迎新'],
};

function expandQuery(q: string): string {
  let expanded = q;
  for (const [key, alts] of Object.entries(ALIASES)) {
    if (q.includes(key)) expanded += alts.join('');
  }
  return expanded;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = haystack.indexOf(needle);
  while (pos !== -1) {
    count++;
    pos = haystack.indexOf(needle, pos + needle.length);
  }
  return count;
}

/**
 * 检索：返回注入模型的知识上下文 + 命中的来源列表。
 * @param query 用户问题
 * @param topK 最多选取的段落数
 * @param maxChars 上下文最大字符数
 */
export function retrieve(query: string, topK = 4, maxChars = 3500): Retrieved {
  const docs = loadDocs();
  const tokens = tokenize(expandQuery(query));
  if (docs.length === 0 || tokens.length === 0) {
    return { context: '', sources: [] };
  }

  const scored: { doc: KbDoc; para: string; score: number }[] = [];
  for (const doc of docs) {
    doc.paragraphs.forEach((para) => {
      // 检索文本 = 标题 + 主题词 + 正文，使标题/主题里的关键词（如「周边美食」）也能为正文段落加分
      const searchText = `${doc.header} ${para}`;
      let score = 0;
      for (const t of tokens) score += countOccurrences(searchText, t);
      if (tokens.some((t) => doc.title.includes(t))) score += 3; // 标题命中加权
      if (score > 0) scored.push({ doc, para, score });
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const picked: { doc: KbDoc; para: string }[] = [];
  const seen = new Set<string>();
  let chars = 0;
  for (const s of scored) {
    if (picked.length >= topK) break;
    const key = `${s.doc.file}#${s.para.slice(0, 24)}`;
    if (seen.has(key)) continue;
    if (chars + s.para.length > maxChars && picked.length > 0) continue;
    const para = picked.length === 0 && chars + s.para.length > maxChars ? s.para.slice(0, maxChars) : s.para;
    picked.push({ doc: s.doc, para });
    chars += para.length;
    seen.add(key);
  }

  const context = picked.map((p) => `【${p.doc.title}】\n${p.para}`).join('\n\n');

  const srcMap = new Map<string, KbSource>();
  for (const p of picked) {
    if (!srcMap.has(p.doc.file)) {
      srcMap.set(p.doc.file, { title: p.doc.title, url: p.doc.url, updated_at: p.doc.updatedAt || undefined });
    }
  }
  return { context, sources: [...srcMap.values()] };
}
