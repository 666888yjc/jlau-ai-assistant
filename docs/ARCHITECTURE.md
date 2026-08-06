# 吉农 AI 校园助手 — 技术架构文档（MVP 阶段）

> 作者：首席架构师 高见远（mvp-dev-expert-team-architect）
> 日期：2026-07-30
> 版本：v1.0（MVP 选型版）
> 配套文档：`docs/decisions/ADR-001.md`（架构决策）、`docs/decisions/ADR-002.md`（图标库锁定）

---

## 1. 背景与目标

为吉林农业大学全体学生提供「一站式校园 AI 助手」：自然语言对话即可获取报到 / 选课 / 考研 / 生活等全校信息。
形态对标抖音账号「小林学长」的「山外26级新生答疑」——微信小程序风格的聊天式 AI 客服 + RAG 知识库。
MVP 先跑通单场景（建议：新生报到答疑），再横向扩展为多场景模块化产品（每场景独立知识库 + 分类入口）。

关键约束（来自需求方）：
- 用户为零代码起步学生，已玩过 Coze / Trae / WorkBuddy。
- 知识库策略：专家团先联网搜集吉农公开信息搭初版 → 用户验证准确性并补充资料（用户负责**内容维护**，不负责代码）。
- 形态需求：微信小程序风格聊天 UI + 模块化分类入口 + RAG 知识库。

---

## 2. 技术选型对比矩阵

评分口径：1=差/不可行，5=优/零成本。权重来自「MVP 决策矩阵」（学习成本/生态成熟度/部署成本/团队熟悉度=高；扩展性=低），并补充本项目的两个硬约束：零代码可维护性、合规可行性（个人主体）。

| 维度 | 权重 | A. Coze 零代码智能体 + 微信/抖音发布 | B. Taro 小程序 + CloudBase + 自建 RAG | C. 公众号 H5 + 云函数 + 同款 AI 层 | 推荐组合：薄自研壳 + Coze 大脑（MVP）/ 自建 RAG（规模化） |
|------|------|--------------------------------------|----------------------------------------|--------------------------------------|-----------------------------------------------------------|
| 零代码可维护性（用户维护知识库） | 高 | 5（KB 全 UI 维护） | 2（需自建无代码后台，否则不可维护） | 3（取决于后台） | 5（MVP：KB 在 Coze 维护） |
| 合规可行性（个人主体） | 高 | 4（公众号/抖音渠道友好；小程序需平台资质） | 2（小程序类目仅企业主体） | 4（H5 在公众号内较宽松） | 4 |
| 多场景模块化 | 高 | 4（多 KB 绑定 + 意图路由） | 5（独立 namespace / 分表） | 3 | 4~5 |
| 学习成本（对用户/团队） | 高 | 5（零代码） | 2（需前端+云+向量库） | 3 | 3 |
| 部署成本（免费额度） | 高 | 5（Coze 免费版可用） | 3（CloudBase 有免费额度，pgvector 另计） | 4 | 4 |
| 扩展性 / 深度定制 | 低 | 2（受平台限制） | 5（完全自主） | 3 | 3→5（可升级大脑） |
| 团队/用户熟悉度 | 高 | 5（已玩过 Coze） | 2 | 3 | 4 |

**加权结论（高权重维度主导）：**
- 零代码可维护性 + 合规可行性 + 学习成本 三项高分 → **AI 大脑与知识库层必须基于 Coze（方案 A）**，这是满足「零代码学生长期自维护」与「个人主体合规上线」的唯一低阻力路径。
- 但纯 Coze 发布的小程序 UI 定制能力弱、且仍受小程序类目约束 → 叠加一层**薄自研壳**（微信小程序风格聊天 UI + 分类入口），调用 Coze Bot API（经云函数代理）。这既拿到「微信小程序风格 + 模块化分类入口」的形态，又保留零代码 KB 维护。
- 规模化（企业主体到位、需数据自主/开源/复杂 Agent）时，将薄壳背后的「Coze 大脑」替换为「自建 Taro + CloudBase + pgvector RAG」（方案 B），前端壳与图标体系不变。

**最终推荐架构（两层可替换大脑）：**
- MVP（v1）：公众号（订阅号/服务号）+ 抖音 发布 Coze 智能体（多知识库）；可选薄壳（Taro H5 / 小程序风格）调用 Coze Bot API。图标库锁定 Lucide。
- 规模化（v2）：企业主体 + 微信小程序（Taro3）+ CloudBase（云函数 + PostgreSQL pgvector）+ 混元/DeepSeek（生文）+ 混元/lkeap embedding（向量化）+ 自研无代码 KB 管理后台。图标库锁定 Lucide（lucide-react-taro）。

---

## 3. 推荐架构与分层

### 3.1 MVP 架构（Coze 大脑 + 薄壳，合规走公众号/抖音）

```
[ 用户 ]  --(微信/抖音)-->
[ 公众号H5 / 抖音 / 可选薄壳(Taro, Lucide图标) ]
        | 聊天UI + 分类入口(场景卡片)
        | 调用 Coze Bot API (经云函数代理, 隐藏 token, 流式SSE)
        v
[ Coze 智能体(多知识库 RAG) ]
   ├── KB_报到 (文本/表格知识库, 专家团初版 + 用户补充)
   ├── KB_选课 (扩展时新增)
   ├── KB_考研 (扩展时新增)
   └── KB_生活 (扩展时新增)
        | 检索增强 -> 混元/DeepSeek 生成
        v
[ 流式回复返回薄壳 / 公众号会话 ]
```

- 多场景模块：薄壳首页渲染「分类入口」（每个场景一张卡片，图标用 Lucide，**非 emoji**）；用户选择场景 → 切换 `bot_id` 或 Coze 知识库集合 → 进入该场景对话。
- 知识库维护：用户在 Coze 控制台 UI 上传/编辑文档，零代码。专家团先用联网搜集的吉农公开信息建初版。

### 3.2 规模化架构（自建 RAG，企业主体小程序）

```
[ 微信小程序 Taro3 (Lucide 图标, 流式聊天) ]
        | /api/v1/chat (云函数代理, 流式 SSE)
        v
[ CloudBase 云函数 ]
   ├── retrieve: scenario_id -> pgvector 余弦检索 top-k
   ├── generate: 拼 RAG prompt -> 混元/DeepSeek 流式
   └── ingest (无代码后台触发): doc -> 切块 -> embedding -> 入库
        |
[ CloudBase PostgreSQL + pgvector ]
   └── kb_chunks(scenario_id, content, embedding vector(1024), meta)
        |
[ 无代码 KB 管理后台 (H5) ] <-- 用户上传Word/PDF/txt, 零代码维护
[ Embedding: 混元/lkeap (query/document 分类型) ]
```

---

## 4. 核心功能可行性验证

### 4.1 RAG 知识库（切片 → 向量化 → 检索增强）
- **Coze 路径（MVP）**：内置知识库支持本地文档/在线数据/飞书/公众号/Notion 导入，平台自动切块 + 向量检索（平台预置存储或火山引擎云搜索 OpenSearch）。用户纯 UI 维护。**可行。**
- **自建路径（规模化）**：CloudBase 官方已有 `PostgreSQL + pgvector` RAG 配方（确认可用）：切块（`RecursiveCharacterTextSplitter`, chunk≈500 token, overlap 100）→ embedding（混元 `GetEmbedding` 1024 维 / 或 `lkeap` `lke-text-embedding-v2`，支持 query/document 分类型提升召回）→ 存 `vector(1024)` → 检索 `ORDER BY embedding <=> $query LIMIT k` → 拼 prompt → LLM 流式。**可行。**
- **MVP 单场景兜底**：若 pgvector 在部分环境未开放，单场景（新生报到）知识量 < 1 万段时，可用 CloudBase 文档库存向量数组 + 云函数内暴力余弦，足够跑通。

### 4.2 多场景模块化（每场景独立知识库 + 分类入口）
- **Coze**：一个智能体可绑定最多 1000 个知识库；薄壳「分类入口」选择场景后切换 `bot_id`/知识库集合即可实现隔离。**可行。**
- **自建**：每个场景 = `scenario_id` 分区或独立 pgvector 表；首页 `scenarios` 注册表驱动分类入口。**隔离更干净，可行。**
- 设计约束：禁止把全量知识塞进单一 prompt；按 `scenario_id` 隔离检索。

### 4.3 零代码用户后续可维护性
- **Coze（MVP）**：知识库编辑全在 UI，用户验证准确性 + 补充资料零代码。**满足核心要求。**
- **自建（规模化）**：**必须配套「无代码 KB 管理后台」**（上传文档→自动切块/向量化/入库），否则零代码用户无法维护 → 违反核心需求。该后台是规模化的硬性建设项，需在 v2 排期。

---

## 5. 技术约束清单（团队必须遵守）

1. **图标库锁定 Lucide（MIT）**：Taro 端用 `lucide-react-taro`（支持动态色/尺寸/tree-shaking，并提供 CLI 生成 TabBar PNG）；H5 端用 `lucide` / `lucide-static` 内联 SVG。**禁止 emoji 作为功能图标；禁止混用其他图标库。** 场景图标预映射：报到=MapPin、选课=BookOpen、考研=GraduationCap、生活=Coffee（均为 Lucide SVG）。
2. **流式优先**：聊天必须流式（SSE / `enableChunked`）；自定义壳经云函数代理调用 AI，前端不暴露任何 API token。
3. **知识库 ingestion 统一管线**：doc → chunk(≈500 token, overlap 100) → embed(中文优化模型, query/document 分类型) → store(vector)。
4. **多场景隔离**：用 `scenarios` 注册表 + `scenario_id` 隔离；禁止全量知识进单一 prompt。
5. **合规**：AI 生成内容需显著标识；个人主体走公众号/抖音渠道；小程序需企业主体 + 算法备案。
6. **数据脱敏**：知识库入库前脱敏（手机号/邮箱/身份证）；用户输入日志合规留存，不留存敏感个人信息。
7. **API 版本**：自建端点统一带 `/api/v1/` 前缀（MVP 若直连 Coze 则遵循 Coze API 规范）。
8. **统一响应**：自建接口统一 `{ code, data, message }` 结构。
9. **模型可替换**：生文（混元/DeepSeek）与 embedding（混元/lkeap/bge）通过配置切换，不硬编码。

---

## 6. 不可行 / 高风险警告（务必知会需求方）

### 6.1 [最高优先级] 合规 blocker：个人主体无法申请小程序「深度合成-AI问答」类目
- 微信规定：「深度合成-AI问答」服务类目**仅向企业主体开放**，个人主体小程序无法申请；涉及 AI 问答的小程序无此类目提交审核会被拒。
- 影响：无论自研（方案 B）还是 Coze 托管发布小程序，个人主体学生直接上「微信小程序 AI 问答」高风险被拒。
- 对策（二选一）：
  - **MVP 走公众号/抖音渠道**：公众号（订阅号/服务号）+ Coze 智能体发布到公众号；或抖音（Coze 发布到抖音，对标小林学长本身即在抖音）。对个人主体更友好。
  - **注册企业主体**（学校/社团/学生公司名义）后再上微信小程序。Coze 托管发布可借助火山引擎提供的「算法备案 + 合作协议」作为第三方技术资质尝试过审，但需在发布时实测验证，**非 guaranteed**。
- 通用合规：遵守《生成式人工智能服务管理暂行办法》；AI 生成内容显著标识；知识库含个人信息需脱敏。

### 6.2 Coze 知识库容量与协作限制
- 单知识库上限：10000 分段 / 300 文件 / 单文件 100MB；免费版总容量 1GB（专业版 10GB）；知识库**不支持多人协作**（仅所有者可编辑）。
- 影响：单场景（新生报到）远未触顶；但学生团队共同维护时受限。可接受于 MVP；多协作者需升级专业版或迁自建。

### 6.3 Coze 小程序渠道无语音输入/输出
- Coze 发布到小程序不支持语音 I/O。若对标抖音需语音交互，MVP 仅文本；语音需自定义壳后续实现。

### 6.4 自建 RAG 中文检索质量
- 粗暴余弦或劣质 embedding 会答非所问。必须用中文优化 embedding（混元/lkeap/bge），query/document 分类型，chunk 500 token overlap 100，必要时 hybrid（向量+关键词）。

### 6.5 CloudBase pgvector 可用性
- pgvector 扩展需控制台实际开放，部分环境可能未开放。备选：腾讯云向量数据库 VectorDB / 云开发内置 RAG 插件 / 文档库暴力余弦（MVP 单场景 < 1 万段足够）。

### 6.6 延迟与成本
- 流式体验需 SSE；云函数冷启动；LLM token 成本随用量增长。用 CloudBase AI 共享额度或自购 token 包；MVP 单场景流量小，成本可控。

---

## 7. 知识库策略落地（专家团 → 用户）

1. 专家团联网搜集吉农公开信息（报到流程、选课手册、考研政策、生活指南等），在 Coze 建初版知识库（文本/表格）。
2. 用户验证准确性、补充本校最新资料（Coze UI 上传/编辑，零代码）。
3. 扩展期：每新增场景 = 新建一个知识库 + 在薄壳注册一个分类入口（Lucide 图标）。

---

## 8. API 契约概要（Phase 2 产出 `openapi.yaml`）

MVP（Coze 大脑）主要复用 Coze Bot API（`POST /v3/chat`，`stream:true`，`bot_id`/`user_id`/`conversation_id`），经云函数代理。
规模化自建需定义（Phase 2 由本架构师产出 `openapi.yaml`）：
- `POST /api/v1/chat` — 场景对话（流式），body: `{ scenario_id, message, history }`
- `POST /api/v1/kb/ingest` — 无代码后台触发入库（文件上传）
- `GET  /api/v1/scenarios` — 分类入口列表（含 Lucide 图标名）
- `GET  /api/v1/features` — Feature Flag 灰度状态

---

## 9. 图标库锁定说明（P0 硬规则）

- **锁定库：Lucide**（https://lucide.dev，MIT，24×24 线性描边图标，1500+）。
- **Taro 小程序交付**：`lucide-react-taro`（npm）渲染 Lucide 为 DataURL SVG，支持动态色/尺寸/tree-shaking，并提供 CLI 生成 TabBar PNG（小程序 TabBar 仅接受本地 PNG）。
- **H5 交付**：`lucide` / `lucide-static` 内联 SVG。
- **构建规则**：统一 `src/components/Icon` 封装；仅从 `lucide-react-taro` / `lucide` 导入；**禁止 emoji、禁止混用其他图标库**。
- 场景图标预映射（SVG，非 emoji）：报到=MapPin、选课=BookOpen、考研=GraduationCap、生活=Coffee。

---

## 10. 后续行动 / Phase 2 待办（本架构师负责）

- 产出 `openapi.yaml`（规模化自建端点契约）。
- 与设计师（mvp-dev-expert-team-designer）对齐 Lucide 图标集与场景映射。
- 与 PM（mvp-dev-expert-team-pm）确认渠道：MVP 默认公众号/抖音（个人主体合规），小程序列为企业主体后 scale-up。
- 规模化阶段：无代码 KB 管理后台设计（零代码维护的硬性前提）。
