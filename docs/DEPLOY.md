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

---

# B5 增量（2026-08-07）交付登记

## 9. 本地门禁（SEC-7 / MAINT-5）

工程无远端（`git remote -v` 为空），云端 CI 无法生效。**发布前置步骤（人工门禁）**：

```bash
# 1) 确保 web 依赖实装（jsdom 已声明在 package.json，QA 套件依赖它）
cd web && npm i

# 2) 跑本地全量门禁（typecheck→test→test:qa→build→size→scan-secrets→verify-protection）
bash scripts/gate.sh
# 等价：cd web && npm run gate   或   make gate
# test:qa 未实装 jsdom 时可用 bash scripts/gate.sh --skip-qa 临时绕过，交付前必须全量跑
```

- 门禁任何一步失败即红灯，不得发布。
- 接远端后 `.github/workflows/ci.yml` 自动生效（与 gate.sh 镜像，改一边必须改另一边）。
- `scripts/scan-secrets.mjs` 独立用法：`node scripts/scan-secrets.mjs --dir web/dist`。

### 9.1 test:qa 工具链缺口（2026-08-07 实测登记）

`web/test/`（13 个 QA 用例，已入库）import 了 `@testing-library/react` / `@testing-library/jest-dom` /
`@testing-library/user-event`，但这三个包**从未声明在 web/package.json**（历史 QA 临时安装遗留，
与 jsdom 同类问题；jsdom 已在 T01 补声明，testing-library 尚未补）。因此在 `npm i` 之前
`npm run test:qa` 会红；补法：`cd web && npm i -D @testing-library/react@^14 @testing-library/jest-dom@^6 @testing-library/user-event@^14`，
然后 `npm run test:qa` 全绿。**此项为部署前人工步骤，B5 不新增测试依赖（克制原则）。**

## 10. CSP enforce 升级（SEC-2b）

`cloudbaserc.json` 的 CSP 已由 `content-security-policy-report-only` 升级为
`content-security-policy`（值不变，含 `frame-ancestors 'self'`）。

### 10.1 升级前置条件（全部满足才可部署 enforce）

1. B1-B4 Report-Only 上线期间**无**「页面样式/图片/接口被拦」类用户反馈与 QA 走查负面记录；
2. 生产构建在 **Chrome（桌面+移动）、Safari iOS、微信 WebView** 三端手动走查
   **无 CSP violation 控制台报错**（重点核对：`img-src https:` 外链图、`style-src 'unsafe-inline'`
   内联样式、`connect-src 'self'` 的 `/api/v1/*` 与 RUM 上报）；
3. 部署后 `bash scripts/verify-headers.sh --base-url <线上URL>` 对 enforce 态**零告警**。

> 已知缺口：CSP 未配置 `report-uri`/`report-to`（Q6 控制台能力限制），violation 只能靠
> 浏览器控制台人工观察，没有自动报表。「无误杀」的确认方式是三端走查 + 无用户反馈。

### 10.2 回滚预案（≤10min）

1. `cloudbaserc.json` 的 CSP header key 改回 `content-security-policy-report-only`（值不变）；
2. 重新部署 / 刷新 CDN；
3. `bash scripts/verify-headers.sh --base-url <线上URL>` 复验 report-only 态（脚本对 report-only 会告警，属预期）。

## 11. UX-8/API-6「继续生成」约定（纯前端续接，服务端零改动）

- 草稿载体：前端 UIMessage 中 `status==='error'` 或 `stopped===true` 且 content 非空的
  assistant 气泡；不落服务端，随既有 250ms 防抖落盘持久化。
- 续接请求：`POST /api/v1/chat` 请求体与普通提问同构（`message`=原问题原文、
  `history`=**排除草稿对之后**的历史、`request_id`=新 UUID）。
- 幂等：旧 request_id 在客户端断开时已被服务端 `settle('aborted')` 释放，新 id 正常 claim。
- 结果合并：新流首 token 到达清空草稿气泡内容重新累积（replace-on-first-token），
  最终单气泡完整答案、无可见重复。
- 埋点：续接发起上报 `chat_continue`（字段与 `chat_send` 同构）。

## 12. 部署后人工走查清单（B5）

- [ ] `bash scripts/gate.sh` 全绿（发布前置）
- [ ] 停止生成后气泡出现「继续生成」按钮；点击后同一气泡续接为完整答案，无重复气泡
- [ ] 超时错误卡有草稿时主按钮为「继续生成」，无草稿仍为「重试」
- [ ] 「换个问法」后连续失败仍能触发人工兜底卡（连击保留）
- [ ] 100 条消息长会话滚动 FPS 抽样 ≥50（PERF-6）
- [ ] 三端（Chrome/Safari iOS/微信 WebView）无 CSP violation
- [ ] `bash scripts/verify-headers.sh --base-url <线上URL>` 零 FAIL
