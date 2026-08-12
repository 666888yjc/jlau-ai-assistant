# 吉小农静态托管 · 控制台配置卡（唯一需要手动操作的部分）

> 已核实：自定义响应头 / brotli 压缩 / immutable 缓存**没有任何 API/CLI/MCP 通道可配置**（MCP manageHosting、tcb hosting CLI、CloudBase tcb API、framework 插件均不支持），只能在 **CloudBase 控制台 → 静态托管** 里配置。以下为最终配置值，照抄即可。

## 入口
腾讯云控制台 → 云开发 CloudBase → 环境 `yjc-d0gvjkk8tae8bf1ad` → **静态网站托管（Web 托管）** → **配置管理 / 高级配置**

---

## ① 自定义响应头（最重要）

| 匹配路径 | 响应头 Key | 响应头 Value | 说明 |
|---|---|---|---|
| `**/*.html` | `content-disposition` | `inline` | ⚠️ 当前线上是 `attachment`，个别 WebView 可能下载而非渲染 |
| `**/*.html` | `cache-control` | `no-cache` | 首页每次回源校验，部署后即时生效 |
| `**/*.js` / `**/*.css` / `**/*.png` 等静态资源 | `cache-control` | `public, max-age=31536000, immutable` | 哈希文件名，永久缓存 |
| 全站 `**` | `strict-transport-security` | `max-age=31536000; includeSubDomains` | HSTS |
| 全站 `**` | `x-content-type-options` | `nosniff` | |
| 全站 `**` | `x-frame-options` | `SAMEORIGIN` | 防点击劫持 |
| 全站 `**` | `referrer-policy` | `strict-origin-when-cross-origin` | |
| 全站 `**` | `permissions-policy` | `camera=(), microphone=(), payment=(), usb=(), geolocation=(self)` | |
| 全站 `**` | `content-security-policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'` | 建议先试 `content-security-policy-report-only` 观察 1-2 天无拦截再转 enforce |

> ⚠️ CSP 先开 report-only（最后一行注释的 key 换成 `content-security-policy-report-only`），确认页面无拦截再改回 enforce。

## ② 压缩（弱网提速）
开启 **Brotli + Gzip**（当前仅 gzip），对 `text/html`、`application/javascript`、`text/css`、`application/json` 生效。

## ③ 验收
配置后刷新页面，用任意在线 HTTP 头检查工具或浏览器 DevTools 确认：
- HTML 响应头 `content-disposition: inline`、`cache-control: no-cache`
- JS/CSS 响应头 `cache-control: ... immutable`、`content-encoding: br`
- 全站含 HSTS/CSP/X-Frame 安全头

配置完成后可回到对话里告诉我，我会复测验证。
