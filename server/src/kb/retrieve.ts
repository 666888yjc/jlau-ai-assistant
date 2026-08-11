import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config';

/**
 * 本地知识库检索（route-B 零代码维护核心）。
 *
 * 不依赖向量数据库：把 .md 按段落切块，用中文字二元组 + ASCII 词做关键词分词，再以 BM25-lite 打分取 top-K 作为上下文。
 * 替换/增删 server/kb 下的 .md 即可更新知识，无需改代码。
 *
 * 打分策略（BM25-lite，相对旧版「词频简单累加」的改进）：
 *   1. 次线性 TF：对每个命中 token 累加 `1 + log2(1 + count)`，避免同一词在长段落里反复出现就碾压其它段落。
 *   2. 长度归一化：`score /= 0.5 + 0.5 * (para.length / AVG_LEN)`，对冗长段落做惩罚，让精准短段落也能排上来。
 *   3. 标题/主题加权：tokens 中出现在 doc.header（标题+主题词）的数量记为 titleHits，`score += titleHits * 2`，
 *      保留并强化旧版「标题命中加权」的意图（旧版仅 +3 且只判标题是否含 token）。
 *   4. 同义词扩展词降权：原始查询词权重 1.0、ALIASES 扩展词权重 0.5（见 buildWeightedTokens），
 *      避免「吉农→学校」这类泛化词让泛主题篇目（学校概况/学术规范）靠高频提及"学校"喧宾夺主。
 *   5. 检索文本仍为 `header + ' ' + para`，使标题/主题里的关键词也能为正文段落加分。
 *
 * 多样性保护：同一文档最多选取 `MAX_PER_DOC` 段进入 top-K（用已 picked 的 doc.file 计数控制），
 * 避免「新生手册」类大文档靠多段重复词霸占全部槽位、挤掉更相关的其它篇目，保证话题覆盖。
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

/** BM25-lite 长度归一化的基准长度（KB 段落平均字符数）。实测全库均值约 203（median 159 / p90 363），按语料标定：均值段落 norm≈1，仅明显偏长（>~360）被惩罚、偏短被抬升。 */
const AVG_LEN = 200;
/** 同一文档最多进入 top-K 的段落数，保证话题多样性、避免单篇垄断。 */
const MAX_PER_DOC = 2;

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

/** 带权重的检索词：原始查询词权重 1.0，同义词扩展词权重 0.5。 */
interface WeightedToken {
  token: string;
  weight: number;
}

/**
 * 构造带权重的检索词序列（去重）。
 *
 * 为什么降权同义词：ALIASES 里「吉农→学校/吉林农业大学」这类泛化词，会让
 * 「学校概况」「学术规范」等泛主题篇目仅凭高频提及"学校"就压过真正命中主题的篇目
 * （线上曾出现"问周边美食，学术规范篇混入 top 上下文"）。原始查询词是强信号（权重 1），
 * 扩展词只是召回兜底（权重 0.5），让精准命中主题的篇目排在前面。
 */
function buildWeightedTokens(q: string): WeightedToken[] {
  const original = new Set(tokenize(q));
  const all = tokenize(expandQuery(q));
  const seen = new Set<string>();
  const out: WeightedToken[] = [];
  for (const t of all) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push({ token: t, weight: original.has(t) ? 1 : 0.5 });
  }
  return out;
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
 * 计算 (段落, 文档) 相关性得分 —— BM25-lite。
 *
 * @param doc 所属文档（提供 header 用于标题/主题加权）
 * @param para 待打分的正文段落
 * @param tokens 带权重的检索词（原始查询词权重 1 / 同义词扩展词权重 0.5，已去重）
 * @returns 相关性得分（>=0）；当且仅当 0 表示该段落与查询完全无关
 */
function scoreParagraph(doc: KbDoc, para: string, tokens: WeightedToken[]): number {
  // 检索文本 = 标题 + 主题词 + 正文，使标题/主题里的关键词（如「周边美食」）也能为正文段落加分
  const searchText = `${doc.header} ${para}`;

  // 1. 次线性 TF：每个**命中**（count>0）token 累加 weight × (1 + log2(1 + count))。
  //    ⚠️ 必须判 count>0：否则未命中的 token 也会贡献权重，退化成「谁短谁赢」，与相关性无关。
  let tf = 0;
  for (const wt of tokens) {
    const count = countOccurrences(searchText, wt.token);
    if (count > 0) tf += wt.weight * (1 + Math.log2(1 + count));
  }
  if (tf === 0) return 0;

  // 3. 标题/主题加权：出现在 doc.header 的 token 按权重累加（保留并强化旧版标题加权）
  let titleHits = 0;
  for (const wt of tokens) if (doc.header.includes(wt.token)) titleHits += wt.weight;

  // 2. 长度归一化：长段落被惩罚；短段落不被过度奖励（下限 0.5 防止极短段落分数虚高）
  const lengthNorm = 0.5 + 0.5 * (para.length / AVG_LEN);

  return tf / lengthNorm + titleHits * 2;
}

/**
 * 检索：返回注入模型的知识上下文 + 命中的来源列表。
 * @param query 用户问题
 * @param topK 最多选取的段落数
 * @param maxChars 上下文最大字符数
 */
export function retrieve(query: string, topK = 4, maxChars = 3500): Retrieved {
  const docs = loadDocs();
  const tokens = buildWeightedTokens(query);
  if (docs.length === 0 || tokens.length === 0) {
    return { context: '', sources: [] };
  }

  const scored: { doc: KbDoc; para: string; score: number }[] = [];
  for (const doc of docs) {
    for (const para of doc.paragraphs) {
      const score = scoreParagraph(doc, para, tokens);
      if (score > 0) scored.push({ doc, para, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const picked: { doc: KbDoc; para: string }[] = [];
  const seen = new Set<string>();
  let chars = 0;
  const perDoc = new Map<string, number>();
  for (const s of scored) {
    if (picked.length >= topK) break;
    const key = `${s.doc.file}#${s.para.slice(0, 24)}`;
    if (seen.has(key)) continue; // 同文档重复段落去重
    if ((perDoc.get(s.doc.file) ?? 0) >= MAX_PER_DOC) continue; // 每文档多样性上限
    if (chars + s.para.length > maxChars && picked.length > 0) continue;
    const para = picked.length === 0 && chars + s.para.length > maxChars ? s.para.slice(0, maxChars) : s.para;
    picked.push({ doc: s.doc, para });
    chars += para.length;
    seen.add(key);
    perDoc.set(s.doc.file, (perDoc.get(s.doc.file) ?? 0) + 1);
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
