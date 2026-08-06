# 吉小农薄壳后端 —— CloudBase 部署详解

本文补充 `README.md` 的部署章节，聚焦 CloudBase HTTP 云函数形态，并明确 SSE 真流式的关键取舍。

## 1. 两种云函数形态

### 形态 A：缓冲适配器（现状，`cloud-functions/api/index.js`）
- 复用 `server/dist` 的 Express 应用，将云函数事件翻译为 Node 请求/响应。
- **行为**：响应体被缓冲，`res.end()` 后整体以 `base64` 返回（`isBase64Encoded:true`）。
- **影响**：chat 的 SSE 在该形态下**不是真流式**——前端会一次性收到完整答案，首字延迟变高、无逐字效果。普通 JSON 端点不受影响。
- **适用**：先快速跑通、或非流式为主的场景。

### 形态 B：生产真流式（推荐，透传式 HTTP 函数入口）
- 将**编译后的 Express 应用直接挂 CloudBase HTTP 函数**，`exports.main(event, context, req, res)` 透传 `req/res`，让 Express 直接写回 HTTP 函数的响应流。
- **行为**：chunked 真流式，逐字推送 SSE，首字延迟低（与本地一致）。
- **代价**：需改写云函数入口为透传式（见 §4 示例），并确保 CloudBase HTTP 函数允许流式响应。

> 结论：MVP 上线若要求「首字 < 3s + 逐字流式」（AC-06），务必走**形态 B**；形态 A 仅作兼容/兜底。

## 2. 构建与打包（两种形态共用）

```bash
# 1) 编译后端
cd server && npm run build        # 产出 server/dist（commonjs）

# 2) 打包为云函数目录（示例目录函数根 fx/）
mkdir -p fx && cp -r server/dist fx/dist
cp -r server/node_modules fx/node_modules     # 必须含 express
cp cloud-functions/api/index.js fx/index.js   # 或形态 B 的入口（见 §4）
# fx/package.json 依赖 express（沿用 cloud-functions/api/package.json）
```

## 3. 配置环境变量（云函数控制台）

| 变量 | 值 |
|------|----|
| `COZE_API_TOKEN` | 真实 token（必填，勿入库） |
| `COZE_BOT_ID` | 真实 bot_id（必填） |
| `COZE_API_BASE` | `https://api.coze.cn` |
| `STORE_KIND` | `cloudbase` |
| `PORT` | 由平台注入，忽略 |

## 4. 形态 B 透传入口示例（真流式）

将以下文件作为云函数 `index.js`（替代 `cloud-functions/api/index.js` 的缓冲实现）：

```js
'use strict';
const path = require('path');

// 编译后的 Express 应用直接挂 HTTP 函数，透传 req/res 实现真流式 SSE。
module.exports.main = async (event, context, req, res) => {
  const { createApp } = require(path.join(__dirname, 'dist', 'app'));
  const app = createApp();
  // 由 CloudBase HTTP 函数提供原生 req/res，Express 直接写回流。
  return app(req, res);
};
```

> 注意：具体 `main(event, context, req, res)` 签名以 CloudBase 当前 HTTP 函数运行时为准；若平台仅提供 `event` 形态，则需用形态 A 的缓冲适配器。部署前在 CloudBase 控制台确认 HTTP 函数是否支持流式响应头（`Transfer-Encoding: chunked`）。

## 5. 前端静态托管

```bash
cd web && npm run build         # 产出 web/dist
```
将 `web/dist` 部署到 CloudBase 静态网站，与云函数**同源**（如 `https://<env>.tcb.qcloud.la`）。前端 `BASE='/api/v1'` 同源调用云函数，无需 CORS。

## 6. 数据存储（STORE_KIND=cloudbase）

按 `db-schema.md` 在 CloudBase 文档存储建集合：
- `scenarios`（驱动分类入口，MVP 仅 `baodao`）
- `features`（猜你想问卡片）
- `feedback`（答案反馈队列）
- `human_handoff`（兜底转人工队列）

首次运行由 `getStore()` 灌种子（同 `server/data/*.json` 结构）。

## 7. 回滚

- 保留历次 `fx/` 部署包与 CloudBase 云函数版本号，异常时平台回退。
- 前端静态资源保留上一版本目录，异常切回。

## 8. 健康检查

部署后验证：`GET /healthz` 应返回 `{"code":0,"data":{"status":"ok"},"message":"ok"}`。
