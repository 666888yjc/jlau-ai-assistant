# M-2 自定义域名绑定（CloudBase 网关层 · 方案 A）

> 目标：让微信小程序 web-view 能加载 `https://<CUSTOM_DOMAIN>/chat`，且新域名下 `/api/v1/*`
> 相对路径请求与默认域名**行为完全一致**（前后端 API 零改动）。
>
> **结论先行（架构 §2 推荐方案 A）**：在 CloudBase「**HTTP 访问服务（网关）**」层绑定自定义域名，
> 让新域名共享既有网关路由表（`/`→STATIC_STORE 静态托管、`/api`→WEB_SCF 云函数 jlau-ai-assistant）。
> 这样 H5 从新域名加载后，相对路径 `/api/v1/*` 同源请求与默认域名完全一致，**前端 `api.ts`、CSP、云函数全部零改动**。

---

## 0. 为什么必须在网关层绑定（不是静态托管）

| 挂载面 | 入口 | CNAME 目标（典型） | `/api` 转发 |
|---|---|---|---|
| **A. HTTP 访问服务 / 网关（推荐）** | 环境 → HTTP 访问服务 → 域名管理 | `ap-shanghai.app.tcloudbase.com` 一类网关域名 | ✅ 走**统一网关路由表**，已配 `/`→STATIC_STORE、`/api`→WEB_SCF 对新域名同样生效 |
| B. 静态网站托管 | 静态网站托管 → 域名管理 | `<envId>.tcloudbaseapp.com` 一类托管域名 | ⚠️ 只解析到静态文件服务，`/api` 转发**不默认存在**，需看该版本是否支持路径转发 |

事实底座：当前环境网关已配 `/`→STATIC_STORE、`/api`→WEB_SCF（历史修复过 tcloudbaseapp.com 缺 `/api` 转发），
默认域名与网关域名均可访问——网关路由表现成、可复用，这是方案 A 成立的前提。

结构性约束：`cloudbaserc.json` 的 CSP 是 `connect-src 'self'`，**API 必须同源**。任何「把 BASE 改成
绝对 URL 指向别的域名」的方案都会撞上 CSP（违反零改动），因此**让新域名与 API 同源（网关层转发）是唯一不动代码的路**。

---

## 1. 前置材料（用户待提供）

| 材料 | 说明 | 阻塞 |
|---|---|---|
| 域名值 `<CUSTOM_DOMAIN>` | 建议子域名 `chat.<用户域名>` 降低对主域名影响 | 步骤 2-6 |
| DNS 解析权限 | 用户需能在域名服务商处添加 CNAME 记录 | 步骤 3 |
| 域名已备案 | 微信业务域名硬性要求（业务域名配置前置，见 business-domain.md） | 业务域名配置 |

---

## 2. 实施步骤

| 步骤 | 操作 | 负责方 | 依赖 |
|---|---|---|---|
| 1 | 用户在 DNS 服务商处**确认域名已备案** | 用户 | — |
| 2 | CloudBase 控制台 → 环境 `yjc-d0gvjkk8tae8bf1ad` → **HTTP 访问服务 → 域名管理 → 添加域名**，填入 `<CUSTOM_DOMAIN>` | 开发 | 域名值 |
| 3 | 按控制台提示在 DNS 服务商加 **CNAME 记录**：`<CUSTOM_DOMAIN>` → 控制台给出的网关目标域名 | 用户（有解析权限） | 步骤 2 |
| 4 | 控制台触发 **HTTPS 证书**：自动签发（默认）或上传已有证书；等待签发完成（通常 1-2 小时到 1-2 天） | 开发 | 步骤 3 生效 |
| 5 | **确认网关路由对该域名生效**：网关路由表应含 `/`→STATIC_STORE、`/api`→WEB_SCF（与默认域名同表，一般无需新增；若控制台按域名隔离，则为该域名补同款两条路由） | 开发 | 步骤 2 |
| 6 | 运行 `scripts/verify-custom-domain.sh <CUSTOM_DOMAIN>` **逐项通过**后，把结果记入本文件末尾「验证结果归档」 | 开发 | 步骤 4/5 |

---

## 3. 验证脚本（五连测）

```bash
bash scripts/verify-custom-domain.sh <CUSTOM_DOMAIN>
```

| # | 判据 | 对应验收 | 失败含义 |
|---|---|---|---|
| ① | `https://<DOMAIN>/chat?scenario=baodao` 返回 200 且含 `<title>` | AC-M2.1 | 站点不可达 / 未绑定 |
| ② | HTTPS 证书有效（curl 校验证书通过） | AC-M2.2 | 证书未签发 / 无效 |
| ③ | **`/api/v1/scenarios` 返回 JSON `code:0`** | AC-M2.3（核心） | 网关未把新域名 `/api` 转发到云函数 → 走降级路径 |
| ④ | SSE 打字机可用（`text/event-stream`、无 br/gzip、内容分批到达跨度 ≥150ms） | AC-M2.3 | 新域名下 SSE 被压缩/缓冲 |
| ⑤ | CNAME 解析生效（`dig +short CNAME` 非空） | AC-M2.5 | DNS 未生效 |

> ⚠️ **不要只测 ① 就宣布完成**：H5 首页能开 ≠ API 能用。③ 是本增量成败关键（AC-M2.3 是 PRD 验收硬项）。
> ⚠️ ④ 复用 `scripts/verify-headers.sh` 的 M0 判据思路（打字机逐字、无 br/gzip），不要重复造轮子。

---

## 4. 降级路径（若控制台不支持网关层绑定自定义域名，按序降级）

1. **方案 B**：静态托管绑定自定义域名 + 在「静态托管 → 自定义域名 → 路径转发/路由规则」为该域名补
   `/api/*`→云函数（不同控制台版本入口名不同，本质都是把 `/api` 指到函数，见 `docs/deploy-cloudbase.md §6`）。
2. **方案 C（需用户批准，标注违反零改动约束）**：前端 `BASE` 改绝对 URL + CSP `connect-src` 放开默认域名。
   **不推荐**，仅当 A/B 均不可行时使用。

---

## 5. 与既有配置的兼容性（为什么零改动成立）

| 既有配置 | 值 | 对方案 A 的影响 |
|---|---|---|
| `web/src/lib/api.ts` BASE | `'/api/v1'`（相对路径） | ✅ 新域名下同源，行为一致，**不动** |
| CSP `connect-src 'self'` | `'self'` | ✅ 全部同源（H5 与 API 都在 `<CUSTOM_DOMAIN>`），**不动** |
| CSP `frame-ancestors 'self'` / `X-Frame-Options: SAMEORIGIN` | 已配 | ✅ web-view 是原生全屏 WebView **不是 iframe**，frame 类头不影响加载，**不动** |
| 静态托管 headers/compression | 已配 | ✅ 随域名走静态托管路径时继承，**不动** |
| 云函数环境变量（AUTH_ENFORCE=0 等） | 已配 | ✅ 与域名无关，**不动** |
| CORS 白名单 `CORS_ALLOW_ORIGINS` | 空（默认 `*`） | ✅ 同源请求本就不触发 CORS，**不动** |

---

## 6. 验证结果归档

| 日期 | 域名 | ① | ② | ③ | ④ | ⑤ | 备注 |
|---|---|---|---|---|---|---|---|
| (待实测) | `<CUSTOM_DOMAIN>` | — | — | — | — | — | 域名值到达后运行 verify-custom-domain.sh 填写 |
