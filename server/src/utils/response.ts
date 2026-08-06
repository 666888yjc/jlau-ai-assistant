import { Response } from 'express';
import { ErrorCode } from '../errors';

/** 成功响应：统一结构 { code:0, data, message }。 */
export function ok(res: Response, data: unknown, message = 'ok'): void {
  res.json({ code: ErrorCode.SUCCESS, data, message });
}

/** 推送一条 SSE 事件（event: <name>\ndata: <json>\n\n）。 */
export function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
