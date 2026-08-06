# 吉农 AI 助手「吉小农」薄壳 MVP —— 部署与交付说明

面向吉林农业大学新生的自然语言对话式校园 AI 助手。MVP 锚定「新生报到答疑」单场景：前端薄壳 H5（Vite + React）经薄壳后端（Express + TypeScript）代理调用 Coze 智能体，SSE 流式返回答案并标注来源；无答案时兜底转人工。

> 状态：已通过 QA 验收（verdict=PASS，P0 归零，代码层 AC 全过）。本文件说明如何把产物变成**可部署、可验证、可交付**的包。

---

## 1. 技术栈与拓扑

| 层 | 技术 | 说明 |
|----|------|------|
| 薄壳前端 | Vite 5 + React 18 + TypeScript | H5，微信小程序风格；默认内置 mock 中间件，可切真实后端 |
| 薄壳后端 | Express 4 + TypeScript（tsx 运行 / tsc 编译） | 5 个端点 + SSE 代理；隐藏 Coze token |
| AI 大脑 | Coze（扣子）`POST /v3/chat` stream | 前端不持有 token；无 token 时自动启用内置 mock 流 |
| 部署 | CloudBase HTTP 云函数（Node.js 运行时） | 复用编译后的 Express；前端静态资源同源托管 |
| 存储 | 薄壳侧 JSON 文件 / CloudBase 文档存储 | scenarios / feedback / human_handoff / features |

**拓扑（本地 / 生产一致）**

```
浏览器 H5 (web :3000)
   └─ /api/* ─┬─ 本地 dev：Vite 内置 mock 中间件  (默认，无需后端)
              └─ 接真实后端：Vite proxy → server :3100 (同源，规避 CORS)
薄壳后端 (server :3100)
   └─ POST /api/v1/chat → Coze /v3/chat (SSE) → 转译为本产品事件序列
生产态：CloudBase 静态网站(前端) + HTTP 云函数(后端) 同源托管
```

---

## 2. 目录结构

```
jlau-ai-assistant/
├── README.md                # 本文件
├── Makefile                 # 一键 install / dev / verify / stop
├── .env.example             # 环境变量模板（Coze token 等，勿提交真实值）
├── .gitignore               # 排除 node_modules / .env / dist / 日志
├── scripts/
│   ├── verify-deploy.mjs    # 部署验证脚本（可复跑，验证 5 端点 + SSE）
│   └── start-dev.sh         # 本地一键起 server(3100) + web(3000)
├── server/                  # 薄壳后端（Express + TS）
│   ├── src/                 # 源码：app / routes / coze client / store / middleware
│   ├── data/                # 薄壳侧 JSON 存储（scenarios/feedback/...）
│   ├── dist/                # tsc 编译产物（部署用）
│   └── package.json
├── web/                     # 薄壳前端（Vite + React + TS）
│   ├── src/                 # 页面 / 组件 / lib(api.ts 含 SSE 解析)
│   ├── mock/                # 开发态内置 mock 中间件
│   ├── vite.config.ts       # 含「接真实后端」代理开关
│   └── package.json
├── cloud-functions/
│   └── api/
│       ├── index.js         # CloudBase HTTP 云函数入口（包装 server/dist）
│       └── package.json
└── docs/                    # 规格与部署文档
    ├── SPEC.md              # 产品规格（契约）
    ├── ARCHITECTURE.md      # 架构文档
    ├── openapi.yaml         # OpenAPI 3.0（5 端点）
    ├── db-schema.md         # 薄壳侧存储 schema
    └── DEPLOY.md            # CloudBase 部署详解 + 真流式说明
```

---

## 3. 本地快速开始

### 3.1 前置
- Node.js ≥ 18（验证环境 Node v22.22.2）
- 已安装依赖：`cd server && npm install` 与 `cd web && npm install`（或 `make install`）

### 3.2 启动后端（薄壳 server）
默认端口 3000，但会与前端 dev 3000 冲突，**本地联调建议后端走 3100**：

```bash
cd server
PORT=3100 npm start          # tsx 运行 src/index.ts（无 COZE_API_TOKEN 时自动 mock）
# 或生产编译态：npm run build && PORT=3100 node dist/index.js
```

启动后验证：
```bash
curl http://localhost:3100/healthz
# => {"code":0,"data":{"status":"ok"},"message":"ok"}
```

### 3.3 启动前端（默认 mock 模式，无需后端）
```bash
cd web
npm run dev                  # http://localhost:3000 ，内置 mock 覆盖 5 端点
```

### 3.4 前端接真实后端（最小联调）
设置 `VITE_USE_REAL_API=1` 让 Vite proxy 把 `/api` 同源转发到真实 server（默认 `http://localhost:3100`），并停用内置 mock：

```bash
cd web
VITE_USE_REAL_API=1 VITE_API_TARGET=http://localhost:3100 npm run dev
# 浏览器打开 http://localhost:3000/chat 即连真实后端
```
> 为什么用代理而非绝对 URL：浏览器同源策略 + 后端未开 CORS，代理以同源 `/api` 转发可规避跨域。生产态前端与云函数同源，无需 CORS。

### 3.5 一键启动
```bash
make dev          # 起 server(3100) + web(3000, mock)，自动等 healthz 就绪
make dev-real     # 起 server(3100) + web(3000, 接真实后端)
make stop         # 停止上述进程
```

---

## 4. Coze Token 接入（环境变量）

薄壳后端**不向前端暴露 token**，由服务端注入。无 `COZE_API_TOKEN` 时自动启用内置 mock 流，便于本地验证。

| 变量 | 含义 | 默认 | 说明 |
|------|------|------|------|
| `COZE_API_TOKEN` | Coze 平台 API Token | 空（空则强制 mock） | 生产必填，注入云端环境变量，**勿入库、勿暴露前端** |
| `COZE_BOT_ID` | Coze 智能体 bot_id | 空 | 生产必填 |
| `COZE_API_BASE` | Coze API 基址 | `https://api.coze.cn` | 国内版 `api.coze.cn` / 海外 `api.coze.com` |
| `COZE_USER_ID` | 透传用户标识 | `jlau-shell` | 统一身份占位，不采集隐私 |
| `COZE_MOCK` | 是否用 mock 流 | 无 token 时 `true` | `true`=mock；`false`=真实调用 Coze |
| `STORE_KIND` | 存储类型 | `json` | `json`=文件 / `cloudbase`=云存储 / `memory`=内存(测试) |
| `PORT` | 后端监听端口 | `3000` | **本地建议 3100** 避开前端冲突 |
| `DATA_DIR` | JSON 存储目录 | `server/data` | 容器/云函数可指向持久卷 |
| `RATE_WINDOW_MS` / `RATE_CHAT_MAX` / `RATE_DATA_MAX` | 限流窗口/聊天上限/数据上限 | `60000`/`20`/`60` | 防刷 |

本地注入示例（导出到 shell 后 `npm start`）：
```bash
export COZE_API_TOKEN="pat_xxxx"
export COZE_BOT_ID="123456789"
export COZE_MOCK=false
PORT=3100 npm start
```
可参考 `.env.example` 模板（复制为 `.env` 填入；注意 server 当前未内置 dotenv，需自行 `export` 或由平台注入）。

---

## 5. 端口与冲突说明

| 服务 | 默认端口 | 冲突风险 | 处理 |
|------|----------|----------|------|
| 前端 dev（web） | 3000 | — | 固定 3000 |
| 后端（server） | 3000 | 与前端 dev **冲突** | **本地改 3100**（见 §3.2） |
| 后端生产（云函数） | 由平台分配 | 无 | 前端同源调用 `/api` |

> QA 部署拓扑提示已确认：server 默认 3000 与 web dev 3000 冲突，本地联调后端走 3100/3001。

---

## 6. SSE 流式注意（重要）

`/api/v1/chat` 以 `text/event-stream` 返回，事件序列严格对齐 `openapi.yaml`：

```
token* → sources? → done(stop)        # 有答案
fallback → done(no_answer)            # 无答案兜底（AC-03）
error                                 # 上游不可用
```

**CloudBase 适配器流式行为（务必知悉）：**
- `cloud-functions/api/index.js` 是「缓冲适配器」：它复用 `server/dist` 的 Express，但把响应体**缓冲后整体以 base64 返回**，并非真流式。chat 的流式体验会在该函数形态下退化（首字延迟变高、无逐字效果）。
- **生产真流式建议**：将编译后的 Express 应用**直接挂 CloudBase HTTP 函数**，入口 `exports.main` 透传 `req/res`（见 `docs/DEPLOY.md` 的 passthrough 示例），让 Express 直接写回 HTTP 函数的响应流。这才是真正的 chunked 流式。
- 普通 JSON 端点（feedback / human-handoff / scenarios / features）在两种形态下均完全兼容。

---

## 7. 部署验证（实测证据）

脚本 `scripts/verify-deploy.mjs` 可复跑，覆盖 5 端点 + SSE 首字时延。以下为本地实测（Node v22.22.2）：

```
$ BASE_URL=http://localhost:3100 node scripts/verify-deploy.mjs
== 吉小农部署验证 @ http://localhost:3100 ==
PASS | GET /healthz                         | status=200 body={"code":0,"data":{"status":"ok"},...}
PASS | chat 成功流 事件序列 token->sources->done | 序列=[token,token,sources,done] finish_reason=stop
PASS | chat 首字 < 3s (AC-06)               | firstToken=54ms total=193ms
PASS | chat 兜底流 fallback->done(no_answer) (AC-03) | 序列=[fallback,done] finish_reason=no_answer
PASS | POST /api/v1/feedback                | body={"code":0,...}
PASS | GET /api/v1/scenarios                | body=[{"id":"baodao","name":"新生报到","icon":"MapPin",...}]
== 结果：6/6 通过 ==

# 前端经 Vite proxy(:3000) 接真实后端(:3100) 的联调实测：
$ BASE_URL=http://localhost:3000 node scripts/verify-deploy.mjs
PASS | chat 成功流 事件序列 token->sources->done | 序列=[token,token,token,token,token,sources,done] finish_reason=stop
PASS | chat 首字 < 3s (AC-06)               | firstToken=1ms total=716ms
PASS | chat 兜底流 / feedback / scenarios    | 通过
# 注：GET /healthz 经 proxy 返回 SPA HTML（proxy 仅转发 /api/*），属预期，前端不调用 /healthz
```

结论：后端可启动、5 端点可用、SSE 事件序列与首字时延达标（AC-06 <3s），前端经代理接真实后端联调跑通。

---

## 8. CloudBase 部署要点

详见 `docs/DEPLOY.md`。摘要：

1. 编译后端：`cd server && npm run build` → 产出 `server/dist`。
2. 打包：`server/dist` + `node_modules`（含 express）+ `cloud-functions/api/index.js` 一并上传为 **HTTP 云函数**。
3. 配置云函数环境变量：`COZE_API_TOKEN`、`COZE_BOT_ID`、`COZE_API_BASE`、`STORE_KIND=cloudbase`。
4. 构建前端：`cd web && npm run build` → `web/dist` 静态资源托管到 CloudBase 静态网站（与云函数同源，`/api` 直接调用）。
5. **真流式**：如需逐字流式，改用「编译后 Express 直接挂 HTTP 函数」的透传入口（见 DEPLOY.md），而非当前缓冲适配器。
6. `STORE_KIND=cloudbase` 时，按 `docs/db-schema.md` 在 CloudBase 文档存储建 `scenarios/feedback/human_handoff/features` 集合。

---

## 9. 回滚方案

- 每次部署**保留上一个版本的部署包 + 云函数版本号**（CloudBase 支持云函数版本回退）。
- 前端静态资源建议带构建版本号或保留上一版目录，异常时切回。
- 本地回滚：`git checkout <上一版本>` 后 `make dev` 复测。

---

## 10. 上线前运营确认项（AC-01 / AC-07 非代码项）

以下为**运营/配置动作**，代码已就绪，但上线前必须由运营确认，非工程可自动验收：

- [ ] **AC-01 知识库冷启动**：在 Coze 控制台导入结构化知识库，覆盖「报到/交通/住宿/缴费/户口/档案/军训/校园卡/食堂/地标」≥10 主题，每条标注来源与更新日期（可溯）。
- [ ] **AC-07 零代码维护**：确认运营学生已在 Coze 控制台具备知识库维护权限（上传 PDF / 粘贴官网链接自动入库），无需改代码即可迭代。
- [ ] Coze `bot_id` 已创建并通过联调（注入 `COZE_BOT_ID`）。
- [ ] `COZE_API_TOKEN` 已注入云端环境变量，**未写入代码库、未暴露前端**。
- [ ] 生产域名已绑 HTTPS；AI 生成内容显著标识已开启（AC-10）。
- [ ] 限流参数（`RATE_*`）已按预期配置；监控/告警（可选，见 §11）已就位。

---

## 11. 监控 / 备份 / 告警（当前状态与建议）

| 项 | 现状 | 建议（生产增强） |
|----|------|------------------|
| 健康检查 | ✅ `GET /healthz` 返回 `status:ok` | 接入平台探活 |
| 统一错误结构 | ✅ `{code,data,message}` + 全局 errorHandler | — |
| 速率限制 | ✅ 聊天/数据端点限流 | 接入平台 WAF |
| 真流式 | ⚠️ 当前 cloud-functions 适配器为缓冲式 | 改用透传式 HTTP 函数入口 |
| CI/CD | ❌ 未配置 | 建议 GitHub Actions 跑 lint/type/test + 自动部署 |
| 监控/告警 | ❌ 未配置 | Sentry / CloudBase 监控面板 + 错误率/时延告警 |
| 数据备份 | ❌ JSON/云存储未设自动备份 | `STORE_KIND=cloudbase` 时开启文档存储备份策略 |

> 说明：本工作区未包含 `references/` 知识库（production-readiness-scorecard 等），故未做正式分级打分。基于实测，部署可行性达 **Silver**（可启动、可验证、可回滚、有健康检查与限流），缺口在 CI/CD、监控告警与备份自动化——列入上线前增强项，不影响 MVP 交付。

---

## 12. 交付物清单

- [x] `server/` —— 薄壳后端（Express + TS，5 端点 + SSE，含 dist 编译产物）
- [x] `web/` —— 薄壳前端（Vite + React，含聊天页 SSE、接真实后端代理开关）
- [x] `cloud-functions/api/` —— CloudBase HTTP 云函数适配器
- [x] `docs/` —— SPEC.md / ARCHITECTURE.md / openapi.yaml / db-schema.md / DEPLOY.md
- [x] `README.md` —— 本文（结构 / 启动 / Coze 接入 / 部署 / 端口冲突 / SSE 注意 / AC-01·AC-07 清单）
- [x] `Makefile` + `scripts/verify-deploy.mjs` + `scripts/start-dev.sh` —— 一键启动与可复跑验证
- [x] `.env.example` + `.gitignore` —— 变量模板与忽略规则

---

## 13. 知识库素材包与运营指南（2026-07-30 续接对话补充）

> 上一个对话（上下文溢出前）已完成工程并通过 QA；本续接对话在干净环境接管磁盘工程，验证可运行，并补齐了「上线前运营动作」（非代码项，对应 AC-01 / AC-07）。

- **知识库素材包**：`docs/knowledge-base/`（11 篇，覆盖报到/交通/住宿/缴费/户口/档案/军训/校园卡/食堂/地标/联系方式），全部基于吉农官方公开信息整理，每篇带来源 URL + 更新日期 +「以通知书为准」提示，满足 SPEC AC-01「≥10 主题且来源可溯」。索引见 `docs/knowledge-base/00-INDEX.md`。
- **运营上线指南**：`docs/onboarding-guide.md` —— 含 Coze 建 bot + 导入知识库 + 提示词模板、公众号/抖音渠道发布（路线 A，零部署）、薄壳 H5 + CloudBase 部署（路线 B）、`COZE_API_TOKEN` 安全注入红线、上线前验收清单（对应 AC-01/03/04/07/10）。
- **验证证据**：同会话实测后端 `verify-deploy.mjs` 6/6 通过、后端单测 24/24 通过、前端 H5 dev HTTP 200（mock 模式可打开）。
- 说明：知识库内容为联网采集通用版，运营拿到学校《2026 新生入学须知》PDF 后可在 Coze 控制台覆盖对应篇目，无需改代码（AC-07）。
