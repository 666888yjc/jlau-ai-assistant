import express, { Express } from 'express';
import { chatHandler } from './routes/chat';
import { feedbackHandler } from './routes/feedback';
import { handoffHandler } from './routes/humanHandoff';
import { scenariosHandler } from './routes/scenarios';
import { featuresHandler } from './routes/features';
import { errorHandler } from './middleware/errorHandler';

/**
 * 仅做装配：挂载中间件 + 5 个端点 + 全局异常兜底。不含任何业务逻辑。
 * 端点严格对应 openapi.yaml（路径均带 /api/v1 前缀）。
 */
export function createApp(): Express {
  const app = express();

  // CORS：允许跨域访问（微信 webview / iframe / 第三方域名嵌入场景页都算跨域）。
  // 本服务不依赖 cookie 凭证，开放 * 安全；跨域时浏览器会先发 OPTIONS 预检，这里直接 204 放行。
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

  app.post('/api/v1/chat', chatHandler);
  app.post('/api/v1/feedback', feedbackHandler);
  app.post('/api/v1/human-handoff', handoffHandler);
  app.get('/api/v1/scenarios', scenariosHandler);
  app.get('/api/v1/features', featuresHandler);

  app.use(errorHandler);

  return app;
}
