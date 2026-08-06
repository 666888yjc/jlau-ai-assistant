/**
 * 请求幂等键生成（API-1）—— UUID v4。
 *
 * 为什么不装 `uuid` 包：+4KB 换一个现代浏览器已经原生提供的能力，
 * 在 ≤150KB 首屏预算下不划算（架构 §2.2）。这里手写回退，合计不到 20 行。
 *
 * 用途：同一轮对话的首发与全部重试**复用同一个 request_id**，
 * 服务端 idempotency 中间件据此保证 LLM 只被真正调用一次 —— 否则重试 2 次
 * 就是 3 倍上游成本，报到日峰值下这笔账很可观。
 */

/** crypto 能力的最小接口。抽出来是为了单测能注入假实现，覆盖两条分支。 */
export interface UuidSource {
  randomUUID?: () => string;
  getRandomValues?: <T extends Uint8Array>(array: T) => T;
}

const HEX: string[] = [];
for (let i = 0; i < 256; i++) HEX.push((i + 0x100).toString(16).slice(1));

/** 用 16 字节随机数按 RFC 4122 v4 拼装 UUID 字符串。 */
function bytesToUuid(b: Uint8Array): string {
  return (
    HEX[b[0]] + HEX[b[1]] + HEX[b[2]] + HEX[b[3]] + '-' +
    HEX[b[4]] + HEX[b[5]] + '-' +
    HEX[b[6]] + HEX[b[7]] + '-' +
    HEX[b[8]] + HEX[b[9]] + '-' +
    HEX[b[10]] + HEX[b[11]] + HEX[b[12]] + HEX[b[13]] + HEX[b[14]] + HEX[b[15]]
  );
}

/**
 * 生成 UUID v4。
 *
 * 三级降级：
 *  1. `crypto.randomUUID()` —— 现代浏览器 + 安全上下文（HTTPS/localhost）；
 *  2. `crypto.getRandomValues()` —— 非安全上下文下 randomUUID 不可用，但它通常还在；
 *  3. `Math.random()` —— 极旧 webview 兜底。幂等键不是安全凭据，
 *     只要在单个会话内不撞就够用，弱随机可接受。
 *
 * @param source 注入的随机源，默认取全局 crypto
 */
export function newRequestId(source?: UuidSource): string {
  const c: UuidSource | undefined =
    source ?? (typeof globalThis !== 'undefined' ? (globalThis.crypto as UuidSource | undefined) : undefined);

  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // 按 RFC 4122 打上版本位与变体位
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  return bytesToUuid(bytes);
}

/** 会话 ID（埋点用，非用户标识）。前缀便于在日志里一眼区分。 */
export function newSessionId(source?: UuidSource): string {
  return 's-' + newRequestId(source).replace(/-/g, '').slice(0, 16);
}

/** 校验是否为合法 UUID v4 字符串，服务端幂等中间件的前端侧对齐检查。 */
export function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
