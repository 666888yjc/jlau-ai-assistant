import { config } from '../config';
import { newMessageId } from '../utils/id';
import { retrieve, type KbSource } from '../kb/retrieve';
import { detectMapIntent, poiAround, route, resolvePoint, CAMPUS_CENTER } from '../tools/amap';
import type { ChatInput, Emit } from '../coze/client';

const SYSTEM_PROMPT = `你是「吉小农」，吉林农业大学官方新生 AI 助手，语气亲切、像学长学姐一样。
只依据下方【资料】回答新生关于报到、交通、住宿、饮食、生活服务、校园地标等问题。
规则：
1. 用简洁、友好的口语化中文回答，一次说清要点，不要堆术语。
2. 只要【资料】涉及所问主题（例如问美食/餐厅，资料里有「周边美食」篇），就必须直接引用资料中的具体名称作答——如店名、地点、人均价，绝对不许说「不太确定」「去探索」。资料只在该主题完全无任何内容时才可说不确定，并建议联系学工处（电话 0431-84532980）或到学校迎新点咨询，且仍不得编造。
3. 涉及费用、日期等具体数字，以学校最新《新生入学须知》为准，资料中的数字仅供参考。
4. 回答末尾加一句：「（由 AI 生成，仅供参考）」。
5. 若【资料】含【实时地图数据】（高德实时返回），必须优先引用其中的真实店名、距离、路线步骤作答，并与知识库内容互补，绝对禁止对其说「不太确定」——实时数据比静态资料更准。
6. 【实时地图数据】是回答路线/位置问题的唯一事实来源：只可依据数据中实际出现的方案、线路、站点、车次、距离、时长作答；某方案数据不可用时，如实告知用户「该方案数据暂不可用」；严禁编造数据中不存在的公交线路、站点、车次、票价、距离、时长。`;

/**
 * 根据消息意图调用高德工具获取实时地图数据，返回注入系统提示的上下文文本。
 * 非地图问题或调用失败均返回空串，不影响 KB 检索主流程。
 */
async function buildMapContext(message: string): Promise<string> {
  const intent = detectMapIntent(message);
  if (!intent) return '';
  try {
    if (intent.kind === 'poi') {
      const r = await poiAround(CAMPUS_CENTER, intent.keyword, 2000);
      if (!r.ok || !r.data || r.data.length === 0) {
        console.warn('[amap] poiAround 失败', r.error);
        return '';
      }
      const lines = r.data.slice(0, 8).map(
        (p, i) => `${i + 1}. ${p.name}${p.distance != null ? `（约 ${p.distance}m）` : ''}${p.address ? ` — ${p.address}` : ''}`,
      );
      return `【实时周边搜索：${intent.keyword}（以学校为中心 2km 内，按距离排序）】\n${lines.join('\n')}`;
    }
    if (intent.kind === 'route') {
      const from = await resolvePoint(intent.fromText);
      const to = await resolvePoint(intent.toText);
      // 同一组起终点并行拉取步行/公交/驾车三种方案：成功者全部注入，失败者如实说明（防 LLM 编造）
      const modes = ['walking', 'bus', 'driving'] as const;
      const settled = await Promise.allSettled(modes.map((mode) => route(from, to, mode)));
      const modeLabel: Record<string, string> = { walking: '步行', bus: '公交', driving: '驾车' };
      const sections: string[] = [];
      let anyOk = false;
      settled.forEach((res, idx) => {
        const mode = modes[idx];
        const label = modeLabel[mode] ?? mode;
        if (res.status === 'rejected' || !res.value.ok || !res.value.data) {
          const err = res.status === 'rejected' ? String(res.reason) : (res.value.error ?? '未知错误');
          console.warn('[amap] route 失败', err);
          sections.push(`【${label}方案】数据不可用（${err}）。`);
          return;
        }
        anyOk = true;
        const rp = res.value.data;
        const steps = rp.steps
          .filter((s) => s.instruction)
          .map((s, i) => `${i + 1}. ${s.instruction}（约 ${Math.round(s.distance)}m）`)
          .join('\n');
        sections.push(
          `【${label}方案】全程${(rp.distance / 1000).toFixed(1)}公里，约${Math.round(rp.duration / 60)}分钟。\n` +
            `步骤：${steps || '（无详细步骤）'}`,
        );
      });
      // 三种模式全部失败：与旧行为一致，返回空串走 KB 兜底
      if (!anyOk) return '';
      return `【实时路径规划：从${intent.fromText}到${intent.toText}，多方案对比】\n${sections.join('\n\n')}`;
    }
  } catch (e) {
    console.warn('[amap] buildMapContext 异常', e);
    return '';
  }
  return '';
}

/**
 * 地图类问题的来源：答案由高德实时数据（路径规划 / 周边搜索）驱动，
 * 而非本地知识库。地图驱动的问题只显示这一个高德来源，不再混入随机命中的 KB 芯片（避免「张冠李戴」）。
 * @returns 高德来源项（updated_at 取当天日期，实时数据即当日有效）
 */
function amapSource(): KbSource {
  return {
    title: '高德地图实时数据',
    url: 'https://lbs.amap.com/',
    updated_at: new Date().toISOString().slice(0, 10),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 把降级文本切成小段，模拟打字流式输出 */
function chunkText(text: string, size = 48): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [text];
}

/** 降级文案：资料摘录前缀 / 后缀 */
const KB_EXCERPT_PREFIX = '（AI 大模型暂时繁忙，已从学校资料库为你找到相关内容，以下为原文摘录，未做总结）\n\n';
const KB_EXCERPT_SUFFIX = '\n\n（资料库原文摘录，仅供参考）';
const KB_EMPTY_ANSWER =
  '抱歉，资料库暂时没有该问题的相关内容。建议联系学工处（电话 0431-84532980）或到学校迎新点咨询。（由 AI 生成，仅供参考）';
/** KB 检索原文的块格式：`【标题】\n正文` */
const KB_BLOCK_RE = /^【(.+?)】\n([\s\S]+)$/;

/**
 * 把知识库检索原文（形如 `【标题】\n段落\n\n【标题】\n段落`）整理成干净的资料摘录。
 * 匹配标题格式的块渲染为 `▸ 标题\n正文`；不匹配的块原样保留。
 * 正文会经 cleanExcerptBody 去掉模板元信息（主题/更新日期/适用对象/来源）、`---` 分隔线与首行标题，
 * 避免 LLM 繁忙降级时用户看到满屏编辑痕迹。
 */
export function formatKbExcerpt(context: string): string {
  const blocks = context
    .trim()
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  const rendered = blocks.map((block) => {
    const matched = KB_BLOCK_RE.exec(block);
    if (!matched) return block;
    const title = matched[1].trim();
    const bodyText = cleanExcerptBody(matched[2].trim());
    return `▸ ${title}\n${bodyText}`;
  });
  return rendered.join('\n\n');
}

/** KB 元信息行前缀（主题/更新日期/适用对象/来源），降级摘录中属于编辑痕迹，删除。 */
const EXCERPT_META_RE = /^(主题|更新日期|适用对象|来源)[:：]/;

/**
 * 摘录正文清理：去掉 KB 模板的元信息行、`---` 分隔线，以及开头紧跟标题的 `# 标题` 行，
 * 只保留可读正文（保留 `##` 小标题与「重要提示」等对用户有用的内容）。
 */
export function cleanExcerptBody(body: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    // 开头的空行与 `# 标题`（H1）行属于块头，跳过（标题已由 ▸ 呈现）；`##` 小节标题保留
    if (out.length === 0 && (t === '' || /^#\s/.test(t))) continue;
    if (EXCERPT_META_RE.test(t)) continue;
    if (/^-{3,}$/.test(t)) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

/**
 * 上游大模型持续不可用时的降级：把知识库检索原文整理成「资料摘录」作答。
 * 选课/保研/生活等场景已有真实 KB，降级后仍能给出可用内容，绝不向前端抛 5001。
 */
function emitKbFallback(context: string, sources: KbSource[], emit: Emit, input: ChatInput): void {
  const excerpt = context && context.trim().length > 0 ? formatKbExcerpt(context) : '';
  const answer = excerpt.length > 0 ? `${KB_EXCERPT_PREFIX}${excerpt}${KB_EXCERPT_SUFFIX}` : KB_EMPTY_ANSWER;
  for (const piece of chunkText(answer)) emit('token', { type: 'token', content: piece });
  if (sources.length > 0) emit('sources', { type: 'sources', items: sources });
  emit('done', {
    type: 'done',
    conversation_id: input.conversation_id,
    message_id: newMessageId(),
    finish_reason: 'stop',
  });
}

/** 单次尝试的结果分类：retryable = 限流/抖动值得重试；fatal = 鉴权/参数错误，重试无意义 */
type AttemptOutcome = 'retryable' | 'fatal';

/** SiliconFlow 免费档限流/额度错误码 */
const RATE_LIMIT_CODES = new Set<number>([429, 50609]);
/** 限流语义关键词（英文 + 中文） */
const RATE_LIMIT_TEXT_RE = /(rate.?limit|quota|too\s*many|limit|throttl|busy|限流|限额|额度|频繁|繁忙)/i;
/** 鉴权 / 参数类致命状态码，重试没有意义 */
const FATAL_STATUS = new Set<number>([400, 401, 403]);

const MAX_BACKOFF_MS = 5_000;
const BASE_BACKOFF_MS = 800;

/** 安全读取响应体文本，失败返回空串（绝不抛出，避免影响降级主流程） */
async function safeReadText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}

/** 解析 Retry-After 头（秒数或 HTTP-date），返回毫秒；无效返回 0 */
function parseRetryAfterMs(raw: string | null): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  const at = Date.parse(trimmed);
  if (Number.isFinite(at)) {
    const delta = at - Date.now();
    if (delta > 0) return delta;
  }
  return 0;
}

/**
 * 指数退避：第 i 次重试前等待 800 * 2^i ms；若上游给了 Retry-After 则取更大者。
 * 统一按 MAX_BACKOFF_MS 封顶：上游 Retry-After 超长时不再无限等待，
 * 保证「单次超时×次数 + 各次退避」总耗时上限 < 40s（SCF 函数层 45s 内留余量）。
 */
function backoffMs(attempt: number, retryAfterMs: number): number {
  const exponential = BASE_BACKOFF_MS * Math.pow(2, attempt);
  return Math.min(Math.max(exponential, retryAfterMs), MAX_BACKOFF_MS);
}

/** 状态码分类：429 / 5xx / 408 / 409 可重试；400/401/403 及其余 4xx 视为致命 */
function classifyStatus(status: number): AttemptOutcome {
  if (status === 429 || status === 408 || status === 409) return 'retryable';
  if (status >= 500) return 'retryable';
  if (FATAL_STATUS.has(status)) return 'fatal';
  if (status >= 400) return 'fatal';
  return 'retryable';
}

/**
 * HTTP 200 但响应体是 JSON —— SiliconFlow 限流时的典型形态（如 `{"code":50609,"message":"..."}`）。
 * 含限流错误码或限流语义 → 可重试；能识别出其它业务错误 → 致命；无法判定 → 保守重试。
 */
function classifyJsonErrorBody(bodyText: string): AttemptOutcome {
  if (!bodyText.trim()) return 'retryable';
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    // 解析失败无法判定，保守当成可重试的抖动
    return 'retryable';
  }
  if (!parsed || typeof parsed !== 'object') return 'retryable';
  const obj = parsed as Record<string, unknown>;
  const nested = (obj.error && typeof obj.error === 'object' ? obj.error : {}) as Record<string, unknown>;
  const rawCode = obj.code ?? obj.status_code ?? nested.code;
  const code = typeof rawCode === 'string' ? Number(rawCode) : typeof rawCode === 'number' ? rawCode : NaN;
  const message = [obj.message, nested.message, obj.msg].filter((m): m is string => typeof m === 'string').join(' ');

  if (Number.isFinite(code) && RATE_LIMIT_CODES.has(code)) return 'retryable';
  if (message && RATE_LIMIT_TEXT_RE.test(message)) return 'retryable';
  // 有明确错误标识但不是限流语义（如模型名非法、参数错误）→ 重试无意义
  if ((Number.isFinite(code) && code !== 0) || message) return 'fatal';
  return 'retryable';
}

function callSiliconFlow(apiKey: string, messages: unknown[], model: string): Promise<Response> {
  return fetch(`${config.siliconflowBaseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: 800,
      temperature: 0.2,
    }),
    // 线上 443/回答超时根因：上游 SiliconFlow 偶发「连接建立但首 token 迟迟不来」，
    // 无超时则服务端无限等待，直到 SCF 函数层 45s 掐断，而前端早已放弃。
    // 15s 超时（Node ≥17.3 支持 AbortSignal.timeout）把挂起变成可识别的网络异常：
    // 抛错后由降级链判为可重试，切备用模型（共 2 次尝试 = 主模型 + 备用模型各 1 次），
    // 耗尽后走 KB 降级。关键约束：该值**必须小于前端 TTFB 阈值 40s**（web/src/lib/config.ts），
    // 且 15s×2 + 退避(≤5s) = 35s < 40s，绝不被 SCF 45s 平台掐断。
    signal: AbortSignal.timeout(config.siliconflowTimeoutMs),
  });
}

/**
 * 真实 SiliconFlow（OpenAI 兼容）流式对话。
 * 后端注入本地知识库上下文 + 实时地图数据 + 防幻觉系统提示；前端不持有任何 key。
 * 健壮性：429/5xx 自动重试退避；上游持续不可用时降级为「知识库原文回答」，绝不向前端抛 5001。
 */
export async function streamSiliconFlow(input: ChatInput, emit: Emit): Promise<void> {
  const apiKey = config.siliconflowApiKey;
  if (!apiKey) {
    emit('error', { type: 'error', code: 5001, message: '对话服务未配置' });
    return;
  }

  const { context, sources } = retrieve(input.message);
  const mapCtx = await buildMapContext(input.message);
  // 地图驱动的问题只显示高德来源：答案由实时数据生成，混入随机命中的 KB 芯片会造成「张冠李戴」。
  // 该数组同时被主路径与降级路径（emitKbFallback）使用，两处行为保持一致。
  const finalSources: KbSource[] = mapCtx ? [amapSource()] : sources;
  const systemContent = `${SYSTEM_PROMPT}\n\n【资料】\n${context || '（暂无相关资料）'}${mapCtx ? '\n\n' + mapCtx : ''}`;
  const messages = [
    { role: 'system', content: systemContent },
    ...input.history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: input.message },
  ];

  // —— 模型降级链 + 指数退避 ——
  // 免费档 SiliconFlow 上 DeepSeek-V3 常被 50609「系统繁忙」限流（实测同一 key 下 Qwen2.5-72B 可用），
  // 因此按 [主模型, 备用模型] 顺序各尝试一次：主模型限流/繁忙/模型级错误 → 切备用继续出真回答，
  // 把「LLM 繁忙 → 掉进 KB 原文摘录」的概率大幅压低；仅 401/403（key 级鉴权）直接放弃（换模型无解）。
  // 仅当拿到真正可读的 SSE 流时才赋值；JSON 错误体一律视为失败进入下一个模型/降级。
  // 总耗时上限：15s×2 + 退避(≤5s) = 35s < 40s（前端 TTFB）且 < 45s（SCF 平台上限），绝不互相掐断。
  const models = [config.siliconflowModel];
  const backupModel = config.siliconflowModelBackup;
  if (backupModel && backupModel !== config.siliconflowModel) models.push(backupModel);

  let streamResp: Response | null = null;
  let retryAfterMs = 0;
  for (let idx = 0; idx < models.length; idx++) {
    const model = models[idx];
    const tag = `model=${model} (${idx + 1}/${models.length})`;
    if (idx > 0) await sleep(backoffMs(idx - 1, retryAfterMs));

    try {
      const resp = await callSiliconFlow(apiKey, messages, model);
      retryAfterMs = parseRetryAfterMs(resp.headers.get('retry-after'));
      const contentType = (resp.headers.get('content-type') ?? '').toLowerCase();
      const looksJson = contentType.includes('json');

      if (resp.ok && resp.body && !looksJson) {
        // text/event-stream（或未声明 content-type）且有 body → 流式成功
        streamResp = resp;
        break;
      }

      const detail = await safeReadText(resp);
      const outcome = resp.ok ? classifyJsonErrorBody(detail) : classifyStatus(resp.status);
      console.error(
        `[siliconflow] 上游异常 ${tag} status=${resp.status} ct=${contentType || 'n/a'} ` +
          `kind=${outcome} ${detail.slice(0, 300)}`,
      );

      // 鉴权类错误（key 无效/无权限）：备用模型同样无解，直接放弃
      if (resp.status === 401 || resp.status === 403) break;
    } catch (e) {
      // 网络层异常（超时/连接重置）属于抖动，切下一个模型
      console.error(`[siliconflow] 网络异常 ${tag} kind=retryable`, e);
    }
  }

  // 上游持续不可用 → 降级用知识库资料摘录回答（不报错）
  const respBody = streamResp?.body;
  if (!respBody) {
    emitKbFallback(context, finalSources, emit, input);
    return;
  }

  const reader = respBody.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let emittedAny = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            emit('token', { type: 'token', content: delta });
            emittedAny = true;
          }
        } catch {
          /* 忽略不完整分片 */
        }
      }
    }
  } catch {
    // 流中断：已出内容则尽力收尾，未出内容则降级
    if (emittedAny) {
      emit('done', {
        type: 'done',
        conversation_id: input.conversation_id,
        message_id: newMessageId(),
        finish_reason: 'stop',
      });
    } else {
      emitKbFallback(context, finalSources, emit, input);
    }
    return;
  }

  // 上游 200 但全程无 token（退化响应）→ 降级
  if (!emittedAny) {
    emitKbFallback(context, finalSources, emit, input);
    return;
  }

  if (finalSources.length > 0) {
    emit('sources', { type: 'sources', items: finalSources });
  }
  emit('done', {
    type: 'done',
    conversation_id: input.conversation_id,
    message_id: newMessageId(),
    finish_reason: 'stop',
  });
}
