import { randomBytes } from 'crypto';

/** 生成带前缀的短随机 ID（与 openapi.yaml 示例风格一致：fb-/hh-/m-）。 */
export function shortId(prefix: string, bytes = 4): string {
  return prefix + randomBytes(bytes).toString('hex').slice(0, bytes * 2);
}

export const newFeedbackId = (): string => shortId('fb-', 3); // fb- + 6 hex
export const newHandoffId = (): string => shortId('hh-', 3); // hh- + 6 hex
export const newMessageId = (): string => shortId('m-', 2); // m- + 4 hex
