# 吉农 AI 助手 · 组件视觉规范（像素级 + Token 变量名）

> 补充 `DESIGN.md §10` 的契约级 9 态矩阵，细化到**像素**与 **design-tokens.json 变量名**，供前端 / 架构师直接实现。
> 寄存器：Product Register（工具型 UI）；刻度：DESIGN_VARIANCE 4 / MOTION_INTENSITY 4 / VISUAL_DENSITY 4。
> 所有色值走 Token，禁止裸 hex（除 `#fff`/`#000` 特例）。图标全 Lucide（16/20/24px），零 emoji。

---

## 0. 全局基础变量（来自 design-tokens.json）

| 类别 | Token | 值 | 用途 |
|------|-------|----|------|
| 颜色 | `--bg` | #F5F6F7 | 页面背景（聊天灰） |
| | `--surface` | #FFFFFF | 卡片 / 白表面 |
| | `--surface-warm` | #F2F4F3 | 快捷问卡 / 分组底 / 输入框底 |
| | `--fg` | #1A1A1A | 主文本 |
| | `--fg-2` | #4A4F57 | 次级文本 |
| | `--muted` | #8A9099 | 辅助 / 时间戳 |
| | `--meta` | #B4B9C0 | 占位 / 三级 |
| | `--border` | #E6E8EB | 默认边框 |
| | `--border-soft` | #F0F2F4 | 行内分隔 |
| | `--accent` | #07C160 | 主操作（发送钮 / 主 CTA / 聚焦） |
| | `--accent-hover` | #06AD56 | 主操作悬停 |
| | `--accent-active` | #05974B | 主操作激活 |
| | `--accent-on` | #FFFFFF | accent 上文字 |
| | `--accent-2` | #14BF96 | AI 身份薄荷绿（头像环 / 名 chip 标记 / 气泡底纹），每屏 ≤2 处 |
| | `--accent-3` | #1A6B3C | 品牌深林绿（标题 / 名 chip 底 / 来源 chip / 空态插画） |
| | `--bubble-user` | #ECEEF1 | 用户气泡底 |
| | `--bubble-ai` | #E9F8F3 | AI 气泡底（薄荷绿淡底） |
| | `--bubble-ai-fg` | #0F3D2A | AI 气泡文字（深林绿，AA 对比） |
| | `--success` | #1AAD19 | 成功 |
| | `--warn` | #FF9F0A | 警告 |
| | `--danger` | #FA5151 | 错误 / 危险 |
| | `--link` | #576B95 | 链接 |
| 圆角 | `--radius-sm` | 8px | 按钮 / 小卡 |
| | `--radius-md` | 12px | 气泡 / 输入胶囊 |
| | `--radius-lg` | 16px | 大卡 / 页卡（禁 ≥24） |
| | `--radius-pill` | 9999px | 输入胶囊 / 名 chip / 状态 pill |
| 间距 | `--space-1..10` | 4/8/12/16/20/24/32/40px | 4px 网格 |
| 动效 | `--motion-fast` | 150ms | hover / active |
| | `--motion-base` | 200ms | 进入 / 转场 |
| | `--ease-standard` | cubic-bezier(0.2,0,0,1) | 标准缓动 |
| 层级 | `--elev-flat` | none | |
| | `--elev-ring` | 0 0 0 1px var(--border) | 卡片描边 |
| | `--elev-raised` | 0 1px 2px rgba(0,0,0,.04), 0 4px 8px rgba(0,0,0,.06) | 浮起（禁与 1px 边框共存=幽灵卡） |
| 图标 | 16px 行内 / 20px 按钮内 / 24px 独立 | currentColor | Lucide，零 emoji |

---

## 1. 聊天气泡（产品核心）

> 结构：头像(24 直径 r=18) + 名 chip(深林绿底白字) + 气泡(max-width 70% / 289px 屏宽内)。
> 用户气泡：右下、中性灰、右上小切角镜像；AI 气泡：左下、薄荷绿淡底、左上小切角镜像。
> 气泡内边距：12px（--space-3）；圆角 12px（--radius-md）；正文字号 14px（--text-base）；行高 1.5。

### 1.1 AI 气泡（吉小农）

| 态 | 背景 | 文字 | 描边 / 装饰 | 文案 / 图标 | 动效 |
|----|------|------|------------|------------|------|
| Default | `var(--bubble-ai)` #E9F8F3 | `var(--bubble-ai-fg)` #0F3D2A | 头像环 `var(--accent-2)` 2px；名 chip `var(--accent-3)` 底 + `var(--accent-on)` 字 | 「吉小农」+ 回答正文 + 来源 chip（`var(--surface)` 底 + `var(--accent-3)` 描边 1px + 字 `var(--accent-3)`） | — |
| Hover | 同 Default（聊天无 hover，按微信惯例） | — | — | — | — |
| Focus | 同 Default | — | 气泡外 `--focus-ring`（微信绿 3px 半透明，仅输入框/按钮有，气泡无） | — | — |
| Active | 同 Default | — | — | — | — |
| Disabled | 同 Default（历史消息不可交互） | — | — | — | — |
| Loading | `var(--bubble-ai)` | `var(--bubble-ai-fg)` 逐字出现 | 三点打字指示器或 `LoaderCircle`(20px, `var(--accent-2)`) 旋转 | 无文案，仅光标闪烁 / LoaderCircle | `var(--motion-fast)` 150ms；`prefers-reduced-motion` 关动画直接整段出 |
| Error | `var(--bubble-ai)` | `var(--bubble-ai-fg)` | 气泡内红字 + `AlertCircle`(16px, `var(--danger)`) | 「回答中断，点击重试」+「重试」文字按钮(`var(--accent)`) | 出错 shake ≤150ms |
| Empty | 首屏欢迎语气泡 `var(--bubble-ai)` | `var(--bubble-ai-fg)` | 头像环 + 名 chip | 「同学你好，我是吉小农，吉林农业大学的一站式校园 AI 助手，随时问我～」+ 下方「猜你想问」卡组 | 入场淡入 200ms |
| Success | 同 Default 定格 | — | 气泡下方反馈条 | 「有帮助」(`ThumbUp` 16) / 「报错」(`Flag` 16)，文字色 `var(--fg-2)`，hover 转 `var(--accent-2)` | 出现 150ms |

### 1.2 用户气泡（me）

| 态 | 背景 | 文字 | 描边 | 文案 |
|----|------|------|------|------|
| Default | `var(--bubble-user)` #ECEEF1 | `var(--fg)` #1A1A1A | 右侧用户头像 `var(--bubble-user)` 底 + `var(--border)` 描边 + `var(--muted)`「我」字 | 用户提问（如「报到要带哪些材料？」） |
| Loading | — | — | — | 发送中：气泡暂显 + `LoaderCircle`(16) 于气泡右下 |
| Error | `var(--bubble-user)` | `var(--fg)` | 气泡左下 `AlertCircle`(16, `var(--danger)`) | 「发送失败，点击重发」（点击重发该条） |
| Success | 同 Default 定格 | — | — | — |
| 其余态 | 同 Default（用户气泡为纯展示，无 hover/focus/active/disabled/empty） | | | |

---

## 2. 底部输入栏（输入框 + 发送钮）

> 固定底栏高度 64px；左留白 16px；输入胶囊高 40px 圆角 `--radius-pill`；发送钮圆形 r=18（`var(--accent)`）。
> 安全区：`env(safe-area-inset-bottom)`（刘海屏底 34px）。

| 态 | 输入框 | 发送钮 | 文案 / 图标 | 动效 |
|----|--------|--------|------------|------|
| Default | `var(--surface-warm)` 底 + 无描边；占位 `var(--meta)` | `var(--accent)` 圆 + 白 `Send`(20) | 占位「问问吉小农：图书馆几点关门？」；左/右 `Mic`(20, `var(--muted)`) | — |
| Hover | 输入框边框 `var(--border)`→`var(--accent)` 微染 | 发送钮明度 +6%（≈`--accent-hover`） | — | 150ms |
| Focus | `var(--focus-ring)`（微信绿 3px 半透明） | 同 Default | 占位文案保留 | 150ms |
| Active | 同 Focus | `var(--accent-active)` | 按键回弹 80ms | 80ms |
| Disabled | 同 Default | 发送钮 `opacity:0.5` + 不可点（无输入内容时） | — | — |
| Loading | 输入后清空 | 发送钮转 `LoaderCircle`(20) 旋转直至首字回流（SSE） | — | 旋转 150ms/圈；`prefers-reduced-motion` 暂停 |
| Error | 输入栏上方红条 `var(--danger)` 浅底 + `AlertCircle`(16) | 同 Default | 红条「网络开小差，点此重发」（点击重发末条） | 红条滑入 200ms |
| Empty | 同 Default | 同 Disabled（无内容） | 占位文案 | — |
| Success | 输入已清空、焦点回到输入框 | 复位为 `Send`(20) | — | 150ms |

---

## 3. 「猜你想问」文字卡组

> 标题「猜你想问」`var(--fg)` 15px 600；2×2 卡（MVP 4 张），单卡宽 168px 高 48px 圆角 `--radius-md`；卡内左 16px `var(--accent-2)` 圆形 icon + 13px `var(--fg-2)` 文字；点击即发送。

| 态 | 卡片背景 | 文字 | 图标 / 装饰 | 动效 |
|----|----------|------|------------|------|
| Default | `var(--surface-warm)` | `var(--fg-2)` | 左 16px 圆底 `var(--accent-2)` + 白字首字（图/报/历/图） | — |
| Hover | `var(--bubble-ai)` 微染 | 同 | 卡轻微上浮 1px | 150ms |
| Active | `var(--bubble-ai)` | 同 | 按下回弹 80ms | 80ms |
| Focus | `var(--elev-ring)` + `--focus-ring` | 同 | 可见焦点环 | 150ms |
| Disabled | `var(--surface-warm)` + `opacity:0.5` | `var(--meta)` | — | — |
| Loading | 卡内骨架屏（灰条 shimmer，`var(--border-soft)`→`var(--border)`） | 无 | 无图标 | shimmer 150ms；`prefers-reduced-motion` 静态 |
| Error | 降级为单行「热门问题」静态文案（不阻断对话） | `var(--fg-2)` | 无卡 | — |
| Empty | 无推荐时整组隐藏，仅留输入栏 | — | — | — |
| Success | 点击后卡片高亮 120ms 并触发发送 | — | — | 120ms |

---

## 4. 转人工入口（文字按钮 + 联系信息）

> 触发：AI 低置信 / 连续 2 次无答案 / 用户点「答错了」/ 主动请求。
> 形态：文字按钮（`Headset` 16 + 文字为主，文字独立表意）跳转 `/handoff`；联系信息用**文字 + `Phone`(16) 图标**（非 emoji）。

| 态 | 入口按钮 | 联系块 / 表单 | 文案 / 图标 | 动效 |
|----|----------|--------------|------------|------|
| Default | 文字按钮 `var(--accent)` 字 + `Headset`(16) | 联系块 `var(--surface)` + `var(--elev-ring)`；电话 `Phone`(16, `var(--accent-3)`) + `var(--fg)` 号码 + 「拨打」文字(`var(--accent)`)；表单输入 `var(--surface)` + `var(--elev-ring)` | 「转人工」「0431-84532980」「提交并转人工」 | — |
| Hover | 字色转 `var(--accent-hover)` | 输入框边框 `var(--accent)` 微染 | — | 150ms |
| Focus | `--focus-ring` 于按钮 / 输入框 | 同 | 可见焦点环 | 150ms |
| Active | `var(--accent-active)` | 同 Hover | 回弹 80ms | 80ms |
| Disabled | 提交钮 `opacity:0.5` 不可点（未填问题描述） | — | — | — |
| Loading | 提交钮转 `LoaderCircle`(20) | 表单禁用 | — | 旋转 |
| Error | 表单上方红字 `var(--danger)` | 输入框描边转 `var(--danger)` | 「提交失败：请填写问题描述」+ `AlertCircle`(16) | 红条滑入 200ms |
| Empty | 入口按钮常驻 | 联系块显示默认占位（如「联系所在学院学工办」） | — | — |
| Success | 提交成功 | 顶部 `CheckCircle`(16) + `var(--bubble-ai)` 底 + `var(--bubble-ai-fg)` 字 toast「已提交，学工处会尽快与你联系」 | — | toast 淡入 200ms，3s 后自动消失 |

---

## 5. 空态（整页 / 列表）

> 首次进入聊天：消息区仅 AI 欢迎气泡 + 「猜你想问」卡组，无历史。转人工页无联系信息时显示引导。

| 态 | 背景 | 主视觉 | 文案 | 动效 |
|----|------|--------|------|------|
| Default(空) | `var(--bg)` | AI 欢迎气泡（含头像环 + 名 chip）+ 「猜你想问」2×2 | 欢迎语 + 真实示例问（图书馆开放时间 / 新生报到流程 / 本学期校历 / 校园地图导航） | 入场淡入 200ms |
| Loading | `var(--bg)` | 骨架屏（消息行占位 shimmer） | 无 | shimmer |
| Error | `var(--bg)` | `AlertCircle`(24, `var(--danger)`) + 重试文字按钮 | 「加载失败了，点击重试」 | — |
| Success | 转 Populated：出现首条对话 | — | — | 淡入 |

---

## 6. 工具结果卡（内嵌 AI 气泡，如办事指南 / 地图）

| 态 | 背景 | 标题 / 来源 | 描边 | 动效 |
|----|------|-----------|------|------|
| Default | `var(--surface)` | 标题 `var(--accent-3)`；来源 chip `var(--surface)` 底 + `var(--accent-3)` 描边 1px + 字 `var(--accent-3)` | `--elev-ring` 1px `var(--border)` | — |
| Loading | `var(--surface)` | 卡内骨架屏（行占位 shimmer） | 同 | shimmer |
| Empty | `var(--surface)` | 卡内「暂未找到，试试转人工」+ 转人工文字按钮 | 同 | — |
| Error | `var(--surface)` | 红字 `var(--danger)` + `AlertCircle`(16) + 「重试」文字按钮 | 同 | 红条滑入 |
| Success | 完整渲染，关键字段 `var(--accent-3)` 高亮 | — | 同 | 淡入 |

---

## 7. 像素级尺寸速查（前端实现基准，375px 屏宽）

| 元素 | 尺寸 / 坐标（参照 chat-home.svg） |
|------|----------------------------------|
| 状态栏 + 导航栏 | 0–88px（导航 44px，下边框 1px `--border`） |
| 返回箭头 | 16–28px 区，2px 描边 `--fg` |
| 导航标题 | 居中 17px 600 `--fg`（--text-xl） |
| 更多 `MoreHorizontal` | 右 346/352/358，y=64，1.6r 点 |
| AI 头像环 | cx=26 cy 随消息, r=18, 2px `--accent-2` 描边 |
| 名 chip | 60×20 rx10，`--accent-3` 底白字 12px |
| AI 气泡 | x=50, max-width 289, 圆角 12, 内边距 12 |
| 用户气泡 | 右对齐 max-width 258, 圆角 12, 内边距 12 |
| 来源 chip | 172×22 rx11，白底 1px `--accent-3` 描边，11px `--accent-3` 字 |
| 猜你想问卡 | 168×48 rx12，`--surface-warm`，左 16px 圆底 `--accent-2` |
| 输入胶囊 | x=16, w=268, h=40, rx20 `--surface-warm`，占位 14px `--meta` |
| 麦克风 `Mic` | 20px `--muted`，输入胶囊右侧 |
| 发送钮 | cx=344 cy=782 r=18 `--accent`，`Send`(20) 白 |
| 底部输入栏 | y=748 h=64 `--surface`，上边框 1px `--border` |

---

## 8. 无障碍 / 合规（贯穿所有态）

- 正文对比度 ≥4.5:1（`--fg` #1A1A1A on `--surface`/`--bg`；`--bubble-ai-fg` #0F3D2A on `--bubble-ai`）。
- 所有可点元素 ≥44×44px；按钮间距 ≥8px（--space-2）。
- 图标按钮带 `aria-label`；文字按钮文字独立表意（不依赖图标）。
- `:focus-visible` 显示 `--focus-ring`（微信绿 3px 半透明）。
- `prefers-reduced-motion: reduce`：关闭打字指示器 / shimmer / 转场动画，直接呈现结果。
- 字号跟随微信系统字号设置放大（相对单位），放大后不破版、不截断。
- AI 生成内容显著标识（欢迎语 / 回答 / 空态 footer 均含「AI 生成内容仅供参考」提示）。
- 不收集隐私字段（身份证 / 银行卡 / 家庭地址），留资表单仅学院 / 问题描述选填。
