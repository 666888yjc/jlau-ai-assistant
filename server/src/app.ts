import express, { Express } from 'express';
import { config } from './config';
import { chatHandler } from './routes/chat';
import { feedbackHandler } from './routes/feedback';
import { handoffHandler } from './routes/humanHandoff';
import { scenariosHandler } from './routes/scenarios';
import { featuresHandler } from './routes/features';
import { ticketHandler } from './routes/ticket';
import { rumHandler } from './routes/rum';
import { errorHandler } from './middleware/errorHandler';
import { asyncHandler } from './middleware/asyncHandler';
import {
  adminFeedbackListHandler,
  adminKbRefreshHandler,
  adminLoginHandler,
  adminLogoutHandler,
  requireAdmin,
} from './routes/admin';

/**
 * 仅做装配：挂载中间件 + 端点 + 全局异常兜底。不含任何业务逻辑。
 * 端点严格对应 openapi.yaml（路径均带 /api/v1 前缀），另加两个基建端点：
 *   POST /api/v1/ticket —— 匿名票据签发（SEC-1）
 *   POST /api/v1/rum    —— 埋点收集（MAINT-1）
 */
export function createApp(): Express {
  const app = express();

  /**
   * CORS（SEC-2）。
   *
   * 策略取决于是否配置了 CORS_ALLOW_ORIGINS：
   *  - **未配置（默认）**：沿用既有的 `*` 放行。生产形态是静态托管与云函数同域，
   *    CORS 本就不参与鉴权；而一个配错的空白名单会把所有人挡在门外，
   *    代价远大于收益（报到日「回滚优先于修复」原则）。
   *  - **已配置**：严格白名单回显 Origin，非白名单的预检直接 403。
   *
   * 本服务不依赖 cookie 凭证，故不下发 Access-Control-Allow-Credentials。
   */
  app.use((req, res, next) => {
    const whitelist = config.cors.allowOrigins;
    const origin = req.headers.origin;

    if (whitelist.length === 0) {
      res.header('Access-Control-Allow-Origin', '*');
    } else if (typeof origin === 'string' && whitelist.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      // 回显 Origin 时必须带 Vary，否则 CDN 会把 A 站的响应缓存给 B 站
      res.header('Vary', 'Origin');
    } else if (typeof origin === 'string') {
      // 有 Origin 且不在白名单：预检直接拒，非预检不下发 ACAO（浏览器会自行拦截）
      if (req.method === 'OPTIONS') {
        res.status(403).end();
        return;
      }
    }
    // 无 Origin 头（同源请求 / curl / 服务端调用）不受白名单影响，保持放行

    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    // 🔒 保护对象：本行只允许追加 X-Admin-Token（方案 A A-4），不得改动其他头
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Ticket, X-Request-Id, X-Admin-Token');
    res.header('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // 显式 UTF-8 解析 JSON 请求体：body-parser 的 charset 自动探测在部分环境下会把中文按 latin1 解，
  // 导致中文乱码、检索零命中。这里强制按 UTF-8 收体，确保中文 query 正确进入业务逻辑。
  app.use((req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (req.method !== 'POST' || !ct.includes('application/json')) return next();
    let raw = '';
    req.setEncoding('utf-8');
    req.on('data', (chunk: string) => {
      if (raw.length > 256 * 1024) {
        raw = '';
        req.removeAllListeners('data');
        next(new Error('payload too large'));
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        req.body = {};
      }
      next();
    });
  });

  app.get('/healthz', (_req, res) => {
    res.json({ code: 0, data: { status: 'ok' }, message: 'ok' });
  });

  app.post('/api/v1/chat', asyncHandler(chatHandler));
  app.post('/api/v1/feedback', asyncHandler(feedbackHandler));
  app.post('/api/v1/human-handoff', asyncHandler(handoffHandler));
  app.get('/api/v1/scenarios', asyncHandler(scenariosHandler));
  app.get('/api/v1/features', asyncHandler(featuresHandler));

  // 基建端点（本次新增）
  app.post('/api/v1/ticket', asyncHandler(ticketHandler));
  app.post('/api/v1/rum', asyncHandler(rumHandler));

  // 管理端端点（方案 A，A-1~A-4）；除 login 外均过 requireAdmin
  app.post('/api/v1/admin/login', asyncHandler(adminLoginHandler));
  app.post('/api/v1/admin/logout', requireAdmin, asyncHandler(adminLogoutHandler));
  app.get('/api/v1/admin/feedback', requireAdmin, asyncHandler(adminFeedbackListHandler));
  app.post('/api/v1/admin/kb/refresh', requireAdmin, asyncHandler(adminKbRefreshHandler));

  app.use(errorHandler);

  return app;
}
