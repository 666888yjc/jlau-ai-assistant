import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * 包装路由处理器：把 rejection 转发给 Express 错误中间件（errorHandler），
 * 避免 Express 4 不捕获 async rejection 导致 unhandledRejection 崩进程（线上 443 根因之一）。
 * 兼容同步（返回 void）与异步（返回 Promise）两种 handler。
 * 用法：`app.get('/api/v1/scenarios', asyncHandler(scenariosHandler))`。
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
