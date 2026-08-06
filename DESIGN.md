# 吉农 AI 助手 · 设计方向文档（Design Direction）

> 产品：吉林农业大学 · 一站式校园 AI 助手（聊天式 AI 客服）
> 形态：微信小程序（微信生态，聊天界面）
> 对标氛围：抖音「小林学长」山外 26 级新生答疑的「学长学姐陪你答疑」感
> 设计寄存器：**Product Register（工具型 UI）** —— 设计服务产品，标杆是「赢得熟悉感」
> 设计刻度默认值：DESIGN_VARIANCE 4 / MOTION_INTENSITY 4 / VISUAL_DENSITY 4（克制、可信、不花哨）

---

## 0. 竞品 / 标杆调研结论（≥3）

| 标杆 | 类型 | 借鉴点 | 不借鉴点 |
|------|------|--------|----------|
| **WeUI / 微信官方设计语言** | 平台原生 | 主色 #07C160、系统字体栈、44pt 触控、轻简稳信哲学、聊天气泡规范 | ——（必须贴合，否则不像微信原生） |
| **清华「清小搭」** | 同类标杆·校园 AI 助手·微信小程序 | 聊天 + 工具卡 + 成长档案的产品结构；"亲密友好的伙伴"语气；白/绿克制配色；24h 在线答疑 | 其偏"学术成长"重叙事，我们更偏"办事答疑"轻工具 |
| **超级课程表** | 校园青年高频工具 | 清新直观、无广告、首屏即工具、强搜索/快捷入口 | 其强社交/社区属性我们不引入 |
| **Khan Academy（清新教育品牌参考）** | 清新教育品牌 | 薄荷绿 #14BF96 的"成长/清新"语义、纸白底、鼓励式导师语气、技能掌握进度点 | 其用 Lato 字体（微信内不可用，取其"精神"而非字面） |

**关键洞察**：在微信里，用户信任"像微信原生"的界面。所以**主色与气泡规范必须 WeUI 化**；"清新教育感"通过**第二语义色（薄荷绿）+ 纸白底 + 陪伴式文案语气**来表达，而不是另起炉灶换主色。

---

## 0.5 PRD §9 硬规则对齐（项目经理：许清楚）

PRD 第 9 节 UI 硬规则已逐条落地到本设计契约，违反即退回重做：

| PRD 规则 | 设计契约落地 |
|----------|--------------|
| ① 禁 emoji 功能图标 → 统一 SVG 图标库 | 全端锁定 **Lucide**（ADR-002），16/20/24px，零 emoji；emoji 仅允许 UGC 用户输入。描述图标一律用文字（"设置图标""帮助图标""返回图标"）。 |
| ② 禁紫→粉渐变 → 走校园绿/蓝系 | 主色微信绿 `#07C160` + AI 身份薄荷绿 `#14BF96`，无紫粉渐变、无渐变文字；契合吉农农林院校绿色调。**最终配色待 PM 签字确认。** |
| ③ 关键操作一律文字按钮 | "有帮助 / 报错""猜你想问""转人工"均为**文字按钮**，不依赖 emoji 传达功能（见 §4 文字按钮规范）。 |
| ④ 形态对标微信小程序/H5 聊天式 AI 客服；首屏=消息列表+输入框+"猜你想问"文字快捷卡 | 聊天页结构（§5）：自定义导航栏 + 消息列表 + "猜你想问"文字快捷卡组 + 底部输入栏；对标「小林学长·山外26级新生答疑」微信小程序聊天风。 |
| ⑤ 可访问性：对比度达标、支持字号放大 | 正文对比度 ≥4.5:1（fg `#1A1A1A` on `#FFFFFF`）；支持**微信系统字号放大**（字号用相对单位，不锁死 px 渲染）；`prefers-reduced-motion` 降级；焦点环可见；图标按钮带 `aria-label`。 |

---

## 1. Visual Theme & Atmosphere（视觉主题与氛围）

- 关键词（5 个）：**原生可信 · 清新陪伴 · 轻简高效 · 学长学姐感 · 不花哨**
- 氛围描述：像微信里一个"靠得住的吉农学长/学姐"，随时能问、答得准、引得出来源。底色干净（纸白/微信灰），主操作是微信绿，AI 身份用一抹薄荷绿点醒。无炫光、无渐变噱头、无 emoji 图标。

---

## 2. Color Palette & Roles（配色与角色）

> **配色状态：PM 许清楚已签字确认（本轮）** —— 采用「绿系三档」：微信绿 / 薄荷绿 / 深林绿，**无蓝混搭、无紫粉渐变、无渐变文字**（硬规则不变）。AI 气泡=薄荷绿、用户气泡=中性灰。

### 浅色主题（主用）
| Token | 值 | 角色 |
|-------|-----|------|
| `--bg` | `#F5F6F7` | 页面背景（微信聊天灰，冷中性） |
| `--surface` | `#FFFFFF` | 卡片 / 气泡（AI  incoming） |
| `--surface-warm` | `#F2F4F3` | 三级表面（快捷问卡片、分组底） |
| `--fg` | `#1A1A1A` | 主文本 |
| `--fg-2` | `#4A4F57` | 次级文本 |
| `--muted` | `#8A9099` | 辅助/时间戳 |
| `--meta` | `#B4B9C0` | 三级/占位 |
| `--border` | `#E6E8EB` | 默认边框 |
| `--border-soft` | `#F0F2F4` | 行内分隔 |
| `--accent` | `#07C160` | **主强调（微信绿）**：主按钮、用户气泡、主操作。**每屏 ≤2 处可见** |
| `--accent-hover` | `#06AD56` | 悬停 |
| `--accent-active` | `#05974B` | 激活 |
| `--accent-on` | `#FFFFFF` | accent 上的文字 |
| `--accent-2` | `#14BF96` | **AI 身份薄荷绿**：用于 AI 头像环、AI 气泡底纹/标记、「吉小农」身份识别。**每屏 ≤2 处，绝不与 --accent 抢按钮** |
| `--accent-3` / `--brand-deep` | `#1A6B3C` | **品牌深林绿（PM 签字）**：页面标题 / 品牌位 / AI 名 chip 底色 / 空状态插画，锚定"农林"院校调性；与薄荷绿同族，不混蓝 |
| `--success` | `#1AAD19` | 成功 |
| `--warn` | `#FF9F0A` | 警告 |
| `--danger` | `#FA5151` | 错误/危险 |
| `--link` | `#576B95` | 微信链接蓝 |
| `--bubble-user` | `#ECEEF1` | 用户气泡（中性灰）底色 |
| `--bubble-ai` | `#E9F8F3` | AI 气泡（薄荷绿淡底）底色 |
| `--bubble-ai-fg` | `#0F3D2A` | AI 气泡文字（深林绿，对比达标） |

### 深色主题（夜间偏好，微信支持）
| Token | 值 |
|-------|-----|
| `--bg` | `#0E0F12` |
| `--surface` | `#1A1C20` |
| `--surface-warm` | `#222529` |
| `--fg` | `#EDEFF2` |
| `--fg-2` | `#B8BDC4` |
| `--muted` | `#828890` |
| `--meta` | `#5A5F66` |
| `--border` | `#2A2D33` |
| `--border-soft` | `rgba(255,255,255,0.06)` |
| `--accent` | `#2BAE5C` |
| `--accent-2` | `#2FD3A8` |
| `--success` | `#2BAE5C` |
| `--warn` | `#FFB340` |
| `--danger` | `#FF6B5C` |

**三档绿色层次（PM 签字，无蓝、无渐变）**：
- `--accent` 微信绿 `#07C160` = **功能主色 / 操作**（发送按钮、主 CTA、聚焦态）。
- `--accent-2` 薄荷绿 `#14BF96` = **AI 身份色**（AI 头像环、AI 气泡底纹、「吉小农」识别标记），不用于按钮填充。
- `--accent-3` 深林绿 `#1A6B3C` = **品牌色 / 深度**（页面标题、品牌位、AI 名 chip 底色、空状态插画）。
- 克制原则：按钮填充仅用微信绿；薄荷绿与深林绿作身份/品牌识别，每屏可见绿色强调合计 ≤3 处，避免绿色过载稀释识别度。

**反 AI 模板红线**：无紫色→粉色渐变；无渐变文字；无侧条纹边框；卡片圆角 ≤16px；无幽灵卡（1px 边框 + blur≥16px 阴影不共存）。

---

## 3. Typography Rules（字体与排版）

> **平台约束决策（刻意选择，非偷懒默认）**：微信小程序内**必须使用系统字体栈**以保证原生观感、CJK 渲染质量与性能。这是微信官方规范，也是"赢得熟悉感"的关键，故不引入自定义 display 字体。层级通过**字重 + 字距 + 字号阶梯**表达。
> 若为微信**外**的着陆页/H5（如公众号引流页），则改用 `Inter`（display）+ `Noto Sans SC`（body）配对。

- `--font-body`: `-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
- `--font-display`: 同上（标题靠字重/字距区分，不换族）
- `--font-mono`: `"SF Mono", "Roboto Mono", "DejaVu Sans Mono", monospace`（学号、验证码、工具输出 JSON）

**字号阶梯（微信 pt 阶梯映射，px）**：
| Token | px | 用途 |
|-------|----|----|
| `--text-xs` | 11 | 版权/最次要 |
| `--text-sm` | 13 | 辅助说明、链接 |
| `--text-base` | 14 | 气泡正文、列表摘要 |
| `--text-md` | 15 | 列表标题 |
| `--text-lg` | 16 | 主要描述正文 |
| `--text-xl` | 17 | 首要层级（消息/标题） |
| `--text-2xl` | 18 | 大按钮 |
| `--text-3xl` | 20 | 页面大标题 |

**字重系统**：Read 400 / Emphasize 500 / Announce 600（避免 700 重黑，除品牌字）。

**字距规则**：
- 正文 0；小字（11–13px）`0.01em`；
- ALL CAPS / 标签 `0.04em`；
- 标题（≥20px）`-0.01em`。

**行高**：正文 1.5–1.7；气泡 1.5；标题 1.25。

**字号放大 / 可访问性（PRD 规则⑤）**：字号令牌用**相对单位（rem / 百分比）**映射，不锁死 px 渲染，跟随**微信系统字号设置**（标准/大/超大）整体放大；放大后气泡、卡片、输入栏按 `min-height: 44px` 与流式布局自适应，不出现文字截断或溢出。正文对比度 ≥4.5:1（fg `#1A1A1A` on `#FFFFFF` / `#F5F6F7`），达标 AA。

---

## 4. Component Stylings（核心组件）

### 聊天气泡（产品核心 — 绿系三档：微信绿=操作 / 薄荷绿=AI 身份 / 深林绿=品牌）
> **已确认锁定（PM 签字 + PRD「聊天气泡约定」）**：本产品为人机对话（问吉小农），不套用微信熟人"自己发绿气泡"直觉；采用"用户中性灰 + Bot 品牌色"的业界 AI 客服/对话产品惯例。该决策**不可回退**。
- **用户气泡（me）**：背景 `--bubble-user`(中性灰 `#ECEEF1`)，文字 `--fg`(#1A1A1A)，圆角 12px（右上角小切角 4px），max-width 70%，右对齐，右侧用户头像（灰色剪影）。
- **AI 气泡（other / 吉小农）**：背景 `--bubble-ai`(薄荷绿淡底 `#E9F8F3`)，文字 `--bubble-ai-fg`(深林绿 `#0F3D2A`)，圆角 12px（左上角小切角 4px），左对齐，左侧 **薄荷绿实色头像环(#14BF96) + 「吉小农」名 chip（深林绿 `#1A6B3C` 底 + 白字，对比达标）**。薄荷绿底纹让 AI 气泡与用户中性灰气泡**一眼可辨**（PM 重点验证项）。
- 气泡内支持：纯文本、工具结果卡（课表/地图/办事指南）、引文来源 chip（深林绿字，信任）、快捷追问 chips。

### 按钮
- **Primary**：`background: var(--accent); color: var(--accent-on);` 圆角 8px，padding 10px 16px，字重 500。
- **Secondary**：透明 + 1px `--border`，文字 `--fg`，圆角 8px。
- **Ghost**：`rgba(7,193,96,0.06)` 极淡绿底，文字 `--accent`，圆角 8px。
- **禁用/加载**：opacity 0.5 + spinner（Lucide `loader-circle` 旋转，非 emoji）。

### 文字按钮（关键操作，禁止 emoji 传达功能 — PRD 规则③）
所有关键操作均为**纯文字按钮**，不依赖任何 emoji 图标传达语义；必要时左侧可配 16px Lucide 图标（具体图标名由架构师从 Lucide 集补入 scenarios 注册表），但**文字本身必须能独立表意**。
- **"有帮助 / 报错"**：AI 气泡底部反馈条，文字按钮（可配 `ThumbUp` / `Flag` 类 Lucide 图标，文字为主）。
- **"猜你想问"**：首屏/空态文字快捷卡组标题 + 卡片（见下）。
- **"转人工"**：当 AI 无法回答或用户主动请求时出现的文字按钮（可配 `Headset` 类 Lucide 图标，文字为主）。

### 输入框（底部输入栏）
- 圆角 20px 胶囊输入 + 语音图标（左/右）+ 绿色发送按钮。
- focus 环：`--focus-ring`（微信绿 3px 半透明）。
- 占位符用 `--meta`，文案具体（如"问问吉小农：图书馆几点关门？"），**禁 "Welcome to" / Lorem**。

### "猜你想问" 文字快捷卡 + 分类入口卡（首屏空态 / 输入框上方 — PRD 规则④）
- **"猜你想问" 文字快捷卡组**（首屏核心）：标题"猜你想问" + 横向滑动/网格的**文字按钮卡**（纯文字，可选左侧 16px Lucide 图标），点击即发送该问题。背景 `--surface-warm`，文字 `--fg-2`，无 emoji。
  - 示例真实内容（非占位）：`图书馆开放时间` · `新生报到流程` · `本学期校历` · `校园地图导航` · `一卡通充值`。
- **分类入口卡**：2×2 或横向滑动卡片网格，每张卡 = 1 个 Lucide 场景图标（24px，薄荷绿语境）+ 场景名 + 一句真实引导文案。预映射：报到 `MapPin` / 选课 `BookOpen` / 考研 `GraduationCap` / 生活 `Coffee`。

### 流式逐字显示（SSE — 聊天核心交互）
- AI 回答通过 **SSE 流式**逐字渲染；渲染期间显示**三点打字指示器**（`LoaderCircle` 旋转或三点脉冲，非 emoji），完成后定格为完整气泡。
- 流式过程中气泡背景即时为 `--surface`（白），文字逐字出现；长回答支持滚动跟随到底。
- 支持 `prefers-reduced-motion`：关闭打字动画，直接整段出现（无障碍）。
- 流式中断/出错 → 进入 Error 态（见 §4 错误态），提供重试（架构侧 SSE 重连）。

---

## 5. Layout Principles（布局）

- **栅格**：微信小程序单列流式；安全区适配 `env(safe-area-inset-bottom)`（刘海屏底 34px）。
- **聊天页结构**（自上而下）：
  1. 自定义导航栏：左返回 + 居中"吉农 AI 助手" + 右"..."更多（Lucide `more-horizontal`）
  2. 消息列表（scroll，粘性底边）
  3. "猜你想问" 文字快捷卡组（首屏/空态时显示在列表底部上方）
  4. 底部输入栏（固定）
- **节区节奏**：列表 item 间距 12–16px；卡片 padding 16–20px。
- **容器最大宽**：移动端全宽，内容区左右留白 16px。

---

## 6. Depth & Elevation（层级与阴影）

- 三级层级：`--elev-flat`(none) / `--elev-ring`(0 0 0 1px var(--border)) / `--elev-raised`(0 1px 2px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.06))。
- 深色模式：用**亮度递进**表达层级，不靠阴影（bg→surface→surface-warm 逐级提亮）。
- **禁止幽灵卡**（同时 1px 边框 + blur≥16px 阴影）。

---

## 7. Do's and Don'ts

**允许**
- 微信原生绿 + 纸白底 + 一抹薄荷绿身份色
- 系统字体栈（微信内刻意选择）
- 真实校园内容（"图书馆几点关门？"类示例）
- Lucide 线性图标，16/20/24px 统一
- 打字指示器用三点动画（非 emoji）
- 关键操作为纯文字按钮（有帮助/报错、猜你想问、转人工），不依赖 emoji 传达功能（PRD 规则③）

**禁止（含 P0 红线）**
- emoji 作功能图标（如火箭 / 火焰 / 灯泡图标等）——全用 Lucide
- 紫色→粉色渐变主视觉
- "Welcome to" / "Lorem ipsum" / "Sign up today" 空洞文案
- 硬编码颜色（所有颜色走 Token）
- 千篇一律 Hero（首屏即聊天产品，展示真实对话/快捷问）
- 侧条纹边框、渐变文字、过度圆角（≥24px）、默认毛玻璃

---

## 8. Responsive Behavior（响应式）

- 微信小程序：以移动端为唯一目标（iPhone/Android 主流机型）。
- 触控目标：所有可点 ≥ 44×44px；按钮间距 ≥8px。
- 安全区：底部输入栏 + `env(safe-area-inset-bottom)`；刘海屏不遮挡。
- 横屏：微信小程序默认竖屏锁定（如确需，聊天列表转可滚动）。
- 小程序 TabBar（如多页）：2–5 项，图标 24px + 文字 10px，Lucide 图标。

---

## 9. Agent Prompt Guide（给前端 / 架构师的提示）

- **图标库锁定：Lucide**（见 §图标系统选型，单一事实源 ADR-002）。Taro 小程序用 `lucide-react-taro`、H5 用 `lucide`/`lucide-static` 内联 SVG；统一 Icon 封装、tree-shaking、禁混库。微信 TabBar 仅接受 Lucide CLI 生成的本地 PNG。
- **所有颜色走 CSS 变量 / design-tokens.json**，禁止裸 hex（除 `#fff`/`#000` 特例）。
- **字体**：小程序内系统栈；H5 着陆页用 Inter + Noto Sans SC。
- **聊天流**：流式输出用光标闪烁 / 三点打字指示器；工具卡用 `--surface` 卡片内嵌。
- **信任设计**：AI 回答附"来源：吉林农业大学官网/教务处"chip，降低幻觉感（参考清小搭）。
- **无障碍**：`prefers-reduced-motion` 关闭打字动画；焦点环可见；图标按钮带 `aria-label`。

---

## 图标系统选型（ICON SYSTEM — 已锁定，与 ADR-002 对齐）

> 架构决策见 `docs/decisions/ADR-002.md`（架构师高见远）。本设计方向已与其完全对齐：**全端仅 Lucide 一套图标库**。

- **库：Lucide**（https://lucide.dev）— 线性、2px 描边、24×24 网格、MIT、1500+ 图标，覆盖极广（chat/school/map/book/graduation-cap/help-circle/send/mic/loader 等）。
- **尺寸规范（全项目统一，禁止其他尺寸）**：
  - `16px` → 行内 / 列表辅助图标
  - `20px` → 按钮内图标
  - `24px` → 独立图标 / 导航栏 / AI 身份标记
- **交付与构建（架构师负责，设计侧约束）**：
  - **Taro 小程序**：用 `lucide-react-taro`（npm），支持动态色/尺寸/tree-shaking；统一 `Icon` 封装层，仅从此包导入。
  - **H5 / Web**：`lucide` 或 `lucide-static` 内联 SVG。
  - **小程序 TabBar（硬约束）**：微信 TabBar **仅接受本地 PNG**，由 Lucide CLI 生成对应 PNG 资源——**禁止**在 TabBar 用 SVG/iconfont/emoji。
  - **绝对禁令**：功能图标**零 emoji**；禁止混用第二套图标库；装饰 emoji 仅允许出现在用户自输入消息（UGC），绝不进入 chrome/导航/按钮。

**场景图标预映射（架构师已定，设计侧直接采用 — 均为 Lucide SVG，非 emoji）**：
| 场景 | Lucide 图标 | 设计用法 |
|------|-------------|----------|
| 报到 / 迎新 | `MapPin` | 分类入口卡、快捷问 |
| 选课 / 课业 | `BookOpen` | 分类入口卡、工具结果卡 |
| 考研 / 升学 | `GraduationCap` | 分类入口卡 |
| 生活 / 校园生活 | `Coffee` | 分类入口卡 |
| 对话 | `MessageCircle` | 导航/空态 |
| 发送 | `Send` | 输入栏 |
| 语音 | `Mic` | 输入栏 |
| 答疑 / 帮助 | `HelpCircle` | 分类入口、错误兜底 |
| 校历 | `Calendar` | 快捷问、工具卡 |
| 地图导航 | `Navigation`（或 `Map`；**保留 `MapPin` 给「报到」**，避免两个分类入口同图标） | 工具结果卡 |
| 图书馆 | `Library` | 快捷问 |
| 一卡通 | `CreditCard` | 快捷问、工具卡 |
| 搜索 | `Search` | 顶栏/全局 |
| 更多 | `MoreHorizontal` | 导航栏右 |
| 加载 | `LoaderCircle` | 按钮/骨架 |
| 成功 | `CheckCircle` | toast/状态 |
| 错误 | `AlertCircle` | 错误态 |
| AI 能力标记 | `Sparkles`（薄荷绿语境） | AI 头像/名 chip 旁 |

> 后续扩展场景严格从同一 Lucide 集内选取，保持风格一致；新增图标候选需架构师确认后补入本表。

**单一事实源（三方同步）**：架构师在架构文档维护 `scenarios` 注册表（`scenario_id → lucide_icon_name`），与本表、ADR-002 映射保持一致。PM 扩场景时，请同时 @架构师 与 PM，由三方从 Lucide 内补候选并写入注册表，保证**前端 / 设计 / 架构**三处同步，杜绝图标漂移。

---

## 10. 组件状态矩阵（9 态覆盖 — 契约级，供前端/架构实现）

> 9 态：Default / Hover / Focus / Active / Disabled / Loading / Error / Empty / Success。聊天主界面为 Product Register，状态以"克制、可预期"为原则；装饰态（Hover/Active）动效 ≤150ms。

### 聊天气泡（AI / 用户）
| 态 | AI 气泡（吉小农） | 用户气泡 |
|----|------------------|----------|
| Default | 薄荷绿淡底 `#E9F8F3` + 深林绿字 `#0F3D2A` + 薄荷绿头像环 + 深林绿名 chip | 中性灰 `#ECEEF1` + 深灰字 |
| Loading | 三点打字指示器（Lucide `LoaderCircle` 旋转，非 emoji），底纹渐显 | — |
| Empty | 首屏欢迎语 + 「猜你想问」卡组（见下） | — |
| Error | 气泡内"回答中断"提示 + 「重试」文字按钮（非 emoji） | 发送失败：气泡左下红色 `!`（`AlertCircle`）+ 点击重发 |
| Success | 回答完成定格；底部「有帮助/报错」文字按钮 | 发送成功定格 |

### 底部输入栏（输入框 + 发送）
| 态 | 表现 |
|----|------|
| Default | 胶囊输入（占位"问问吉小农…"）+ 语音图标（左/右）+ 微信绿发送钮 |
| Hover | 发送钮明度 +6%；输入框边框 `--border`→`--accent` 微染 |
| Focus | `--focus-ring`（微信绿 3px 半透明）；占位文案保留 |
| Active | 发送钮 `--accent-active`；按键回弹 80ms |
| Disabled | 无输入内容时发送钮 opacity 0.5、不可点 |
| Loading | 发送后输入框清空、发送钮转 `LoaderCircle` 直至首字回流（SSE） |
| Error | 网络/超时：输入栏上方红条"网络开小差，点此重发" |

### 「猜你想问」文字卡组
| 态 | 表现 |
|----|------|
| Default | 2×2 卡组（MVP 4 张），单卡 `#F2F4F3` + 深灰字 + 左 16px 薄荷绿 Lucide 图标；点击即发送 |
| Hover/Active | 卡底 `#E9F8F3` 微染、轻微上浮 1px |
| Empty | 无推荐时整组隐藏，仅留输入栏 |
| Loading | 首屏请求推荐中：卡骨架屏（灰条 shimmer，非 emoji） |
| Error | 推荐拉取失败：降级为单行"热门问题"静态文案，不阻断对话 |

### 工具结果卡（办事指南 / 地图 / 课表，内嵌 AI 气泡）
| 态 | 表现 |
|----|------|
| Default | `--surface` 白卡 + 1px `--border` + 标题深林绿 + 来源 chip（深林绿描边白底） |
| Loading | 卡内骨架屏（行占位 shimmer） |
| Empty | 无结果：卡内"暂未找到，试试转人工" + 转人工文字按钮 |
| Error | 数据源异常：卡内错误态 + 「重试」文字按钮 |
| Success | 完整渲染，关键字段深林绿高亮 |

### 全局
- **转人工**：AI 无法回答 / 用户主动请求时出现文字按钮（可配 `Headset` 类 Lucide 图标，文字为主）→ 跳转人工/留资。
- **空态（整页）**：首次进入聊天，消息区仅 AI 欢迎气泡 + 「猜你想问」卡组，无历史。
- **无障碍**：所有态支持 `prefers-reduced-motion`（关动画直接出结果）；焦点环可见；图标按钮带 `aria-label`；字号跟随微信系统设置放大不破版。

---

## 设计刻度（供后续 pages 覆盖）

- `DESIGN_VARIANCE = 4`（可预测、对称、微信原生感）
- `MOTION_INTENSITY = 4`（仅 hover/active/打字指示/页面转场，无装饰动画）
- `VISUAL_DENSITY = 4`（日常应用密度，标准间距）

如需某个页面更"惊艳"（如欢迎引导页），可局部提到 6–7，但聊天主界面维持 4。

---

## 11. 高保真视觉稿与像素级组件规范（Phase 2 细化产出）

> 基于 §10 契约级 9 态矩阵，细化到**像素 + design-tokens.json 变量名**，并产出四页面 hi-fi SVG。全部严格走 Token，零 emoji、无紫粉渐变、无空洞文案（真实校园场景：报到材料、图书馆关门时间）。

### 11.1 页面视觉稿清单（SVG，375×812，Token 严格映射）
| 页面 | 路由 | 文件 | 关键视觉 |
|------|------|------|----------|
| 聊天主页（核心） | /chat?scenario=baodao | `visuals/chat-home.svg` | 导航栏(返回+标题+MoreHorizontal) + AI 薄荷绿气泡 + 用户灰气泡 + 来源 chip + 有帮助/报错文字按钮 + 猜你想问 2×2 + 输入栏(Mic+微信绿 Send) |
| 场景分类入口 | /scenarios | `visuals/scenarios.svg` | 2×2 场景卡（MapPin/BookOpen/GraduationCap/Coffee，Lucide 24px）；报到=已开通(微信绿 pill)，其余=即将开放(muted) |
| 转人工/联系页 | /handoff | `visuals/handoff.svg` | HelpCircle 引导卡 + 学工处电话(Phone+0431-84532980) + 辅导员 + 留资表单 + 提交按钮 + 成功 toast |
| 欢迎引导（首次） | /welcome | `visuals/welcome.svg` | 吉小农薄荷绿头像环 + Sparkles + 标题 + 三特性行(MapPin/BookOpen/MessageCircle) + 开始对话(微信绿) + 合规 footer |

### 11.2 像素级组件 9 态规范
- 完整像素值与 Token 变量名见 **`visuals/component-spec.md`**（聊天气泡 / 输入栏 / 猜你想问 / 转人工 / 空态 / 工具卡，含 Default/Hover/Focus/Active/Disabled/Loading/Error/Empty/Success）。
- 尺寸速查基准见 component-spec §7（375px 屏宽坐标，可直接转 Taro/H5 样式）。

### 11.3 图标使用清单（全站 Lucide，16/20/24px，零 emoji）
| 页面 | Lucide 图标（用途） |
|------|---------------------|
| 聊天主页 | `MoreHorizontal`(导航) · `Mic`(输入栏 20) · `Send`(发送 20) · `ThumbUp`(有帮助) · `Flag`(报错) · `LoaderCircle`(Loading) · `AlertCircle`(Error) |
| 场景分类 | `ChevronLeft`(返回) · `Search`(搜索 20) · `MapPin`(报到) · `BookOpen`(选课) · `GraduationCap`(考研) · `Coffee`(生活) |
| 转人工 | `ChevronLeft`(返回) · `HelpCircle`(引导 20) · `Phone`(拨打 16) · `Send`(提交 20) · `CheckCircle`(成功 toast) · `AlertCircle`(错误) · `LoaderCircle`(Loading) |
| 欢迎引导 | `Sparkles`(AI 标记) · `MapPin`(报到答疑) · `BookOpen`(办事指南) · `MessageCircle`(随时对话) · `ArrowRight`(开始对话 20) |

### 11.4 P0 红线自检（Phase 2）
- [通过] 零 emoji 功能图标：全站 Lucide，16/20/24px；四个新 SVG + component-spec 经 emoji 正则扫描 0 命中（SVG 内无任何 emoji）。
- [通过] 无紫→粉渐变：主色微信绿 `--accent` #07C160 + 薄荷绿 `--accent-2` #14BF96 + 深林绿 `--accent-3` #1A6B3C，无渐变、无渐变文字。
- [通过] 无空洞占位：文案均为真实校园场景（报到材料、图书馆开放时间、录取通知书、0431-84532980、2026 新生入学须知）。
- [通过] 无硬编码颜色：所有色值引用 design-tokens.json 变量（SVG 内为 Token 值映射，实现层走 CSS 变量）。
- [通过] 非千篇一律 Hero：首屏即聊天产品（chat-home 直接是消息列表+输入栏+猜你想问），欢迎页为独立 /welcome 路由，不抢占首屏。
- [通过] 圆角 ≤16px、间距 4px 网格、动效 150–200ms + prefers-reduced-motion。
