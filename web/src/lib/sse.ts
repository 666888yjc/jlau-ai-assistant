/**
 * SSE 帧解析器（ERR-3 / MAINT-2）—— 纯函数，零副作用。
 *
 * ## 为什么单独抽出来
 * 原实现内嵌在 `api.ts:81-119`，与 fetch 耦合，无法单测，且有两处硬伤：
 *
 *  1. `buffer.indexOf('\n\n')` 只认 LF 空行，遇到 `\r\n\r\n`（CRLF 网关/代理很常见）
 *     整条流会被当成一个永不结束的块，表现为「一直转圈然后一次性吐出」。
 *  2. `catch {}` **静默丢弃解析失败的帧**。这是本产品唯一会造成线下实体损失的缺陷：
 *     学生照着缺了片段的回答执行，可能漏带材料或跑错地点。
 *     本模块把「丢帧」升级为**可观测事件**：计数 + 原因 + 片段，交由调用方上报与提示。
 *
 * ## 硬约束
 * 本文件**禁止** import react、禁止碰 fetch / window / document / localStorage。
 * 输入是字符串，输出是数据结构，仅此而已。这是内核层可测性的结构保障（架构 §7.1），
 * 也是 vitest 能用 node 环境跑的前提。
 *
 * ## 行分隔符处理策略
 * 按 SSE 规范（WHATWG），行终止符可以是 CRLF、LF 或单个 CR，事件以空行分隔。
 * 与其去 indexOf 三种组合（还要处理它们互相嵌套的边界），不如**先归一化再切分**：
 *   ① 若缓冲区结尾是孤立的 `\r`，暂扣该字符 —— 无法判断它是「单 CR 行尾」
 *      还是「CRLF 被 chunk 边界劈开的前半个」，等下一个 chunk 到达再决定；
 *   ② 归一化 `\r\n` → `\n`、`\r` → `\n`；
 *   ③ 按 `\n\n` 切块，最后一段留在缓冲区等后续 chunk。
 * 这样跨 chunk 边界、混合行尾都能正确处理，代价只是 CR-only 流式下延迟一个 chunk
 * （真实服务端不会用 CR-only，可接受）。
 */

import type { SSEEvent } from '../types/api';

/** 服务端约定的事件名（openapi.yaml）。用于在缺少 data.type 时补全。 */
const KNOWN_EVENTS = ['token', 'sources', 'fallback', 'done', 'error'] as const;

/** 降级帧的原因分类。用于埋点区分「网关截断」还是「协议不匹配」。 */
export type DegradeReason =
  | 'invalid-json' // data 存在但 JSON.parse 抛错（最常见：被截断）
  | 'non-object' // JSON 合法但不是对象（如 "null" / 数字 / 数组）
  | 'unknown-shape'; // 是对象但既无 type 字段、事件名也不认识

/**
 * 一条被判定为「降级」的帧。
 *
 * ⚠️ 隐私红线：`raw` 可能包含回答正文片段，**只允许用于本地诊断**。
 * 埋点上报（analytics.ts）只允许带计数与 reason，严禁带 raw（Q4 零文本字段）。
 */
export interface DegradedFrame {
  reason: DegradeReason;
  /** 原始片段，已截断到 200 字符，避免诊断日志爆量 */
  raw: string;
}

/** 解析器状态。由调用方持有并在多次 feed 之间传递，模块本身不存全局状态。 */
export interface ParserState {
  /** 尚未构成完整事件块的残留文本 */
  buffer: string;
  /** 最近一次 `id:` 字段值（SSE 断线重连语义，本项目暂不消费，仅记录） */
  lastEventId: string;
  /** 最近一次 `retry:` 字段值，毫秒；服务端未下发时为 null */
  retryMs: number | null;
  /** 累计成功解析的事件数 */
  totalEvents: number;
  /** 累计降级帧数 */
  totalDegraded: number;
}

/** 单次 feed / finish 的产出。 */
export interface ParsedResult {
  /** 本次新解析出的事件，按到达顺序 */
  events: SSEEvent[];
  /** 本次新增的降级帧数量 */
  degradedCount: number;
  /** 本次新增降级帧的明细（仅本地诊断用） */
  degraded: DegradedFrame[];
}

/** 创建一个干净的解析器状态。 */
export function createParser(): ParserState {
  return {
    buffer: '',
    lastEventId: '',
    retryMs: null,
    totalEvents: 0,
    totalDegraded: 0,
  };
}

/** 归一化行终止符：CRLF / CR 统一成 LF。 */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** 截断诊断片段，避免超长内容进日志。 */
function clip(text: string, max = 200): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/**
 * 解析单个事件块（块内已归一化为 LF，且不含空行分隔符）。
 * 返回 event 或 degraded 之一；两者都为空表示这是注释/心跳块，正常跳过。
 */
function parseBlock(
  block: string,
  state: ParserState,
): { event?: SSEEvent; degraded?: DegradedFrame } {
  let eventName = '';
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    // 空行：块内不应出现，出现也直接跳过
    if (line === '') continue;
    // 以冒号开头 = 注释行（服务端常用作 keep-alive 心跳），按规范忽略
    if (line.startsWith(':')) continue;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    // 规范：只剥离值前的**一个**空格，不能用 trim()，否则多行文本 data 会被破坏
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    switch (field) {
      case 'event':
        eventName = value.trim();
        break;
      case 'data':
        dataLines.push(value);
        break;
      case 'id':
        // 规范：含 NUL 的 id 必须忽略
        if (!value.includes('\u0000')) state.lastEventId = value;
        break;
      case 'retry': {
        const ms = Number(value);
        if (Number.isInteger(ms) && ms >= 0) state.retryMs = ms;
        break;
      }
      default:
        // 未知字段按规范忽略，且**不计入降级** —— 它是协议演进的正常情况，
        // 与「内容丢失」是两回事，混在一起会让 degraded 指标失去意义
        break;
    }
  }

  // 没有 data 行：纯注释块 / 只有 id 或 retry 的控制块，属正常流量
  if (dataLines.length === 0) return {};

  // 规范：多行 data 用 \n 拼接（对 JSON 而言换行是无意义空白，不影响解析）
  const dataStr = dataLines.join('\n');

  // 空 data 是合法的心跳形式（`data:` 后无内容），不算丢帧
  if (dataStr.trim() === '') return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(dataStr);
  } catch {
    // ⚠️ 这里正是原实现 `catch {}` 静默吞掉的位置。现在升级为可观测降级帧。
    return { degraded: { reason: 'invalid-json', raw: clip(dataStr) } };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { degraded: { reason: 'non-object', raw: clip(dataStr) } };
  }

  const obj = parsed as Record<string, unknown>;

  // data 自带 type：直接采信（服务端 openapi.yaml 契约）
  if (typeof obj.type === 'string' && obj.type !== '') {
    return { event: obj as unknown as SSEEvent };
  }

  // data 无 type，但 event: 行给出了已知事件名：补全后放行。
  // 这一步是健壮性收益：网关改写或服务端小版本差异导致 type 缺失时，
  // 内容仍能完整呈现给学生，而不是整帧丢掉。
  if ((KNOWN_EVENTS as readonly string[]).includes(eventName)) {
    return { event: { ...obj, type: eventName } as unknown as SSEEvent };
  }

  return { degraded: { reason: 'unknown-shape', raw: clip(dataStr) } };
}

/** 把一组事件块喂进解析流程，累加计数并返回本次产出。 */
function consumeBlocks(blocks: string[], state: ParserState): ParsedResult {
  const events: SSEEvent[] = [];
  const degraded: DegradedFrame[] = [];

  for (const block of blocks) {
    if (block.trim() === '') continue;
    const r = parseBlock(block, state);
    if (r.event) events.push(r.event);
    if (r.degraded) degraded.push(r.degraded);
  }

  state.totalEvents += events.length;
  state.totalDegraded += degraded.length;
  return { events, degradedCount: degraded.length, degraded };
}

/**
 * 投喂一个网络 chunk（已 decode 为字符串），解析出其中的完整事件。
 * 不完整的尾部会留在 state.buffer，等下一次 feed 或 finish。
 */
export function feed(state: ParserState, chunk: string): ParsedResult {
  if (chunk === '') return { events: [], degradedCount: 0, degraded: [] };

  state.buffer += chunk;

  // 结尾孤立 CR：可能是被 chunk 边界劈开的 CRLF 前半个，暂扣待定
  let work = state.buffer;
  let held = '';
  if (work.endsWith('\r')) {
    held = '\r';
    work = work.slice(0, -1);
  }

  const parts = normalizeEol(work).split('\n\n');
  // 最后一段一定不完整（没有遇到分隔符），退回缓冲区
  state.buffer = (parts.pop() ?? '') + held;

  return consumeBlocks(parts, state);
}

/**
 * 流结束时调用：把缓冲区里最后一段没有以空行收尾的内容也解析掉。
 * 服务端正常结束会带 `\n\n`，此时 buffer 为空，本函数是空操作；
 * 但连接被中途掐断时，最后半帧就在这里被识别为降级而不是凭空消失。
 */
export function finish(state: ParserState): ParsedResult {
  const rest = normalizeEol(state.buffer);
  state.buffer = '';
  if (rest.trim() === '') return { events: [], degradedCount: 0, degraded: [] };
  return consumeBlocks(rest.split('\n\n'), state);
}

/**
 * 便捷函数：一次性解析完整文本（主要给单测和离线诊断用）。
 * 生产链路走 createParser + feed + finish，以支持流式增量。
 */
export function parseAll(text: string): ParsedResult {
  const state = createParser();
  const a = feed(state, text);
  const b = finish(state);
  return {
    events: [...a.events, ...b.events],
    degradedCount: a.degradedCount + b.degradedCount,
    degraded: [...a.degraded, ...b.degraded],
  };
}
