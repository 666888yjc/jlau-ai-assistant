# 免费大模型 API Key 获取指南（route-B 大脑准备）

> 用途：给「吉小农」route-B 自托管后端找一个**免费/低价的对话大脑**，替换掉 Coze（积分不够）。
> 目标读者：零代码同学。全程网页操作，5–10 分钟。
> 更新日期：2026-07-31（已联网核实当前免费政策）

---

## 0. 一句话结论

**首选硅基流动（SiliconFlow）**：新用户送 2000 万 ~ 3000 万 Tokens（永久有效，非限时），接口完全兼容 OpenAI，咱们现成的后端改两行就能接。免费额度足够一个新生季的问答量。

备选：DeepSeek（送约 ¥10 额度）、智谱 AI（送 2000 万 Tokens）。三家都 OpenAI 兼容，任选一家即可。

---

## 1. 三家对比（2026-07 核实）

| 平台 | 免费额度 | 接口兼容 | 注册难度 | 备注 |
|------|----------|----------|----------|------|
| **硅基流动** | 2000 万 ~ 3000 万 Tokens（永久） | ✅ OpenAI 格式 | 手机号/邮箱，基本免实名 | **推荐**，额度最大、速度最快 |
| **DeepSeek** | 约 ¥10（≈500 万 Tokens） | ✅ OpenAI 格式 | 手机号/邮箱，免信用卡 | 推理强，额度较小 |
| **智谱 AI** | 2000 万 Tokens（永久） | ✅ OpenAI 格式 | 手机号/邮箱 | 编码/Agent 能力强 |

> 都**不用信用卡**、**不用科学上网**、**接口都兼容 OpenAI 格式**（这是关键——咱们后端直接能换）。

---

## 2. 硅基流动（推荐）step-by-step

### 第 1 步：打开官网注册
- 访问 `https://cloud.siliconflow.cn`（或 `siliconflow.cn` 点右上角「登录」）
- 选「手机号」或「邮箱」登录 → 收验证码 → 设密码（8 位以上，字母+数字）
- 也可直接 GitHub / 微信扫码登录

### 第 2 步：创建 API Key
- 登录后进入控制台首页 `https://cloud.siliconflow.cn`
- 左侧菜单点 **「API 密钥」**（或直接访问 `https://cloud.siliconflow.cn/account/ak`）
- 点 **「新建 API 密钥」** → 给个名字（如 `jlau-xiaonong`）→ 生成
- ⚠️ **密钥只显示这一次！** 立刻点复制，存到手机备忘录或密码管理器

### 第 3 步：记下两个值（交给我接后端用）
- **API Key**：形如 `sk-xxxxxxxxxxxxxxxxxxxxxxxx`
- **Base URL**：`https://api.siliconflow.cn/v1`
- **推荐模型**：`deepseek-ai/DeepSeek-V3`（通用问答够用，速度快）；要更强推理用 `deepseek-ai/DeepSeek-R1`

---

## 3. DeepSeek（备选）step-by-step

### 第 1 步：注册
- 访问 `https://platform.deepseek.com`（注意：是 platform，不是网页聊天的 chat.deepseek.com）
- 手机号/邮箱注册，免信用卡

### 第 2 步：创建 Key
- 登录后左侧菜单 **「API Keys」** → **「Create new API Key」** → 命名 → 生成
- ⚠️ 同样只显示一次，立刻复制

### 第 3 步：记下两个值
- **API Key**：`sk-...`
- **Base URL**：`https://api.deepseek.com`
- **模型名**：`deepseek-chat`（V3）/ `deepseek-reasoner`（R1）

---

## 4. 拿到 Key 之后怎么交给我

**不要**把 Key 直接贴进对话正文以外的任何文件、也不要自己改代码。

最安全的方式（任选）：
1. 直接把 `sk-...` 那串发我，我写进 `server/.env`（已被 `.gitignore` 忽略，不会进代码仓库）
2. 或你自己打开 `jlau-ai-assistant/server/.env`，在末尾加一行：
   ```
   OPENAI_API_KEY=sk-你的密钥
   OPENAI_BASE_URL=https://api.siliconflow.cn/v1
   OPENAI_MODEL=deepseek-ai/DeepSeek-V3
   ```

之后我会改 `server/src/coze/client.ts`，加一个 OpenAI 兼容适配器，后端就彻底不依赖 Coze 积分了。

---

## 5. 安全红线（务必遵守）

- ❌ **Key 绝不进前端代码**、绝不进 `web/` 任何文件（前端打包后人人可见）
- ❌ **Key 绝不提交 Git**（`.env` 已写进 `.gitignore`，但你要确认自己没手滑 `git add`）
- ❌ 不要发到微信群、贴吧等公开地方
- ✅ Key 只存在于**云端环境变量**或本地 `server/.env`
- ✅ 在平台控制台可随时「禁用 / 删除」密钥；怀疑泄露立刻删了重建
- ✅ 建议设个用量上限（平台一般有「余额预警」）

> 高德地图 Key 同理，已在 `server/.env` 的 `AMAP_API_KEY`，前端永远拿不到。

---

## 6. 接进咱们架构后的样子（给你吃定心丸）

```
用户微信/H5 → 咱们后端 server/ → [大脑] OpenAI兼容接口(硅基流动/DeepSeek)
                              → [知识] 本地 RAG 检索 21 篇 KB
                              → [地图] 高德 API(已有 key)
```

- 前端一行不用动（仍是那个漂亮 H5）
- Coze 积分问题彻底消失
- 知识库从元器拿回本地，改完重部署即可（零代码维护变成「改 Markdown」）
- 实时地图问答（附近打印店 / 步行导航）终于能做

---

## 7. 后续步骤（拿到 Key 后）

1. 你把 Key 发我（或自己加进 `server/.env`）
2. 我改 `client.ts` 支持 OpenAI 兼容，本地跑通 mock→真实切换
3. 加高德「地图工具」模块（地理编码/周边搜索/路径规划）
4. 本地 RAG：21 篇 KB 做 embedding 检索
5. 部署公网（CloudBase / 函数计算，需你授权腾讯云账号）
6. 公众号菜单挂咱们 H5，元器转测试备用

> 注：高德当前 key 只开通了「静态地图」，要做实时搜索/路径规划需在高德控制台免费开通「地理编码 / 周边搜索 / 路径规划」三个 Web 服务（申请免费，但需手动勾选）。
