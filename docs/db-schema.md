# 吉小农 薄壳侧数据持久化 Schema（MVP）

> 依据：SPEC.md §6（数据库表清单，锁定）。
> 存储引擎：云函数配套文档存储（CloudBase / 等价 FaaS 文档数据库）。MVP 极轻，知识库本身在 Coze 托管不建表。
> 约定：本文档以 JSON 文档表达每个集合，等价于建表语句；`_id` 由文档数据库自动生成，不手动写入。
> 字段类型标注采用文档库通用语义：`string` / `int` / `bool` / `date`(ISO-8601 UTC) / `array` / `object` / `enum`。

---

## 0. 全局约定

- **统一响应结构**（与 openapi.yaml 一致）：所有 JSON 端点返回 `{ code, data, message }`，`code=0` 成功。
- **图标映射单一事实源**：`scenarios.lucide_icon_name` 是场景 → Lucide 图标的唯一权威字段；前端 `GET /api/v1/scenarios` 返回的 `lucide_icon` 即由该字段映射而来（见 §1 与 openapi.yaml `ScenarioItem`）。
- **隐私合规**（SPEC §10）：`human_handoff.contact` 仅存粗粒度回访标识（如微信昵称），禁止写入手机号、身份证、银行卡、家庭地址；`feedback` / `human_handoff` 的 `question` 仅存脱敏摘要，不存原始输入全文。
- **时间字段**：统一 `created_at`（ISO-8601 UTC 字符串），建索引以支持按时间排序与看板统计。

---

## 1. scenarios（场景注册表 —— 分类入口驱动，含图标映射单一事实源）

驱动分类入口（/scenarios）与聊天主页标题（/chat?scenario=）。MVP 仅 1 条（baodao）；其余 3 条为 v2 预置但 `enabled=false`，保持图标映射在数据库侧唯一事实源。

### 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 文档主键 |
| `id` | string | 是 | 场景业务标识（API 用），如 `baodao` |
| `name` | string | 是 | 场景展示名，如「新生报到」 |
| `lucide_icon_name` | string | 是 | **Lucide 图标名（图标映射单一事实源）**；取值须为 Lucide 图标名，如 `MapPin` |
| `icon` | string | 否 | 兼容别名，值与 `lucide_icon_name` 一致（前端 `ScenarioItem.icon`） |
| `kb_ref` | string | 是 | 对应 Coze 知识库引用，如 `coze:kb_baodao_v1` |
| `sort` | int | 是 | 展示排序，升序 |
| `enabled` | bool | 是 | 是否在入口展示；MVP 仅 baodao=true |
| `created_at` | date | 是 | 创建时间（ISO-8601 UTC） |

### 索引

- 唯一索引：`id`（场景业务标识唯一）
- 普通索引：`sort`（分类入口排序）
- 普通索引：`enabled`（过滤已启用场景）

### 示例文档（MVP + v2 预置，图标映射全在库内）

```json
// MVP 启用
{
  "_id": "auto",
  "id": "baodao",
  "name": "新生报到",
  "lucide_icon_name": "MapPin",
  "icon": "MapPin",
  "kb_ref": "coze:kb_baodao_v1",
  "sort": 1,
  "enabled": true,
  "created_at": "2026-07-30T08:00:00Z"
}

// v2 预置（未启用，图标映射已在库内锁定，避免设计师/前端各自硬编码）
{
  "_id": "auto",
  "id": "xuanke",
  "name": "选课",
  "lucide_icon_name": "BookOpen",
  "icon": "BookOpen",
  "kb_ref": "coze:kb_xuanke_v1",
  "sort": 2,
  "enabled": false,
  "created_at": "2026-07-30T08:00:00Z"
}
{
  "_id": "auto",
  "id": "kaoyan",
  "name": "考研",
  "lucide_icon_name": "GraduationCap",
  "icon": "GraduationCap",
  "kb_ref": "coze:kb_kaoyan_v1",
  "sort": 3,
  "enabled": false,
  "created_at": "2026-07-30T08:00:00Z"
}
{
  "_id": "auto",
  "id": "shenghuo",
  "name": "生活",
  "lucide_icon_name": "Coffee",
  "icon": "Coffee",
  "kb_ref": "coze:kb_shenghuo_v1",
  "sort": 4,
  "enabled": false,
  "created_at": "2026-07-30T08:00:00Z"
}
```

> 图标映射与 ADR-002 / SPEC §8 完全一致：报到=MapPin、选课=BookOpen、考研=GraduationCap、生活=Coffee。扩展场景须从 Lucide 集内选取，并在本集合 `lucide_icon_name` 登记，作为唯一事实源。

---

## 2. feedback（答案反馈 —— 知识库迭代 / 未知问题队列）

记录用户对单条回答的「有帮助 / 报错」事件。

### 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 文档主键 |
| `message_id` | string | 是 | 被反馈回答的标识（来自 chat 流 `done` 事件的 `message_id`） |
| `type` | enum | 是 | `helpful` 或 `reported` |
| `note` | string(null) | 否 | 报错补充说明；无则为空串或 null |
| `scenario_id` | string | 是 | 所属场景标识（关联 scenarios.id） |
| `created_at` | date | 是 | 反馈时间（ISO-8601 UTC） |

### 索引

- 普通索引：`scenario_id`（按场景聚合满意度）
- 普通索引：`created_at`（时间排序 / 看板）
- 复合索引：`{ scenario_id: 1, created_at: -1 }`（场景内按时间倒序看板）

### 示例文档

```json
{
  "_id": "auto",
  "message_id": "m-8f3a",
  "type": "helpful",
  "note": "",
  "scenario_id": "baodao",
  "created_at": "2026-07-30T09:00:00Z"
}
{
  "_id": "auto",
  "message_id": "m-8f3a",
  "type": "reported",
  "note": "来源链接已失效",
  "scenario_id": "baodao",
  "created_at": "2026-07-30T09:05:00Z"
}
```

---

## 3. human_handoff（兜底转人工登记 —— 兜底队列）

低置信 / 无答案 / 用户点「答错了」时登记工单。

### 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 文档主键 |
| `scenario_id` | string | 是 | 触发场景标识（关联 scenarios.id） |
| `question` | string | 是 | 用户原始问题脱敏摘要（不存完整原始输入全文） |
| `contact` | string(null) | 否 | 可选回访标识（建议微信昵称等粗粒度；禁隐私字段） |
| `status` | enum | 是 | `pending` / `contacted` / `resolved` |
| `created_at` | date | 是 | 登记时间（ISO-8601 UTC） |

### 索引

- 普通索引：`status`（兜底队列按状态筛选）
- 普通索引：`created_at`（时间排序）
- 复合索引：`{ status: 1, created_at: -1 }`（待处理队列按时间倒序）

### 示例文档

```json
{
  "_id": "auto",
  "scenario_id": "baodao",
  "question": "吉农保研率多少",
  "contact": "微信：xiaoming2026",
  "status": "pending",
  "created_at": "2026-07-30T09:10:00Z"
}
```

---

## 4. features（快捷问题 / 猜你想问卡片）

驱动聊天主页「猜你想问」卡组与场景入口快捷卡。MVP 写入报到域 4~6 条。

### 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 自动 | 文档主键 |
| `scenario_id` | string | 是 | 所属场景标识（关联 scenarios.id） |
| `text` | string | 是 | 卡片展示文案（真实校园问题，非占位） |
| `sort` | int | 是 | 同场景内展示排序，升序 |

### 索引

- 普通索引：`scenario_id`（按场景取卡）
- 复合索引：`{ scenario_id: 1, sort: 1 }`（场景内按序取卡）

### 示例文档（报到域 6 条）

```json
{
  "_id": "auto",
  "scenario_id": "baodao",
  "text": "报到要带什么材料",
  "sort": 1
}
{
  "_id": "auto",
  "scenario_id": "baodao",
  "text": "从长春站怎么去学校",
  "sort": 2
}
{
  "_id": "auto",
  "scenario_id": "baodao",
  "text": "宿舍怎么分配",
  "sort": 3
}
{
  "_id": "auto",
  "scenario_id": "baodao",
  "text": "学费怎么交",
  "sort": 4
}
{
  "_id": "auto",
  "scenario_id": "baodao",
  "text": "校园卡怎么激活",
  "sort": 5
}
{
  "_id": "auto",
  "scenario_id": "baodao",
  "text": "军训要准备什么",
  "sort": 6
}
```

---

## 5. 索引创建参考（CloudBase 文档库 SDK 伪代码）

```javascript
// 云函数初始化（Node.js / CloudBase 文档库）
const tcb = require('tcb-admin-node');
const db = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV }).database();

async function ensureIndexes() {
  await db.collection('scenarios').createIndex({ id: 1 }, { unique: true });
  await db.collection('scenarios').createIndex({ sort: 1 });
  await db.collection('scenarios').createIndex({ enabled: 1 });

  await db.collection('feedback').createIndex({ scenario_id: 1 });
  await db.collection('feedback').createIndex({ created_at: 1 });
  await db.collection('feedback').createIndex({ scenario_id: 1, created_at: -1 });

  await db.collection('human_handoff').createIndex({ status: 1 });
  await db.collection('human_handoff').createIndex({ created_at: 1 });
  await db.collection('human_handoff').createIndex({ status: 1, created_at: -1 });

  await db.collection('features').createIndex({ scenario_id: 1 });
  await db.collection('features').createIndex({ scenario_id: 1, sort: 1 });
}
```

---

## 6. 集合 → API 映射速查

| 集合 | 驱动 API | 关键返回字段 |
|------|----------|--------------|
| scenarios | `GET /api/v1/scenarios` | `id, name, icon, lucide_icon`（lucide_icon ← lucide_icon_name） |
| features | `GET /api/v1/features` | `id, text, scenario_id` |
| feedback | `POST /api/v1/feedback` | 写入；响应 `data:{id,message_id,type}` |
| human_handoff | `POST /api/v1/human-handoff` | 写入；响应 `data:{id,scenario_id,status}` |

> chat 端点本身不落库（流式转发 Coze），仅其 `done` 事件产出的 `message_id` 被 feedback 引用。
