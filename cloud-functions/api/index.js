'use strict';

/**
 * 吉小农薄壳后端 —— CloudBase 云函数入口（HTTP 触发形态）。
 *
 * 复用本地 Express 应用（server/dist/app），将云函数事件翻译为 Node 请求/响应。
 * 编译：cd server && npm run build  ->  产出 server/dist
 * 部署：将 server/dist + node_modules 与本文件一并上传为 HTTP 云函数。
 * 环境变量：COZE_API_TOKEN / COZE_BOT_ID / COZE_API_BASE / STORE_KIND=cloudbase。
 *
 * 说明：
 *  - 普通 JSON 端点（feedback / human-handoff / scenarios / features）完全兼容。
 *  - chat 的 SSE 在本适配器内为「缓冲后整体返回」；生产若需真流式，
 *    请将编译后的 Express 应用直接挂到 CloudBase HTTP 函数（exports.main 透传 req/res）形态。
 */

const path = require('path');
const { Readable } = require('stream');

function lowerHeaders(headers) {
  const out = {};
  if (headers) {
    for (const k of Object.keys(headers)) out[k.toLowerCase()] = headers[k];
  }
  return out;
}

function toQueryString(query) {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const k of Object.keys(query)) {
    const v = query[k];
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.append(k, v);
  }
  return p.toString();
}

async function main(event, _context) {
  const { createApp } = require(path.join(__dirname, '..', '..', 'server', 'dist', 'app'));
  const app = createApp();

  const reqHeaders = lowerHeaders(event && event.headers);
  const method = ((event && event.httpMethod) || 'GET').toUpperCase();
  const p = (event && event.path) || '/';
  const qs = toQueryString(event && event.queryString);
  const url = qs ? `${p}?${qs}` : p;
  const rawBody = event && event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body) : null;

  return new Promise((resolve) => {
    const chunks = [];
    let status = 200;
    const headers = {};

    const res = {
      statusCode: 200,
      headers,
      setHeader(k, v) {
        headers[String(k).toLowerCase()] = v;
      },
      getHeader(k) {
        return headers[String(k).toLowerCase()];
      },
      writeHead(code, h) {
        status = code;
        if (h) for (const k of Object.keys(h)) headers[String(k).toLowerCase()] = h[k];
        return this;
      },
      write(chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        return true;
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        const buf = Buffer.concat(chunks);
        resolve({
          statusCode: status,
          headers,
          body: buf.toString('base64'),
          isBase64Encoded: true,
        });
      },
    };

    const req = new Readable();
    req.method = method;
    req.url = url;
    req.headers = reqHeaders;
    req.socket = {
      remoteAddress: (reqHeaders['x-forwarded-for'] || '').split(',')[0].trim() || '127.0.0.1',
    };
    if (rawBody) req.push(rawBody);
    req.push(null);

    try {
      app(req, res);
    } catch (e) {
      resolve({
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ code: 5002, data: null, message: '服务端内部错误' })).toString('base64'),
        isBase64Encoded: true,
      });
    }
  });
}

module.exports = { main };
