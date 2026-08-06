# 吉小农（JLAU 校园 AI 助手）移动端六维专项重测报告

**执行人**：QA 工程师（严过关 / software-qa-engineer）  
**目标**：将上一轮六维测试改用「手机模拟」重测（100% 手机用户场景），全部在本地 mock 环境完成，未触碰生产/真实 LLM/线上。  
**测试时间**：2026-08-06  
**测试范围**：`server/` 后端（Express + TS）、`web/dist` 构建产物、`web/src` 源码静态审查。  
**总轮次**：Round 1（测试+缺陷反馈） + Round 2（回归验证）= 2 轮，未进入第 3 轮。

---

## 1. 测试环境与方法

| 项目 | 配置 |
|------|------|
| 后端 | `PORT=4100 LLM_MOCK=true RATE_CHAT_MAX=100000 RATE_WINDOW_MS=60000 STORE_KIND=memory` |
| 前端静态服务 | 自写 Node SPA 静态服务器（`.qa-mobile/static-server.mjs`），含 `/api` 流式反向代理到 `localhost:4100` |
| 真机仿真 | Playwright + Chromium 内核（沙箱无法下载 Playwright 自带 Chromium，降级为系统 Microsoft Edge，version 151.0.4129.59） |
| 设备 | `iPhone 13`（390×664，dpr 3）、`Pixel 5`（393×...，dpr 2.75） |
| 压测脚本 | 在 `server/scripts/load-1000.mjs` 基础上新增 `load-1000-mobile.mjs`，原文件保留；本地护栏保留 |
| 测试框架 | vitest；新增 `server/test/mobile-compat.test.ts` |

**关键诚实标注**：
- Playwright 自带 Chromium 因沙箱网络限制（下载 191.8 MiB 卡在 0%）未成功，改由系统 Edge（同 Chromium 内核）驱动，设备仿真与渲染保真度一致。
- 所有压测仅向 `localhost:4100` 发送，`config.ts` 未写入任何压测参数；`.env` 文件时间戳未变。

---

## 2. 测试总览

| 维度 | 方法 | 结果 |
|------|------|------|
| A. 前端真·手机仿真 | Playwright 设备仿真 + 截图 + 命中区测量 + 控制台监听 | 38/40 通过，发现 1 个源码缺陷 |
| B. 后端 1000 并发 + 移动网络 | 移动 UA + 慢消费者 + 5% 中途断连 | 4 轮全部通过，无泄漏/崩溃 |
| C. 移动专项兼容性 | 静态产物 + CSS 源码审查 + vitest | 全部通过 |
| D. 移动专项安全 | 源码扫描 + 高频输入（emoji/RTL/长文本）+ 链接白名单 | 全部通过 |
| E. 异常恢复 | 客户端中途断连 vitest + 压测中 200 条真实断连 | 全部通过 |

**vitest 全量**：13 files, **228 passed, 1 skipped, 0 failed**（上一轮 197 passed，净增 31 条移动端用例）。

---

## 3. 维度 A：前端真·手机仿真

### 3.1 首屏渲染
- iPhone 13 / Pixel 5 均成功渲染 Welcome 页，截图见 `server/test/shots/welcome-*.png`。
- 无横向溢出：`scrollWidth == innerWidth`（390/393）。
- 顶部内容 `top=40px`，未被刘海遮挡。
- 主题色 `#3D6B51`、农大绿图标、`viewport-fit=cover` 均生效。

### 3.2 触屏链路（端到端 SSE）
- `tap()` 开始对话 → `/chat?scenario=baodao` → `tap()` 输入框 → `fill()` → `tap()` 发送 → 等待 `.bubble.ai` 文本出现。
- 双设备均成功在 30s 内收到 AI 回复，未卡在 loading。
- 单次发送只产生 1 条用户气泡，无重复提交。

### 3.3 触摸目标尺寸
- `.btn-primary`：350×52 / 353×52（通过）
- `.input-pill`：302×44 / 305×44（通过，内边距区可聚焦输入框）
- `.nav-action` / `.nav-more`：44×44（通过）
- `.guess-card`：280×44.5（通过）
- ❌ **`.send-btn`：40×40（未达 44px 标准）**

### 3.4 无 hover-only 问题
- 全局 CSS 有 9 处 `:hover`，全部为视觉增强（按钮背景、图标缩放、卡片文案高亮），移动端均能通过对应 tap 状态触发（:active 已存在），关键交互未依赖 hover。

### 3.5 控制台健康
- iPhone 13 / Pixel 5 / 弱网场景：`console.error = 0`，`pageerror = 0`。

### 3.6 弱网感知
- 使用 `page.route` 给 `/api/v1/chat` 加 800ms 延迟：
  - loading 态出现（发送按钮转圈）
  - 连点 3 次仅产生 1 条用户消息、1 条 `/chat` 请求
  - 最终成功收到回复，无 pageerror

---

## 4. 维度 B：后端 1000 并发 + 移动网络条件

压测脚本：`server/scripts/load-1000-mobile.mjs`

### 4.1 测试条件
- 并发：1000 条同时 fire
- 移动 UA：iPhone OS 16 Safari
- 慢消费者：每 chunk 读完后 `sleep(20–40ms)`，模拟手机低带宽
- 断连：随机 5%（50 条）在收到首 token 后立即 `controller.abort()`
- 服务端健康：压测全程每 1s 轮询 `/healthz`

### 4.2 四轮结果汇总

| 轮次 | 可完成请求 | 成功 | 失败 | 超时 | 墙钟耗时 | 完成 p50/p95 | healthz 最大 RTT | 判定 |
|------|-----------|------|------|------|----------|--------------|------------------|------|
| 1 | 950 | 950 | 0 | 0 | 2900.6 ms | 2448 / 2564 ms | 485 ms | ✅ 通过 |
| 2 | 950 | 950 | 0 | 0 | 2663.8 ms | 2308 / 2358 ms | 476 ms | ✅ 通过 |
| 3 | 950 | 950 | 0 | 0 | 2711.9 ms | 2339 / 2374 ms | 465 ms | ✅ 通过 |
| 4 | 950 | 950 | 0 | 0 | 未单独计时 | - | - | ✅ 通过 |

- **断连请求识别**：4 轮共 200 条预期 abort，全部识别为 `aborted`，未影响可完成请求统计。
- **服务端事件循环**：客户端最大漂移 609ms（< 2000ms），服务端 healthz 失败 0 次。
- **内存**：服务端 RSS 在压测中从 82.4 MB 升至 112 MB，空闲 25s 后回落到 83.3 MB，**无持续增长/泄漏**。

### 4.3 与上一轮非节流结果对比
上一轮非移动压测（load-1000.mjs）墙钟约 500ms 级、吞吐 > 1000 req/s；本次移动网络条件下：
- 墙钟 ~2.7s（慢消费者自身 20–40ms/chunk 叠加 1000 并发自然排队）
- 吞吐 ~350 req/s
- 成功率仍 100%，超时 0%，服务端健康正常。

结论：在模拟移动低带宽 + 5% 运营商掉线的严苛条件下，服务端仍稳定，无背压崩溃/内存泄漏。

---

## 5. 维度 C：移动专项兼容性

| 检查项 | 结果 |
|--------|------|
| `viewport` 含 `width=device-width` | ✅ |
| `viewport-fit=cover` | ✅ |
| `theme-color` = `#3D6B51` | ✅ |
| `user-scalable=no` | ⚠️ 观察项：可访问性权衡 |
| 全屏容器用 `100dvh` 而非 `100vh` | ✅ |
| 源码/产物使用 `env(safe-area-inset-top/bottom)` | ✅ |
| 输入框回车发送已实现 | ✅ |
| `enterkeyhint` / `inputmode` 未设置 | ⚠️ 观察项：软键盘回车键文案未优化 |

---

## 6. 维度 D：移动专项安全

| 检查项 | 结果 |
|--------|------|
| 全源码零 `dangerouslySetInnerHTML` | ✅ |
| Markdown / 来源链接仅放行 `https?:\/\/` | ✅ |
| emoji 代理对、ZWJ、国旗、肤色修饰符、RTL、零宽字符、组合音标、2000 字长文本均不崩溃 | ✅ |
| 移动 UA 下正常应答 | ✅ |

---

## 7. 维度 E：异常恢复

| 检查项 | 结果 |
|--------|------|
| 客户端首 token 后断开（20 次连续 abort）服务端不崩溃，后续请求正常 | ✅ |
| 压测中 5% 真实中途断连（共 200 条）服务端日志无 ECONNRESET/EPIPE/unhandled | ✅ |
| 断连风暴后 `/healthz` = ok | ✅ |
| 后台标签页/息屏仅影响前端 SSE 连接（静态说明，见观察项） | ⚠️ 观察项 |

---

## 8. 缺陷与观察项

### 8.1 源码缺陷（路由：Engineer）

**QA-M01：发送按钮 `.send-btn` 触摸目标 40×40，低于 44px 标准**

- 证据：
  - `web/src/styles/global.css:736-738` 硬编码 `width: 40px; height: 40px;`
  - 构建产物 `.send-btn{width:40px;height:40px}`
  - Playwright 实测命中区：`40×40`，`elementFromPoint(button_center±24px)` 命中 `.input-bar` 而非 `.send-btn`，证明未通过 padding/伪元素扩大命中区
- 影响：发送是 100% 手机用户的最高频操作，按钮偏小 9%，在全面屏手势操作下误触/点不中风险增加。
- 修复建议：将 `.send-btn` 改为 `44×44`，并微调 `input-bar` 内布局避免被撑破；同文件内 `.nav-action/.nav-more` 已采用 44px，可直接对齐。

### 8.2 观察项（非缺陷，已锁定现状）

| 编号 | 内容 | 原因 |
|------|------|------|
| QA-O01 | `user-scalable=no` + `maximum-scale=1.0` | 防止 iOS 聚焦放大与误缩放，但影响低视力用户 |
| QA-O02 | 输入框未设置 `enterkeyhint="send"` / `inputmode` | 软键盘回车键未显示为「发送」；可后续 UX 优化 |
| QA-O03 | 手机后台标签页/息屏 | 浏览器可能挂起 SSE；纯前端行为，建议加 on/offline 提示与重连 |

---

## 9. 新增/修改的测试与脚本

| 路径 | 说明 |
|------|------|
| `server/scripts/load-1000-mobile.mjs` | 新增：移动 UA + 慢消费者背压 + 5% 中途断连 + 服务端健康探针 |
| `server/test/mobile-compat.test.ts` | 新增：31 条 vitest 用例，覆盖移动兼容/安全/断连/高频输入 |
| `.qa-mobile/mobile-e2e.mjs` | 新增：Playwright 真机仿真脚本（iPhone 13 / Pixel 5 / 弱网） |
| `.qa-mobile/static-server.mjs` | 新增：带 `/api` 流式反代的本地 SPA 静态服务器 |
| `.qa-mobile/probe-touch.mjs` | 新增：触摸目标定性探针（用于区分测试假设错误与真实缺陷） |
| `server/test/shots/*.png` | 截图产物（Welcome/Chat/WeakNet 共 5 张） |

---

## 10. 路由判定

- 1 个**源码缺陷**（发送按钮触摸目标 40px）→ **Engineer（Alex）** 修复。
- 2 处测试初期假设错误（`.nav-back` 不存在、`.chat-input` 高度）已由 QA 自修，未反馈。
- 其余全部通过 → 附属于缺陷报告中作为「已达标的证据」。

**最终判定**：**Engineer**（需修复 QA-M01 后，QA 将 `mobile-compat.test.ts` 中的 `it.fails` 改回 `it` 并回归）。

---

## 11. 真机级 vs 沙箱限制的诚实说明

| 做到了真机级 | 仍受沙箱限制 |
|--------------|--------------|
| ✅ Chromium 内核真实渲染（Edge 驱动） | ⚠️ Playwright 自带 Chromium 未下载成功（网络），降级为系统 Edge |
| ✅ iPhone 13 / Pixel 5 设备指标（viewport、dpr、touch） | ⚠️ 非真实物理手机，不能验证真实发热/电量/手势冲突 |
| ✅ 真实 tap/type 事件、SSE 端到端 | ⚠️ 弱网为 route 层延迟，未模拟真实 3G/4G 丢包与 RTT 抖动 |
| ✅ 命中区 `getBoundingClientRect` / `elementFromPoint` 实测 | ⚠️ 真机截图仅 5 张，未覆盖所有场景卡 |
| ✅ 1000 并发 + 慢消费者 + 断连在本地真实进程 | ⚠️ 压测仅在单台机器，未覆盖分布式网关/公网链路 |

---

## 12. 测试清理情况

- `localhost:4100` mock 后端已停止
- `localhost:4200` 静态服务器已停止
- 临时压测日志（`round*.log`、`qa-mock-4100.log`）已删除
- 未修改 `server/src/`、`web/src/`、`config.ts`、`.env`
- `.qa-mobile/` 作为隔离测试工作区保留（含 Playwright 依赖与脚本）
