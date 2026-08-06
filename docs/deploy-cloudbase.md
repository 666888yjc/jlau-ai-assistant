# 吉小农 route-B 公网部署指南（腾讯云 CloudBase）

> 目标：把「吉小农」前端 H5（React/Vite） + 自建后端（Express + 免费 SiliconFlow 大脑 + 本地 21 篇 KB 检索 + 高德实时地图）部署到公网，新生通过微信/浏览器访问。
> 前置：你已在本地跑通 `brain=siliconflow` 全链路（见 HANDOFF §11–13）。本指南只讲"怎么上公网"。

---

## 0. 一个必须你来做的前置（我替不了）

**在 CloudBase 控制台连接你的腾讯云账号**——这步需要你本人在 UI 授权 OAuth，对话里的 AI 无法代操作。

- 打开 CloudBase 控制台 `https://console.cloud.tencent.com/tcb`
- 用你的腾讯云账号登录 → 新建环境（选「按量计费」或「基础版 1 核 1G」，新人常有无费额度）
- 记下环境 ID（形如 `jlau-ai-1g2h3k4m5n6o`），后面所有命令都要它

> 连接完成后，回到对话告诉我"已连好"，我可以用 CloudBase 工具直接帮你点部署；或者你按本指南自己 `tcb` 部署。

---

## 1. 本地已就绪的产物（本指南不重复构建）

| 产物 | 路径 | 说明 |
|------|------|------|
| 前端静态包 | `web/dist/` | `npm run build` 已生成（index.html + assets） |
| 后端编译包 | `server/dist/` | `npm run build`（tsc）已生成 |
| 知识库 | `server/kb/*.md`（22 篇） | 运行时被检索，随云函数包上传 |
| 部署配置 | `cloudbaserc.json`、`server/.tcbignore` | 已就绪 |

> 重新构建：`cd web && npm run build` ；`cd server && npm run build`

---

## 2. 安装 CloudBase CLI

```bash
npm i -g @cloudbase/cli
tcb --version          # 看到版本即成功
tcb login              # 浏览器跳腾讯云授权，扫码登录
tcb env:list           # 列出你的环境 ID，复制下来
```

把环境 ID 填进 `cloudbaserc.json` 的 `envId`（替换 `REPLACE_WITH_YOUR_ENV_ID`）。

---

## 3. 注入密钥（安全红线：绝不传 .env 文件）

`server/.tcbignore` 已排除 `.env`，但**更稳的做法是在平台设环境变量**，云端不存任何 key 文件。

在 CloudBase 控制台 → 你的环境 → **云函数 `jlau-ai-assistant` → 环境变量**，新增以下键值（与 `server/.env` 一致，**只填值，不要上传文件**）：

| 变量名 | 值 | 来源 |
|--------|-----|------|
| `LLM_PROVIDER` | `siliconflow` | 大脑选型 |
| `SILICONFLOW_API_KEY` | `sk-rhpae...blka` | 你的 SiliconFlow key |
| `SILICONFLOW_BASE_URL` | `https://api.siliconflow.cn/v1` | 固定 |
| `SILICONFLOW_MODEL` | `deepseek-ai/DeepSeek-V3` | 固定 |
| `AMAP_API_KEY` | `55d49f8...5165be` | 你的高德 key（已开地理/周边/路径三服务） |
| `STORE_KIND` | `json` | 默认；如需持久会话改 `cloudbase`（增强项） |

> `PORT` 不用设——CloudBase HTTP 访问服务会自动注入。后端 `config.port` 已读它。

---

## 4. 部署后端（云函数）

### 方案 A（推荐）：HTTP 访问服务（Web 函数）

Express 应用直接 `node dist/index.js` 监听平台注入的 `PORT`，零代码改动，前端 `/api` 同源代理。

控制台操作：
1. 环境 → 云函数 → **新建** → 函数名称 `jlau-ai-assistant`
2. 运行环境 **Nodejs 18.15** → 创建方式「代码包」或「本地上传」
3. **开启 HTTP 访问服务**（关键！这让它像普通 Web 服务一样收 HTTP 请求）
4. 上传 `server/` 目录（含 `dist/`、`kb/`、`.tcbignore`；`.env` 已被忽略）
5. 启动命令填 `node dist/index.js`（或 `npm start`）
6. 把第 3 节的 6 个环境变量粘贴进去
7. 内存 256MB / 超时 30s → 创建

### 方案 B：标准云函数 + 部署命令

若你偏好 CLI：

```bash
cd <项目根>
# 确保 cloudbaserc.json 的 envId 已替换
tcb fn deploy jlau-ai-assistant -e <你的环境ID>
```

（标准函数模式需把 Express 包成 `exports.main`，route-B 当前 `index.ts` 是 `app.listen` 形态，故**方案 A 更省事**，推荐。）

---

## 5. 部署前端（静态托管）

```bash
tcb hosting deploy web/dist -e <你的环境ID>
```

控制台也能拖拽上传 `web/dist/` 全部内容到「静态网站托管」。

记下静态托管域名，形如 `https://jlau-ai-1g2h3k4m5n6o.tcloudbase.com`。

---

## 6. 配置路由（前端 /api → 后端函数）

前端代码统一请求相对路径 `/api/v1/...`（`web/src/lib/api.ts`），所以只要让 `/api/*` 转发到云函数即可同源、无 CORS。

在 CloudBase 控制台 → 环境 → **静态网站托管 → 路由规则 / 访问服务**：
- 新增一条：路径 `/api/*` → 指向云函数 `jlau-ai-assistant`
- 其余路径 → 静态文件

（不同控制台版本叫法可能是「网关路由」「HTTP 访问服务路由」「自定义域名转发」，本质都是把 `/api` 指到函数。）

---

## 7. 验证

浏览器打开静态托管域名，问：

- 「学校周边有什么好吃的」→ 应返回李季酱骨头 + 高德实时推荐（胖土豆等）
- 「附近有打印店吗」→ 高德实时 POI + 距离
- 「从学校到龙嘉机场打车怎么走」→ 高德驾车路线
- 「吉农报到要带什么材料」→ 8 项材料（KB 检索）

也可直接打接口：
```bash
curl https://<你的域名>/api/v1/chat -X POST -H "Content-Type: application/json" \
  -d '{"scenario_id":"baodao","message":"学校周边有什么好吃的","history":[],"conversation_id":"x"}'
```

---

## 8. 故障排查

| 现象 | 原因 | 解法 |
|------|------|------|
| 部署后回答"不太确定"/空 | key 没注入或 `.env` 没传 | 检查云函数环境变量 6 项是否齐全；勿传 `.env` 文件 |
| 高德相关问题答不出 | `AMAP_API_KEY` 未注入或三服务未开 | 控制台确认地理编码/周边搜索/路径规划已开通 |
| `/api` 404 | 路由没配 | 第 6 节补 `/api/*` → 函数 |
| 函数启动失败 | `dist/index.js` 缺失 | 确认先 `npm run build`（server） |
| KB 检索为空 | `kb/` 没随包 | 确认 `server/kb/*.md` 已上传（`.tcbignore` 没误伤） |
| 中文乱码（仅 curl 测） | 客户端编码非 UTF-8 | 用浏览器或 Node 测；非产品 bug（见 HANDOFF §12 陷阱） |

---

## 9. 安全红线（务必遵守）

- 高德 / SiliconFlow key **只进平台环境变量**，绝不写进代码、前端、`.env` 上传包。
- 前端 H5 永不持有任何密钥；所有外部调用由后端代理。
- 知识库不含身份证/银行卡/家庭住址等隐私（AC-10）。
- `.tcbignore` 已排除 `.env`，二次保险。

---

## 10. 备选：公网二维码 / 微信挂链

部署后拿到静态托管域名 → 生成二维码 → 印在迎新海报 / 微信公众号菜单。抖音渠道也靠这个 H5（元器不支持抖音）。

---

## 11. 增强项（可选，非部署必需）

- **持久存储**：`STORE_KIND=cloudbase` 改用云数据库存会话/反馈（需配 cloudbase 存储 key）。
- **自定义域名**：CloudBase 支持绑定已备案域名 + HTTPS。
- **限流**：后端已带 `rateLimit`（默认 60s/20 次 chat），公网可按需调小。
- **监控**：CloudBase 自带函数日志/监控，排错看「云函数日志」。
