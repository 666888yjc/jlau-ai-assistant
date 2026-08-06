# Spec - 吉农 AI 助手 v1.0（MVP：新生报到答疑）

> 生成日期：2026-07-30
> 基于：PRD v0.1 + 架构文档 v1.0 + UIUX（DESIGN.md + design-tokens.json）+ ADR-001 / ADR-002
> 状态：已确认（用户于 2026-07-30 确认：MVP 锚点=新生报到单场景，渠道=公众号/抖音+Coze，命名=吉小农）
> 唯一交互点：本 Spec 即契约，Phase 1 用户已就三文档 + 范围拍板，后续开发以此为准。

---

## 1. 产品定义

- **一句话描述**：面向吉林农业大学全体学生的自然语言对话式校园 AI 助手「吉小农」；MVP 先打透「新生报到答疑」单场景，再横向扩展选课/考研/生活，最终形成全校一站式。
- **目标用户**：2026 级（及后续各届）吉农新生及其家长；逐步覆盖全体在校生。
- **核心问题**：新生在录取后到报到后一个月的信息焦虑期，现有官网/公众号/学习通/完美校园均为「不会对话」或「不了解本校」的孤立系统，缺少随时能问、答得准、答的是吉农自己情况的入口。

## 2. MVP 范围（锁定——不在此列表的功能一律不做）

| 优先级 | 功能 | 验收标准摘要 | RICE |
|--------|------|-------------|------|
| P0 | 知识库冷启动（专家团联网搜集吉农公开信息，结构化初版，导入 Coze KB） | 覆盖报到/交通/住宿/缴费/户口/档案/军训/校园卡/食堂/地标 ≥10 主题且来源可溯 | 2.00 |
| P0 | 自然语言问答 RAG（用户问报到相关问题，返回基于知识库准信 + 来源标注） | 知识库有答案时返回准确清单并标来源与日期 | 1.44 |
| P0 | 兜底与转人工（低置信/无答案时不编造，给「猜你想问」+ 学工/辅导员联系入口） | 无答案时返回引导 + 联系入口，不编造 | 3.00 |
| P0 | 答案反馈（每条回答下「有帮助/报错」文字按钮） | 点击后记录事件进入纠错/未知队列 | 1.20 |
| P0 | 微信小程序风格聊天界面（薄壳 H5，含消息列表 + 输入栏 + 猜你想问卡片） | 首屏即聊天产品，微信绿主操作 + 吉小农薄荷绿气泡 | 1.50 |
| P1 | 多轮对话上下文（追问承接上文） | 追问「那宿舍能洗澡吗」承接上文 | 0.80 |
| P1 | 零代码知识库后台（运营上传 PDF/链接即入库） | 上传《新生入学须知》自动解析入库（规模化管理项，MVP 在 Coze 控制台完成） | 0.60 |
| P1 | 快捷问题卡片组（猜你想问首页卡） | 2×2 文字卡不拥挤 | 0.60 |
| P1 | 运营数据看板 | 高频/未知/满意度可见 | 0.27 |

## 3. 明确不做（Out-of-Scope — 锁定）

| 不做的功能 | 原因 | 何时考虑 |
|------------|------|----------|
| 选课/查成绩/考试 | 归教务系统/超级课程表，不重复造轮子 | v2 场景扩展 |
| 校园社交/论坛/二手 | 归超级课程表/微信群 | v2+ |
| 报修/缴费/支付交易 | 不接支付，规避资金与合规风险；仅做「怎么交/去哪交」指引 | 视需求 |
| 心理健康诊疗 | 仅共情引导 + 转介学校心理咨询中心 | 始终 |
| 选课/考研/生活全场景（MVP） | MVP 只做新生报到，其余进 Backlog | v2 起逐场景扩展 |
| iOS/Android 原生 App | MVP 只做公众号/抖音 + H5 薄壳 | v2 企业主体后小程序 |
| 采集隐私数据（身份证/银行卡/家庭地址） | 合规 + 隐私；仅用官网公开文件 | 始终 |

## 4. 技术架构（锁定 — 含版本锚定）

> 技术栈选型由架构师按项目锁定（ADR-001/002）。下表「实际版本」为 MVP 落地要求，安装时须锚定实际版本。

| 层 | 技术 | 实际版本（安装时锚定） | 锁定原因 |
|----|------|----------|----------|
| AI 大脑 + 知识库 | Coze（扣子）零代码智能体 + 多知识库 | Coze 平台当前版 | 零代码可维护 + 个人主体合规；KB 全 UI 维护 |
| 交付渠道 | 微信公众号（订阅号/服务号）+ 抖音 | 平台当前版 | 个人主体合规友好，对标小林学长抖音引流 |
| 薄壳前端 | Taro 3（H5 模式）或等价轻量 H5 框架 | Taro 3.x（锁定 minor） | 微信小程序风格 UI；规模化转小程序复用壳 |
| 薄壳图标 | Lucide（lucide-react-taro / lucide-static） | Lucide 最新稳定 | P0 硬规则：单一 SVG 库、禁 emoji |
| 薄壳后端代理 | 云函数（CloudBase / 等价 FaaS，Node.js） | 运行时 LTS | 隐藏 Coze token + 流式 SSE 转发 |
| 数据持久化 | 云函数配套文档/键值存储（反馈、兜底日志、场景注册表） | 同 FaaS 配套 | MVP 极轻；规模化迁 pgvector |
| 生文模型（规模化） | 混元 / DeepSeek | 平台当前 | 模型可替换，配置切换不硬编码 |
| embedding（规模化） | 混元 / lkeap / bge | 平台当前 | 中文优化、query/document 分类型 |

**两层可替换大脑**：MVP 大脑=Coze；规模化（企业主体）大脑=自建 Taro+CloudBase+pgvector RAG，前端壳/图标不变。

## 5. API 端点清单（锁定——开发时以此为唯一依据）

> MVP 核心自建端点只有「薄壳代理 + 轻量数据」。Coze 对话能力经云函数代理调用 `POST /v3/chat`（stream:true，bot_id/user_id/conversation_id），前端不暴露 token。

| Method | Path | 功能 | 认证 | 请求体 | 响应体 |
|--------|------|------|------|--------|--------|
| POST | /api/v1/chat | 转发 Coze 对话，流式 SSE 返回 | 薄壳内部 | { scenario_id, message, history[], conversation_id } | SSE stream（text/event-stream） |
| POST | /api/v1/feedback | 答案反馈（helpful / reported） | 内部 | { message_id, type, note? } | { code, data, message } |
| POST | /api/v1/human-handoff | 兜底转人工登记 | 内部 | { scenario_id, question, contact? } | { code, data, message } |
| GET | /api/v1/scenarios | 分类入口列表（含 Lucide 图标名） | 公开 | — | { code, data:[{id,name,icon,lucide_icon}], message } |
| GET | /api/v1/features | 快捷问题/猜你想问卡片 | 公开 | — | { code, data:[{id,text,scenario_id}], message } |

统一响应结构：`{ code: 0|nonzero, data: object|null, message: string }`。

## 6. 数据库表清单（锁定）

> MVP 阶段数据持久化极轻，知识库本身在 Coze 托管不建表。薄壳侧仅以下最小集合（可用 FaaS 配套文档存储实现，不强制关系型）。

| 集合/表 | 核心字段 | 索引 | 关联 |
|---------|----------|------|------|
| scenarios | _id, id, name, lucide_icon, kb_ref, sort | id 唯一 | 驱动分类入口 |
| feedback | _id, message_id, type(helpful/reported), note, created_at, scenario_id | scenario_id, created_at | 知识库迭代 |
| human_handoff | _id, scenario_id, question, contact, created_at, status | status, created_at | 兜底队列 |
| features | _id, scenario_id, text, sort | scenario_id | 快捷卡 |

MVP 初版 scenarios 仅 1 条（新生报到）；features 写入报到域 4~6 条「猜你想问」。

## 7. 页面清单（锁定）

| 页面 | 路由 | 核心组件 | 对应 API | 设计 Token 主题 |
|------|------|----------|----------|-----------------|
| 聊天主页（核心） | /chat?scenario=baodao | 导航栏 + 消息列表（吉小农薄荷绿气泡/用户灰气泡）+ 猜你想问卡组 + 输入栏（微信绿发送钮）+ 三点打字指示器(LoaderCircle) | /api/v1/chat, /api/v1/features | 微信绿 #07C160 + 薄荷绿 #14BF96 + 深林绿 #1A6B3C |
| 场景分类入口（预留） | /scenarios | 场景卡片网格（Lucide 图标，非 emoji） | /api/v1/scenarios | 同上 |
| 转人工/联系页 | /handoff | 文字按钮 + 学工处/辅导员联系信息（电话文字，非 emoji 图标） | /api/v1/human-handoff | 同上 |
| 欢迎引导（首次） | /welcome | 吉小农自我介绍 + 首屏进入按钮 | — | 同上 |

## 8. 设计 Token（锁定）

> 设计师已产出 `jlau-ai-assistant/design-system/design-tokens.json`（机器可读，前端 import）。前端禁止硬编码颜色，全部走 Token 变量。

- **主色（操作/CTA）**：`--accent` = #07C160（微信绿，每屏≤2 处：发送钮/主按钮）
- **AI 身份色**：`--accent-2` = #14BF96（薄荷绿，仅 AI 头像环/名 chip/气泡淡底，≤2处）
- **品牌深林绿**：`--accent-3` = #1A6B3C（页标题/品牌位/AI 名 chip 底/空状态插画）
- **中性**：bg #F5F6F7 / surface #FFFFFF / fg #1A1A1A / muted #8A9099 / border #E6E8EB
- **语义**：success #1AAD19 / warn #FF9F0A / danger #FA5151 / link #576B95
- **气泡**：用户 = #ECEEF1（中性灰，右下）；吉小农 = #E9F8F3（薄荷绿淡底）+ 深林绿文字 #0F3D2A（左下，镜像小切角）
- **深色主题**：已定义（bg #0E0F12 起，亮度递进表达层级）
- **字体**：微信内系统字体栈（-apple-system / PingFang SC…）；微信外 H5 着陆页 Inter + Noto Sans SC。字号阶梯 11–20px，字重 400/500/600
- **圆角** ≤16px；**间距** 4px 网格；**动效** 150–200ms + prefers-reduced-motion
- **图标库（锁定 Lucide）**：16px 行内 / 20px 按钮内 / 24px 独立·导航栏·AI 标记；currentColor 继承；TabBar 仅本地 PNG（Lucide CLI 生成，禁 SVG/iconfont/emoji 进 TabBar）
- **场景图标映射**：报到=MapPin、选课=BookOpen、考研=GraduationCap、生活=Coffee（均 Lucide SVG）
- **P0 红线**：零 emoji 功能图标 / 无紫粉渐变 / 无空洞占位（用真实校园文案：图书馆几点关门、新生报到流程）/ 颜色全走 Token / 首屏即聊天产品（非千篇一律 Hero）

## 9. 验收标准（锁定——QA 测试时以此为唯一依据，EARS 格式）

| 编号 | 功能 | EARS 格式验收标准 | 优先级 |
|------|------|-------------------|--------|
| AC-01 | 知识库冷启动 | Given 专家团已联网采集吉农公开信息，When 导入结构化知识库，Then 覆盖「报到/交通/住宿/缴费/户口/档案/军训/校园卡/食堂/地标」≥10 主题且每条来源可溯 | P0 |
| AC-02 | 自然语言问答 | Given 知识库含「新生报到需带录取通知书、身份证、档案、户口迁移证(如需)、10张小2寸照」，When 用户问「报到要带啥」，Then 返回清单并标注信息来源与更新日期 | P0 |
| AC-03 | 幻觉防控 | Given 用户问「吉农保研率多少/某专业分数线」，When 知识库无对应条目或低置信，Then 不编造，返回「建议联系招生办(0431-84532980)或学工处」并给「猜你想问」 | P0 |
| AC-04 | 兜底转人工 | Given 连续 2 次低置信或用户点「答错了」，When 系统判定需转人工，Then 展示学工处/辅导员联系入口（文字按钮，非 emoji） | P0 |
| AC-05 | 答案反馈 | Given 用户收到回答，When 点「有帮助」或「报错」，Then 记录事件并进入未知问题/纠错队列 | P0 |
| AC-06 | 多端入口 | Given 用户在微信打开 H5 薄壳/公众号，When 输入问题，Then 聊天界面 3 秒内返回首字（弱网出加载态） | P0 |
| AC-07 | 零代码维护 | Given 运营学生在 Coze 控制台，When 上传一份《2026 新生入学须知》PDF 或粘贴官网链接，Then 系统自动解析入库并经审核后生效，无需写代码 | P0 |
| AC-08 | 多轮上下文 | Given 用户已问「从长春站怎么去学校」并收到回复，When 追问「那宿舍能洗澡吗」，Then 承接上文返回宿舍楼说明 | P1 |
| AC-09 | 图标合规 | Given 全站任意功能图标，When 渲染，Then 均为 Lucide SVG（16/20/24px），无 emoji、无混库 | P0 |
| AC-10 | 合规标识 | Given 吉小农任一回答，When 呈现，Then 含 AI 生成内容显著标识，且不收集隐私字段 | P0 |

## 10. 边界与约束

- 不支持 IE；兼容微信最新版（iOS/Android）+ 主流浏览器 H5（Chrome/Safari/Firefox 最新 2 版）
- 响应式断点：移动优先，H5 适配 375/414 宽度
- 性能目标：首屏加载 < 3s；问答首字返回 < 3s（弱网出加载态）；API p95 < 800ms
- 合规：个人主体走公众号/抖音；AI 内容显著标识；遵守《生成式人工智能服务管理暂行办法》；知识库个人信息脱敏；不上传身份证/银行卡/家庭地址
- 安全：HTTPS；输入校验；速率限制防刷；薄壳不暴露 Coze token；不留存敏感个人信息日志
- 内容边界：仅基于校本知识库回答，涉政/涉敏转人工
- 数据埋点（P1）：mini_program_enter / first_question_asked / session_start / answer_helpful / answer_reported / fallback_triggered / error_occurred；不采集 IP、不存原始输入全文，仅存脱敏问题摘要

## 11. 内嵌已知坑（从项目记忆拉取）

> 项目首次构建，`.workbuddy/memory/pitfalls.jsonl` 暂无历史记录。基于架构师风险登记（ADR-001 §6）预置以下 MVP 注意事项，开发时规避：

| 坑 | 技术栈指纹 | 根因 | 修法 |
|----|------------|------|------|
| 小程序 TabBar 不渲染 SVG | Taro / 微信小程序 | TabBar 仅接受本地 PNG | 用 Lucide CLI 生成 PNG，禁 SVG/iconfont/emoji 进 TabBar（ADR-002） |
| Lucide 在 H5 需内联 SVG | H5 / lucide-static | 内联 SVG 才可控色与尺寸 | 用 lucide-static 内联，统一 Icon 封装层 |
| 流式 SSE 跨域/代理断流 | 云函数 / SSE | 前端直连 Coze 暴露 token 且跨域 | 经云函数代理转发，前端不持 token，启用 chunked 流式 |
| Coze KB 不支持多人协作 | Coze 平台 | 仅所有者可编辑 | MVP 单人维护；规模化迁自建无代码后台 |
| 微信小程序 AI 问答类目仅企业主体 | 微信平台 | 个人主体审核被拒 | MVP 走公众号/抖音；小程序列企业主体后 scale-up |

## 12. 端到端验证步骤（Spec 锁定的最后一项）

```bash
# 0. 前置：Coze 智能体已建（bot_id 配置到薄壳环境变量），知识库已导入新生报到初版
# 1. 启动薄壳 H5 开发服务器
npm run dev   # 等待 "Ready on http://localhost:3000"

# 2. 核心成功流：新生问报到要带啥
curl -N -X POST http://localhost:3000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"scenario_id":"baodao","message":"报到要带什么","history":[],"conversation_id":"test-001"}'
# 断言：SSE 流式返回，含「录取通知书/身份证/档案」清单 + 来源标注

# 3. 关键错误流：问知识库无答案
curl -N -X POST http://localhost:3000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"scenario_id":"baodao","message":"吉农保研率多少","history":[],"conversation_id":"test-002"}'
# 断言：不编造，返回「建议联系招生办 0431-84532980」+ 猜你想问

# 4. 反馈流
curl -X POST http://localhost:3000/api/v1/feedback \
  -H "Content-Type: application/json" \
  -d '{"message_id":"m001","type":"helpful"}'
# 断言：返回 {code:0,data:...,message:"ok"}

# 5. 场景入口
curl http://localhost:3000/api/v1/scenarios
# 断言：返回 [{"id":"baodao","name":"新生报到","icon":"MapPin","lucide_icon":"MapPin"}]

# 6. 视觉门禁：打开 http://localhost:3000/chat
# 断言：微信绿发送钮 + 吉小农薄荷绿气泡 + 猜你想问 2×2 卡；全站无 emoji 图标、无紫粉渐变
```

## 13. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|----------|------|----------|
| 2026-07-30 | Spec v1.0 生成并锁定 | 用户确认三文档 + 范围（新生报到单场景 / 公众号·抖音+Coze / 吉小农） | 全文档 |
