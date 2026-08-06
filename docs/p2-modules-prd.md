# 吉小农 · P2 功能模块扩展 · 增量 PRD

> 产品经理：许清楚 · 版本：v1.0 · 类型：**增量 PRD（简单档）**
> 范围：`jlau-ai-assistant/web/`（纯前端增量，**后端零改动**）
> 上游：`docs/maimai-capabilities-prd.md` / `docs/maimai-capabilities-arch.md`（本增量在其 **P2「更多内置场景模块」**上落地）
> 下游：交付给架构师（高见远）做增量架构设计与任务分解

---

## 0. 项目信息

| 项 | 值 |
|---|---|
| Language | 中文 |
| Programming Language | Vite + React 18 + TypeScript（**沿用现有栈**，无 Tailwind、无 MUI；样式走 `global.css` + design tokens CSS 变量） |
| Project Name | `jlau_p2_modules` |
| 形态约束 | H5 小程序形态，不引入登录 / 服务端存储 / 第三方依赖 |
| 设计系统 | 「田垄与纸」（`docs/design_refresh_system.md`），农大绿 `--accent #3D6B51`、麦金 `--grain #B58234` |
| 复用模式 | **MODULE_REGISTRY 数据驱动**（既有），新模块 = registry 1 条 + `App.tsx` `MODULE_PAGES` 1 行 |

### 0.1 原始需求复述

用户在既有模块系统（已有「校历作息」「周边美食」两个演示模块）之上，要求**再扩展 3 个演示模块**：

1. **常用电话** —— 校内常用部门 / 服务电话，可点击 `tel:` 直接拨号。
2. **失物招领** —— 一个**本机可见**的失物 / 捡到物登记板，纯前端，数据存 `localStorage`，仅本设备可见。
3. **绩点估算** —— 本地加权 GPA 计算器，用户维护课程列表（名称 / 学分 / 成绩），本地计算加权平均分与绩点。

### 0.2 用户已拍板决策（不可再议，直接落地）

| # | 决策项 | 结论 |
|---|---|---|
| **D1** | 存储 | **localStorage 按设备本地存**，无登录、无服务端、**零后端改动**。`server/**`、`web/src/lib/api.ts`、`web/src/types/api.ts`、`web/src/lib/theme.ts`、`web/src/lib/tokens.ts`、`web/package.json` **一律不动** |
| **D2** | 模块接入方式 | **注册表驱动**：只在 `web/src/modules/registry.ts` 加一条 + `App.tsx` 的 `MODULE_PAGES` 查表加一项，列表 / 路由自动出现。**不新造路由范式**，复用既有 `MODULE_REGISTRY` + `ModuleGuard` |
| **D3** | 存储单一出口 | 3 个新模块的存储键**必须**注册进 `web/src/lib/storage.ts` 的 `STORAGE_DESCRIPTORS`（失物招领、绩点课程表**各一个 key**；常用电话是静态内置数据，**无存储键**） |
| **D4** | 设计系统 | 配色 / 卡片 / 间距 / 图标（自绘 `SceneIcon` + lucide `Icon`）沿用「田垄与纸」；kebab 数字变量命名；**禁**裸 hex / `backdrop-filter` / `linearGradient`；`prefers-reduced-motion` 关动效 |
| **D5** | 失物招领范围 | **纯本地**：用户在本机添加 / 删除条目，仅本设备可见，**不做**发布 / 跨用户 / 跨端同步 / 后端。这是演示模块，不承诺同步 |
| **D6** | 绩点估算范围 | **纯本地加权计算器**，课程数据存 `localStorage`，计算逻辑全在前端 |

---

## 1. 产品目标

把新生入学后**最高频的三件小事**从「翻公众号 / 问学长 / 打开计算器」沉淀成模块中心里可一键直达的常驻入口：**遇事能找到人**（常用电话：号码内置、点一下就拨，不用记不用存通讯录）、**丢东西有地方记**（失物招领：随手在本机记一笔"哪天在哪丢了什么"，不至于第二天连丢在哪都想不起来）、**成绩心里有数**（绩点估算：输入学分和分数，当场算出加权平均分与绩点，不必再去下载一个 App）。三个模块共同的产品性格是——**贴近刚需、用完即走、本机私有**：不需要注册、不上传任何数据、关掉模块就从入口消失，用最低的心理成本换最直接的实用价值。

---

## 2. 用户故事

### 模块一：常用电话

| # | 用户故事 |
|---|---|
| **US-01** | 作为一名**刚报到、人生地不熟的新生**，我想在助手里直接找到招生办、校医院这些校内号码并**点一下就拨出去**，以便我遇到事情时不用满群翻聊天记录找电话。 |
| **US-02** | 作为一名**遇到紧急情况的学生**，我想按「紧急 / 报到 / 医疗」这类分类快速定位，或者直接搜关键词，以便我在着急的时候三秒内找到该打哪个号。 |

### 模块二：失物招领

| # | 用户故事 |
|---|---|
| **US-03** | 作为一名**刚丢了校园卡的新生**，我想随手记下"10-12 在三食堂丢了校园卡"，以便我后面去问失物招领处或发群时，能准确说出时间地点，而不是一句"好像前几天丢的"。 |
| **US-04** | 作为一名**捡到别人东西的同学**，我想把捡到的物品和归还方式记在本机，找到失主后一键标记「已解决」或删掉，以便这块登记板始终只剩还没处理完的事。 |

### 模块三：绩点估算

| # | 用户故事 |
|---|---|
| **US-05** | 作为一名**期末刚出分的学生**，我想把这学期的课程名、学分和分数逐条填进去，以便当场看到加权平均分和绩点，判断自己够不够奖学金 / 保研线。 |
| **US-06** | 作为一名**在做选课权衡的学生**，我想改一门课的预估分数看绩点怎么变，并且课程列表下次打开还在，以便我反复试算而不用每次重新录一遍。 |

---

## 3. 需求池

> 优先级定义：**P0 = 本迭代必做 MVP** / **P1 = 应该做** / **P2 = 锦上添花**
> 需求语言：**必须**（must）/ **应当**（should）/ **可以**（could）

### 3.1 P0 —— 本迭代 MVP（必做）

#### PRD-P2-01 常用电话模块

| 项 | 内容 |
|---|---|
| **标题** | 常用电话（静态内置数据 + `tel:` 拨号 + 分类筛选 + 关键词搜索） |
| **描述** | 新增模块 `phone`，路由 `/modules/phone`。页面消费 `web/src/modules/phone/data.ts` 中的**静态内置数据**（**无 localStorage 键**）。每条号码渲染为一张卡片，含机构名、号码、用途说明、来源标注；点击号码区域触发 `tel:` 拨号。顶部提供**分类筛选 pill**（复用美食页 `.filter-pills` 交互）与**关键词输入框**（对机构名 / 号码 / 用途做子串匹配，二者可叠加生效）。数据分两类来源：① **本地知识库可溯源的校内号码**；② **全国公共服务号码**。**严禁臆造任何未经核实的号码**——KB 中查不到的部门（教务处 / 学工处 / 后勤 / 保卫处 / 图书馆）**本迭代不收录**，改由页面底部"没找到？问吉小农"按钮引流回对话。 |
| **验收标准** | ① 模块中心出现「常用电话」一行，点击进入 `/modules/phone`，关闭开关后直接访问 URL 被 `ModuleGuard` 重定向回 `/modules`；<br>② 数据集条目 **≥ 10 条**，覆盖 **≥ 4 个分类**，每条 `phone` 字段均为纯数字 / 短横线（可被 `tel:` 正确解析），且每条带非空 `source` 来源标注；<br>③ 点击号码在移动端浏览器唤起拨号面板（桌面端不报错、不白屏）；<br>④ 切换分类 pill 正确过滤，「全部」可复位；输入关键词与分类**叠加生效**；无结果时显示空态文案而非空白；<br>⑤ 页面底部**必须**有免责文案，说明"号码来自本地知识库整理，可能变更，以学校官方通知为准"；<br>⑥ **不新增任何 `jxn-*` 存储键**（隐私中心清单不因本模块增加条目）。 |

**内置数据集（P0 交付集，来源可溯源）**

| # | 机构 / 用途 | 号码 | 分类 | 来源 |
|---|---|---|---|---|
| 1 | 招生就业工作处（报到 / 请假咨询） | 0431-84532980 | 报到入学 | KB `01-报到流程.md` / `11-联系方式求助.md` |
| 2 | 招生申诉 | 0431-84532752 | 报到入学 | KB `11-联系方式求助.md` |
| 3 | 吉林农业大学医院 | 0431-84532820 | 医疗健康 | KB `18-医疗校医院周边医院.md` |
| 4 | 研究生招生办公室 | 0431-84533048 | 升学深造 | KB `11-联系方式求助.md` |
| 5 | 研究生招生办公室（备用线） | 0431-84533049 | 升学深造 | KB `11-联系方式求助.md` |
| 6 | 党委研究生工作部教育管理科（档案接收） | 0431-84533149 | 升学深造 | KB `06-档案转接.md` / `11-联系方式求助.md` |
| 7 | 党委研究生工作部教育管理科（备用线） | 0431-84533305 | 升学深造 | KB `06-档案转接.md` / `11-联系方式求助.md` |
| 8 | 报警 | 110 | 紧急求助 | 全国公共号码 |
| 9 | 火警 | 119 | 紧急求助 | 全国公共号码 |
| 10 | 急救 | 120 | 紧急求助 | 全国公共号码 |
| 11 | 交通事故报警 | 122 | 紧急求助 | 全国公共号码 |
| 12 | 全国反诈专线 | 96110 | 紧急求助 | 全国公共号码 |
| 13 | 全国心理援助热线 | 12356 | 心理支持 | 全国公共号码 |

> **分类枚举（5 个）**：`紧急求助` / `报到入学` / `医疗健康` / `升学深造` / `心理支持`。
> **「全部」不是真实分类**，由页面在渲染时拼在分类数组前，**不写进数据**（沿用 `FoodModulePage` 的既有做法）。

**数据契约（`web/src/modules/phone/data.ts`）**

```ts
export type PhoneCategory = '紧急求助' | '报到入学' | '医疗健康' | '升学深造' | '心理支持';
export const PHONE_CATEGORIES: readonly PhoneCategory[];

export interface PhoneItem {
  id: string;              // 稳定 id，如 'zhaosheng'
  name: string;            // 机构 / 用途名
  phone: string;           // 仅数字与短横线，供 tel: 使用
  category: PhoneCategory;
  purpose: string;         // 一句话用途，≤30 字
  source: string;          // 来源标注，非空
}
export const PHONE_ITEMS: readonly PhoneItem[];
export const PHONE_DISCLAIMER: string;
```

---

#### PRD-P2-02 失物招领模块

| 项 | 内容 |
|---|---|
| **标题** | 失物招领（本机增删改查 + 「丢失 / 捡到」类型标记 + 「已解决」状态 + 清空） |
| **描述** | 新增模块 `lostfound`，路由 `/modules/lostfound`。**纯本地登记板**：用户在本机新增一条记录（类型「我丢了」/「我捡到」、物品名称、地点、日期、联系方式、备注），列表按创建时间**倒序**展示；每条可**一键切换「已解决」**（视觉上降权 / 划除，不删除）、可**单条删除**；页面底部提供**清空全部**（走既有 `DangerConfirmButton` 就地二次确认）。数据写入新键 `jxn-lostfound`，**必须**在 `STORAGE_DESCRIPTORS` 注册描述符。**本迭代不做图片附件**（见 §5 Q3），不做发布 / 跨端 / 后端。 |
| **验收标准** | ① 新增一条记录后刷新页面，记录仍在；切到其他页再返回，记录仍在；<br>② 类型「我丢了 / 我捡到」在列表上有**明确视觉区分**（不同标签文案，不依赖颜色单通道传达）；<br>③ 点击「已解决」后该条视觉降权且**不从列表消失**，再点可撤销；<br>④ 单条删除、清空全部均需**二次确认**，取消后数据不变；<br>⑤ **空态**必须有引导文案 + 「记一笔」按钮，不得出现空白页；<br>⑥ 物品名称为空白时**禁止提交**并提示；名称 / 地点 / 联系方式 / 备注按上限截断，不报错；<br>⑦ 条目数达上限（**50 条**）时提示"先清理几条"，不静默丢弃；<br>⑧ 手动把 `jxn-lostfound` 改成非法 JSON 后刷新，页面**回落空列表且不白屏**；<br>⑨ 隐私中心 `/privacy` 清单中**必须**出现「失物招领记录」一项，摘要为 `N 条`，可单独清除；<br>⑩ 页面必须有"仅保存在这台设备上，换设备 / 清浏览器数据会丢失"的隐私说明。 |

**数据契约（`web/src/types/local.ts` 追加）**

```ts
/** 'lost' = 我丢了；'found' = 我捡到 */
export type LostFoundKind = 'lost' | 'found';
/** 'open' = 未解决；'done' = 已解决（保留在列表中，视觉降权） */
export type LostFoundStatus = 'open' | 'done';

export interface LostFoundItem {
  id: string;               // `lf-${Date.now()}-${seq}`
  kind: LostFoundKind;
  title: string;            // 物品名称，必填，≤20 字
  place: string;            // 地点，可空，≤20 字
  date: string;             // 'YYYY-MM-DD'，默认今天
  contact: string;          // 联系方式，可空，≤30 字
  note: string;             // 备注，可空，≤100 字
  status: LostFoundStatus;
  createdAt: number;
  updatedAt: number;
}

export interface LostFoundData {
  version: 1;
  items: LostFoundItem[];   // 上限 LOSTFOUND_MAX = 50
}
export const LOSTFOUND_MAX = 50;
```

**存储描述符（`web/src/lib/storage.ts` 追加）**

| 描述符 id | key | kind | 人类可读名 | 用途说明 | 计数口径 | managed |
|---|---|---|---|---|---|---|
| `lostfound` | `jxn-lostfound` | exact | 失物招领记录 | 你在本机记下的丢失与捡到 | `N 条` | ✅ |

---

#### PRD-P2-03 绩点估算模块

| 项 | 内容 |
|---|---|
| **标题** | 绩点估算（课程增删 + 学分 / 成绩输入 + 加权平均分与加权绩点 + 本地持久化） |
| **描述** | 新增模块 `gpa`，路由 `/modules/gpa`。用户逐条添加课程（名称 / 学分 / 百分制成绩），列表可单条删除、可清空；页面顶部**结果横幅**实时展示三个数字：**总学分**、**加权平均分**、**加权绩点**。加权平均分 = `Σ(分数×学分) / Σ学分`（纯数学，无歧义）；加权绩点 = `Σ(单科绩点×学分) / Σ学分`，单科绩点走**内置 4.0 分段换算表**（见下），并在结果区**显式标注所用算法名与免责**。数据写入新键 `jxn-gpa`，**必须**注册描述符。**P0 只支持百分制成绩**，不做等级制、不做学期分组、不做换算规则切换（分别列入 P1）。 |
| **验收标准** | ① 添加课程后刷新页面，课程列表与计算结果**完全一致**；<br>② 加权平均分与加权绩点保留 **2 位小数**，四舍五入；<br>③ **零课程**时结果区显示占位（`--` 或"先添加一门课"），**不出现 `NaN` / `Infinity`**；<br>④ 总学分为 0（如所有课程学分填 0）时同样不出现 `NaN`，显示占位；<br>⑤ 学分输入限定 **0–20**、允许 0.5 步长；成绩输入限定 **0–100**；越界 / 非数字**禁止提交**并提示，不写入脏数据；<br>⑥ 换算表边界正确：`90 → 4.0`、`89 → 3.7`、`60 → 1.0`、`59 → 0`（QA 逐条比对 §PRD-P2-03 换算表）；<br>⑦ 结果区**必须**标注"采用 4.0 分段制，仅供参考，实际绩点以教务处认定为准"；<br>⑧ 手动把 `jxn-gpa` 改成非法 JSON 后刷新，页面回落空列表且不白屏；<br>⑨ 隐私中心清单出现「绩点课程表」一项，摘要为 `N 门`，可单独清除；<br>⑩ 课程数上限 **60 门**，触顶时提示而非静默丢弃。 |

**内置换算表（4.0 分段制，P0 唯一算法）**

| 百分制分数区间 | 单科绩点 |
|---|---|
| 90 – 100 | 4.0 |
| 85 – 89 | 3.7 |
| 82 – 84 | 3.3 |
| 78 – 81 | 3.0 |
| 75 – 77 | 2.7 |
| 72 – 74 | 2.3 |
| 68 – 71 | 2.0 |
| 64 – 67 | 1.5 |
| 60 – 63 | 1.0 |
| 0 – 59 | 0 |

> ⚠️ **该换算表未经吉林农业大学教务处核实**，采用国内高校通行的 4.0 分段口径，属**占位规则**。沿用校历模块的「占位标注 + 低成本替换」协议：换算表**必须**作为独立导出的常量数组存放于 `web/src/modules/gpa/data.ts`，替换时**只改这一个数组**，页面代码零改动。详见 §5 Q2。

**数据契约（`web/src/types/local.ts` 追加）**

```ts
export interface GpaCourse {
  id: string;        // `gpa-${Date.now()}-${seq}`
  name: string;      // 课程名，必填，≤20 字
  credit: number;    // 学分，0–20，允许 0.5 步长
  score: number;     // 百分制成绩，0–100
  term: string;      // 学期标签，P0 恒为 ''（为 P1 分组预留，守卫必须接受空串）
  createdAt: number;
}

export interface GpaData {
  version: 1;
  courses: GpaCourse[];   // 上限 GPA_COURSE_MAX = 60
}
export const GPA_COURSE_MAX = 60;
```

**存储描述符（`web/src/lib/storage.ts` 追加）**

| 描述符 id | key | kind | 人类可读名 | 用途说明 | 计数口径 | managed |
|---|---|---|---|---|---|---|
| `gpa` | `jxn-gpa` | exact | 绩点课程表 | 你录入的课程学分与成绩 | `N 门` | ✅ |

---

#### PRD-P2-04 模块注册与系统衔接

| 项 | 内容 |
|---|---|
| **标题** | 3 个新模块接入既有注册表 / 路由 / 隐私中心，**零渲染逻辑改动** |
| **描述** | 在 `web/src/modules/registry.ts` 追加 3 条 `ModuleDef`，在 `web/src/App.tsx` 的 `MODULE_PAGES` 查找表追加 3 行；在 `web/src/components/SceneIcon.tsx` 的 `SceneId` 追加 3 个取值并补 3 个自绘 case。**`ModulesPage.tsx` 与 `App.tsx` 的路由生成逻辑（`MODULE_REGISTRY.map()`）一行不改**。`lib/storage.ts` 追加 2 条描述符后，隐私中心的清单 / 导出 / 分项清除 / 全部清除**自动覆盖**新键。 |
| **验收标准** | ① `ModulesPage.tsx` 的 `git diff` 为**空**（列表自动多出 3 行，计数从 "已开启 2 / 2" 变为 "已开启 5 / 5"）；<br>② `App.tsx` 的改动**只有** import 3 行 + `MODULE_PAGES` 3 行，`Routes` 内的 `MODULE_REGISTRY.map()` 代码块**未被修改**；<br>③ 3 个新模块的开关状态可独立持久化，关闭后直接访问 URL 被重定向回 `/modules`（`replace`，返回键不死循环）；<br>④ 3 枚新 `SceneIcon` 与既有 6 枚**风格一致**（24×24 网格、`currentColor`、`fill="none"`、`strokeWidth 1.75`），且与既有 6 枚**图形明显可区分**；<br>⑤ 新增 SVG 中 **hex 色值 = 0、`<linearGradient>` = 0、`fill` 实色 = 0**；<br>⑥ `grep -rn "localStorage" web/src --include=*.ts --include=*.tsx` 结果**仍只命中** `lib/storage.ts`、`lib/theme.ts`、`pages/ChatPage.tsx` 三个文件。 |

**注册表新增 3 条**

| id | name | desc（≤14 字） | icon | path | defaultEnabled | order |
|---|---|---|---|---|---|---|
| `phone` | 常用电话 | 校内号码一键拨 | `phone` | `/modules/phone` | `true` | 30 |
| `lostfound` | 失物招领 | 本机记一笔丢与捡 | `lostfound` | `/modules/lostfound` | `true` | 40 |
| `gpa` | 绩点估算 | 算算这学期绩点 | `gpa` | `/modules/gpa` | `true` | 50 |

---

### 3.2 P1 —— 应该做（本迭代之后）

| # | 标题 | 描述 | 验收标准 |
|---|---|---|---|
| **PRD-P2-05** | 失物招领按状态筛选 | 列表上方增加筛选 pill：`全部 / 我丢了 / 我捡到 / 已解决`，与既有 `.filter-pills` 交互一致 | 切换筛选正确过滤；「全部」可复位；每个筛选态下的空列表都有对应空态文案 |
| **PRD-P2-06** | 绩点按学期分组 | 启用 `GpaCourse.term` 字段，课程可归属学期；结果区可切换「全部 / 某学期」，分别计算 | 未填学期的课程归入「未分组」；旧数据（`term: ''`）自动落入「未分组」，**不丢课程、不需迁移脚本** |
| **PRD-P2-07** | 常用电话复制到剪贴板 | 每条号码增加「复制」动作（`navigator.clipboard.writeText`），复制成功 Toast 提示 | 复制后 Toast 提示"号码已复制"；`clipboard` 不可用（HTTP / 旧浏览器）时降级为**不显示该按钮**，不报错；需在 `Icon.tsx` 注册表追加 `Copy` 一枚 lucide 图标 |
| **PRD-P2-08** | 绩点换算规则可切换 | 结果区提供换算口径下拉：`4.0 分段制`（默认）/ `4.0 线性制 (分数−50)/10` / `5.0 制`；选择项随课程数据一起持久化 | 切换后所有数字立即重算；换算表以**数据驱动**方式扩展（新增一份数组常量即可），页面无 `if (scheme === ...)` 分支散落 |

### 3.3 P2 —— 锦上添花（更远）

| # | 标题 | 描述 |
|---|---|---|
| **PRD-P2-09** | 更多内置场景模块 | 依据本地知识库继续沉淀模块，候选：快递驿站、校内外公交、打印洗衣、周边商场 |
| **PRD-P2-10** | 模块内搜索增强 | 拼音首字母匹配、搜索历史、跨模块统一搜索入口 |
| **PRD-P2-11** | 绩点历史快照 | 每学期存一份计算快照，展示绩点随学期变化的趋势 |
| **PRD-P2-12** | 失物招领「问吉小农」引流 | 每条记录加「问吉小农」按钮，预填"我在 {place} 丢了 {title}，学校失物招领处在哪？"跳 `/chat?scenario=shenghuo&q=`（沿用美食模块引流模式） |

---

## 4. UI 设计稿

### 4.0 通用骨架（3 页共用）

3 个页面**必须**沿用 `CalendarModulePage` / `FoodModulePage` 的既有骨架，不发明新版式：

```
<AppShell title="{模块名}" onBack={() => navigate(-1)}>
  <div className="page-scroll">
    <div className="page-pad">
      <div className="screen-header">
        <div className="screen-title">{模块名}</div>
        <div className="screen-sub">{一句话说明}</div>
      </div>
      … 模块主体（若干 .section + .section-label）…
      <div className="section">
        <div className="privacy-note">{免责 / 隐私说明}</div>
      </div>
    </div>
  </div>
</AppShell>
```

**已存在、可直接复用的资产（不要重写）**

| 资产 | 位置 | 本次用途 |
|---|---|---|
| `AppShell` | `components/NavBar.tsx` | 3 页顶栏 + 返回 |
| `PillRadio` | `components/FormRow.tsx` | 分类 / 类型单选（`role="radiogroup"`，泛型 `<T extends string>`） |
| `FormRow` | `components/FormRow.tsx` | 失物招领 / 绩点的表单行（发丝线 + 64px 标签列） |
| `DangerConfirmButton` | `components/DangerConfirmButton.tsx` | 单条删除、清空全部的就地二次确认（3s 自动复位） |
| `useToast` | `components/Toast.tsx` | 校验失败 / 上限 / 存储失败提示 |
| `Icon` | `components/Icon.tsx` | `Phone` `Plus` `Trash2` `X` `ArrowRight` `CheckCircle` **均已在注册表内，P0 无需扩注册表** |
| `SceneIcon` | `components/SceneIcon.tsx` | **需扩 3 个 case**（见 §4.4） |
| `.filter-pills` / `.pill-radio-item.is-on` | `styles/global.css` | 横向滚动筛选组（美食页已落地） |
| `.food-card` 版式 | `styles/global.css` | 常用电话卡 / 失物卡可参照其结构（`--surface` + 发丝边 + 无阴影） |
| `.countdown-banner` 版式 | `styles/global.css` | 绩点结果横幅可参照（`--grain-soft` 底 + `--grain-deep` 字） |
| `.timetable-row` 等宽数字 | `styles/global.css` | 号码 / 学分 / 分数列用 `--font-mono` + `tabular-nums` |
| `readJson` / `writeJson` / `removeKey` | `lib/storage.ts` | **唯一** localStorage 通道 |

> **组件内联决策（延续既有约定）**：`PhoneCard` / `PhoneSearchBar` / `LostFoundCard` / `LostFoundForm` / `GpaResultBanner` / `GpaCourseRow` / `GpaAddForm` 均**只被单一页面消费**，作为同文件内的私有子组件实现，**不单独建文件**。仅当某个组件被 ≥2 页复用时才提取。

---

### 4.1 `/modules/phone` 常用电话

**结构（自上而下）**

```
screen-header  「常用电话」/「遇到事先别慌，这些号码点一下就能拨。」
搜索框         <input> 单行，placeholder「搜部门或号码」，右侧 X 清除（value 非空时才出现）
分类 pill      [全部] [紧急求助] [报到入学] [医疗健康] [升学深造] [心理支持]  ← .filter-pills 横滚
section-label  「{分类}（{N}）」
号码卡列表      PhoneCard × N
空态           「没找到相关号码，换个词试试。」
底部区         privacy-note 免责 + 「没找到？问吉小农 →」按钮
```

**PhoneCard 结构**

```
┌──────────────────────────────────────────┐
│ 招生就业工作处            [紧急求助]      │  ← 名称（正文色） + 分类微标
│ 0431-84532980                       [☎]  │  ← 号码 --font-mono 等宽 + 拨号图标按钮
│ 报到时间地点咨询、不能按期报到请假        │  ← purpose，--muted
│ 来源：知识库 11-联系方式求助              │  ← source，--meta 极小字
└──────────────────────────────────────────┘
```

- **整张卡是 `<a href="tel:0431-84532980">`**（不是 button + JS 跳转）——原生 `tel:` 链接在 iOS Safari / 微信内置浏览器兼容性最好，且无障碍语义天然正确；`aria-label` 写「拨打 招生就业工作处 0431-84532980」。
- 号码卡**无阴影**（`--surface` + `1px solid var(--border-soft)` + `--radius-lg`）。
- 「紧急求助」分类的微标可用 `--danger` **文字色**区分（**不占** `--accent` 实色配额，也不做实色红底）。

**用色配额**：`--accent` 实色 ① 选中的分类 pill，② 无 · `--grain` 0 处 · 浮起卡 0 张 ✅

---

### 4.2 `/modules/lostfound` 失物招领

**结构（自上而下）**

```
screen-header  「失物招领」/「随手记一笔，别让'好像前几天丢的'成为唯一线索。」
主 CTA         [＋ 记一笔]  ← 点击展开/收起下方表单（同页内联展开，不新开路由、不做 Modal）
新增表单        （折叠态默认收起）
  FormRow「类型」  PillRadio [我丢了] [我捡到]
  FormRow「物品」  input  placeholder「校园卡 / 蓝色雨伞…」  必填
  FormRow「地点」  input  placeholder「三食堂二楼」
  FormRow「日期」  input[type=date]  默认今天
  FormRow「联系」  input  placeholder「微信号 / 手机尾号」
  FormRow「备注」  textarea 2 行
  [保存]  [取消]
section-label  「我的记录（{N}）」
记录卡列表      LostFoundCard × N（createdAt 倒序）
空态           「还没有记录。丢了东西或捡到东西，先记一笔。」+ [＋ 记一笔]
底部区         privacy-note「这些记录只保存在这台设备上，不会上传，也不会被其他同学看到。」
              + DangerConfirmButton「清空全部记录」（列表非空时才渲染）
```

**LostFoundCard 结构**

```
┌──────────────────────────────────────────┐
│ [我丢了]  校园卡                    [✓][✕]│  ← 类型标签 + 物品名 + 已解决/删除
│ 10-12 · 三食堂二楼                        │  ← 日期 + 地点，--muted
│ 联系：微信 xiaoji2026                     │  ← contact，非空才渲染
│ 蓝色卡套，卡号尾号 8821                   │  ← note，非空才渲染
└──────────────────────────────────────────┘
```

- **类型区分必须双通道**：文案（「我丢了」/「我捡到」）+ 边框左侧 2px 竖条（`--accent` vs `--grain`）。**不得**只靠颜色。
- `status === 'done'` 时：整卡 `opacity` 降权 + 物品名 `text-decoration: line-through` + 类型标签换成「已解决」。**不从列表移除**。
- `[✓]` 切换已解决为**即时生效无需确认**（可撤销，代价低）；`[✕]` 删除走 `DangerConfirmButton` **二次确认**（不可撤销）。
- 日期展示截取 `MM-DD`（数据仍存完整 `YYYY-MM-DD`，沿用校历模块的 `formatMonthDay` 思路）。

**用色配额**：`--accent` 实色 ① 「记一笔」CTA，② 选中的类型 pill · `--grain` 0 处（类型竖条是 2px 细线，不构成实色块） · 浮起卡 0 张 ✅

---

### 4.3 `/modules/gpa` 绩点估算

**结构（自上而下）**

```
screen-header  「绩点估算」/「填学分和分数，当场看到加权平均分和绩点。」
结果横幅        GpaResultBanner  ← 本屏唯一 --grain-soft 底
  ┌────────────────────────────────────┐
  │   加权平均分        加权绩点        │
  │     86.42            3.51           │  ← 大号 --font-mono 数字
  │   共 5 门课 · 总学分 14.5           │
  └────────────────────────────────────┘
  零课程时：两个数字均显示「--」，副行显示「先添加一门课」
添加表单        FormRow「课程」input  ｜  FormRow「学分」input[inputmode=decimal]
               FormRow「成绩」input[inputmode=numeric]  ｜  [＋ 添加课程]
               ← 三个输入 + 一个按钮，横向紧凑排布（窄屏自动换行）
section-label  「课程列表（{N}）」
课程行列表      GpaCourseRow × N
  ┌──────────────────────────────────────┐
  │ 高等数学 A       4.0 学分   92   4.0 │  ← 名称 | 学分 | 分数 | 单科绩点  [✕]
  └──────────────────────────────────────┘
  数字列全部 --font-mono + tabular-nums，右对齐
空态           「还没有课程。先加一门试试。」
底部区         privacy-note「本页采用 4.0 分段制换算，仅供参考，实际绩点以教务处认定为准。
                          课程数据只保存在这台设备上。」
              + DangerConfirmButton「清空全部课程」（列表非空时才渲染）
```

- 结果数字**必须**用 `--font-mono` + `font-variant-numeric: tabular-nums`，避免数字跳动时宽度抖动。
- 计算为**纯函数**（`calcGpa(courses) → { totalCredit, weightedScore, weightedGpa }`），无副作用，便于 QA 直接单测边界。
- 添加表单校验失败时**输入框保留内容**（不清空），只 Toast 提示，避免用户重填。

**用色配额**：`--accent` 实色 ① 「添加课程」按钮，② 无 · `--grain` ① 结果横幅底 `--grain-soft` · 浮起卡 0 张 ✅

---

### 4.4 自绘 SceneIcon 方案（3 枚新图标）

`SceneId` 从 6 个扩到 9 个：`'baodao' | 'xuanke' | 'kaoyan' | 'shenghuo' | 'calendar' | 'food' | 'phone' | 'lostfound' | 'gpa'`。

**硬约束**：24×24 网格 · `fill="none"` · `stroke="currentColor"` · `strokeWidth 1.75` · `strokeLinecap/Linejoin="round"` · **禁 hex / 禁 `<linearGradient>` / 禁实色 fill**。

| SceneId | 图形语言 | 为什么这样画（可区分性论证） |
|---|---|---|
| `phone` | **号码本纸张 + 侧边索引齿 + 内嵌小听筒轮廓** | 表达「号码名录」而非「正在通话」。若直接画听筒会与 lucide `Phone`（顶栏「转人工」已在用）撞脸，用户会以为是同一个功能 |
| `lostfound` | **吊牌轮廓（一角斜切）+ 挂孔圆点 + 牌面一枚抽象问号笔画** | 表达「失物认领牌」。问号笔画是与通用 Tag 图标的关键区分点，也直观传达"这东西是谁的？" |
| `gpa` | **三根高低不同的竖柱 + 一条横跨柱顶的水平线** | 竖柱 = 各科成绩，水平线 = 加权平均。水平线是与通用柱状图图标的关键区分点，直接图示"平均"这个动作 |

> 三枚图标**均不得**出现人脸 / 五官 / 四肢（`Mascot.tsx` 的非拟人化约束同样适用于自绘图形语言的整体一致性）。

---

### 4.5 与 ModulesPage 的衔接

| 项 | 行为 |
|---|---|
| **列表出现** | `ModulesPage` 用 `sortedModules()` + `MODULE_REGISTRY.map()` 渲染，注册表加 3 条后**自动**多出 3 行，`ModulesPage.tsx` 零改动 |
| **排序** | 新模块 `order` 取 30 / 40 / 50，排在既有 calendar(10) / food(20) 之后 |
| **计数** | 「可用模块（已开启 N / M）」自动从 `2 / 2` 变为 `5 / 5` |
| **图标井** | 复用既有 `.scene-ico` 视觉井 + `<SceneIcon scene={def.icon} size={24} />`，无需新样式 |
| **开关** | 复用既有 `Switch` + `lib/modules.ts` 的 `setModuleEnabled`，写入既有 `jxn-modules` 键，**不新增存储键** |
| **路由守卫** | `App.tsx` 的 `MODULE_REGISTRY.map()` 自动为 3 个新 path 生成带 `ModuleGuard` 的 `<Route>`；关闭态直达 URL → `<Navigate to="/modules" replace />` |
| **隐私中心** | `lib/storage.ts` 加 2 条描述符后，`/privacy` 的清单 / 导出 / 分项清除 / 全部清除**自动覆盖** `jxn-lostfound` 与 `jxn-gpa`，`PrivacyPage.tsx` 零改动 |

### 4.6 预期文件影响面（供架构师核对，最终以架构文档为准）

| 类型 | 文件 | 说明 |
|---|---|---|
| 🆕 | `web/src/modules/phone/data.ts` | 常用电话静态数据 |
| 🆕 | `web/src/modules/lostfound/data.ts` | 失物招领常量 / 校验 / 纯函数（无静态条目） |
| 🆕 | `web/src/modules/gpa/data.ts` | **换算表常量** + `calcGpa` 纯函数 |
| 🆕 | `web/src/lib/lostfound.ts` | 失物招领领域层（对齐 `lib/profile.ts` 分层，唯一经 `storage.ts` 读写） |
| 🆕 | `web/src/lib/gpa.ts` | 绩点领域层（同上） |
| 🆕 | `web/src/pages/modules/PhoneModulePage.tsx` | — |
| 🆕 | `web/src/pages/modules/LostFoundModulePage.tsx` | — |
| 🆕 | `web/src/pages/modules/GpaModulePage.tsx` | — |
| ✏️ | `web/src/modules/registry.ts` | +3 条 `ModuleDef` |
| ✏️ | `web/src/App.tsx` | +3 行 import、+3 行 `MODULE_PAGES`（`Routes` 内逻辑不动） |
| ✏️ | `web/src/components/SceneIcon.tsx` | `SceneId` +3、`renderScene` +3 case |
| ✏️ | `web/src/types/local.ts` | +`LostFoundItem/Data`、+`GpaCourse/Data`、+守卫、+上限常量 |
| ✏️ | `web/src/lib/storage.ts` | +2 键常量、+2 描述符、`StorageDescriptorId` 联合类型 +2 |
| ✏️ | `web/src/styles/global.css` | +3 页所需类（`.phone-card` / `.lf-card` / `.gpa-*` 等） |
| ⛔ **不动** | `server/**` · `lib/api.ts` · `types/api.ts` · `lib/theme.ts` · `lib/tokens.ts` · `package.json` · `ModulesPage.tsx` · `PrivacyPage.tsx` · `ChatPage.tsx` | D1 硬约束 + 注册表驱动的必然结果 |

**新增第三方依赖：0 个。**

---

## 5. 待确认问题

> 每项均已给出**默认方案**，架构师与工程师**照默认方案直接开工，不阻塞**。若主理人有不同意见，改动成本均已标注。

| # | 事项 | 默认方案（照此实现） | 备选 | 改动成本 | 谁拍板 |
|---|---|---|---|---|---|
| **Q1** | **常用电话的数据源**：本地知识库只能溯源到 5 个校内号码（招生办 ×2、校医院 ×1、研招 ×2、研工部 ×2），**教务处 / 学工处 / 后勤 / 保卫处 / 图书馆的号码 KB 里没有** | **不臆造**。P0 只收录「KB 可溯源号码 + 全国公共服务号码」共 13 条，每条带 `source` 标注；缺失部门由页面底部「没找到？问吉小农」引流回对话 | 由主理人 / 用户提供一份官方号码清单，或授权从吉林农业大学官网整理后补录 | 🟢 极低：只往 `PHONE_ITEMS` 数组追加条目，页面零改动 | 主理人 / 用户 |
| **Q2** | **绩点换算规则**：吉林农业大学官方采用几分制、哪张换算表，未经核实 | **4.0 分段制**（§PRD-P2-03 换算表），结果区显式标注算法名 + "仅供参考，以教务处认定为准"。同时**永远展示加权平均分**——这个数字是纯数学、无争议，是用户可信赖的锚 | ① 4.0 线性制 `(分数−50)/10`；② 5.0 制；③ 直接做成可切换（已列为 P1 `PRD-P2-07`） | 🟢 极低：换算表是 `gpa/data.ts` 里的独立数组常量，替换一个数组即可，页面零改动 | 主理人 / 用户（可向教务处核实后定） |
| **Q3** | **失物招领是否需要图片** | **纯文字，不带图**。理由：① 图片走 base64 存 localStorage 极易触发 5MB 配额上限，是本模块最大的崩溃风险源；② D5 已定"仅本设备可见"，图片对本人回忆的边际价值低于对配额的伤害；③ 演示模块应控制范围 | 支持 1 张图 + 前端压缩到 ≤100KB + 明确配额提示 | 🟡 中：需引入 canvas 压缩、配额检测、失败降级三条链路，约增加 1 个任务量 | 主理人（**建议维持"不带图"**） |
| **Q4** | **失物招领的「联系方式」字段是否保留** | **保留**。数据仅存本机、无人可见，字段用于用户自己记"该联系谁"（如捡到东西后失主留的微信）。表单侧提示"只存在这台设备上" | 移除该字段以彻底规避隐私观感问题 | 🟢 极低：删 1 个 `FormRow` + 1 个字段 | 主理人 |
| **Q5** | **3 个新模块的 `defaultEnabled`** | **全部 `true`**（与既有 calendar / food 一致）。演示模块的价值在于被看见，用户可自行关闭 | 新模块默认关闭，避免模块中心一次多出 3 行 | 🟢 极低：改 3 个布尔值 | 主理人 |
| **Q6** | **常用电话是否也接「问吉小农」引流** | **接**，但**只在页面底部放一个**（"没找到？问吉小农"），**不给每张卡都加**——号码卡的主行动是「拨号」，加第二个按钮会稀释主 CTA | 每张卡都加，与美食模块完全对齐 | 🟢 极低 | 产品默认，无需拍板 |
| **Q7** | **失物招领 / 绩点的条目上限** | 失物招领 **50 条**、绩点 **60 门**（与既有 `MEMORY_MAX = 50` 同量级，触顶给明确 Toast 而非静默丢弃） | 放宽到 100 / 100 | 🟢 极低：改 2 个常量 | 产品默认，无需拍板 |

### 5.1 已知缺口（交付时须向用户说明）

> 🔴 **常用电话数据不完整**：教务处 / 学工处 / 后勤 / 保卫处 / 图书馆等新生高频部门的号码，**本地知识库中没有**，本迭代**不收录、不臆造**。建议上线前由用户提供官方清单补录（补录成本 = 往一个数组追加条目）。
>
> 🔴 **绩点换算表未经官方校准**：采用国内高校通行的 4.0 分段口径作为占位规则，页面已显式免责。建议向吉林农业大学教务处核实后替换（替换成本 = 改一个数组常量）。
>
> 🟡 **失物招领不具备真实"招领"能力**：D5 已定为纯本地登记板，**不能被其他同学看到**。产品文案必须诚实表达这一点（页面副标题与隐私说明均已按此撰写），避免用户误以为发布出去了。
