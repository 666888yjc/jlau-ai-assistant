#!/usr/bin/env node
/**
 * 极简静态文件服务器 + API 反向代理（QA 移动端测试专用，仅本地）
 * 用途：托管 web/dist 的 SPA 产物供 Playwright 移动设备仿真加载。
 * 特性：
 *   - SPA fallback（未命中文件一律回 index.html），零依赖，零 LLM 调用
 *   - /api/* 流式反代到本地 mock 后端（默认 4100）。必须用真代理而非
 *     Playwright page.route：后者会缓冲响应体，SSE 流式会被破坏。
 *
 * 用法： node static-server.mjs <root> <port> [apiTarget]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.');
const PORT = Number(process.argv[3] || 4200);
const API_TARGET = process.argv[4] || 'http://localhost:4100';

// 安全护栏：代理目标只允许本地
{
  const host = new URL(API_TARGET).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.error(`✗ 拒绝启动：API 代理目标 ${host} 非本地地址。`);
    process.exit(1);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/** /api/* 流式反向代理到本地 mock 后端 —— 保持 SSE 逐块下发不缓冲 */
function proxyApi(req, res) {
  const target = new URL(req.url, API_TARGET);
  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res); // 流式透传，SSE 不缓冲
    },
  );
  upstream.on('error', (e) => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`proxy error: ${e.message}`);
  });
  // 客户端断开时同步中断上游，模拟真实断连传导
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  if (urlPath.startsWith('/api/') || urlPath === '/healthz') {
    proxyApi(req, res);
    return;
  }

  // 防目录穿越
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(ROOT, safe);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  // SPA fallback
  if (!fs.existsSync(filePath)) {
    filePath = path.join(ROOT, 'index.html');
  }

  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  } catch (e) {
    res.writeHead(500).end(String(e?.message || e));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[static] serving ${ROOT} at http://localhost:${PORT}`);
  console.log(`[proxy]  /api/* -> ${API_TARGET}`);
});
