import { NextFunction, Request, Response } from 'express';
import { ErrorCode, sendError } from '../errors';

/** 全局异常兜底：未捕获的同步/异步错误统一返回 5002（内部错误）。 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;
  const message = err instanceof Error ? err.message : '服务端内部错误';
  sendError(res, ErrorCode.INTERNAL_ERROR, message);
}
