# 吉小农报到助手 · 小程序壳（miniapp/）

方案 B（WebView 套壳）的原生微信小程序工程。**独立工程，不进 `web/` 构建链、无 npm 依赖**。

- 页面：仅 `pages/index/index` 一个 web-view 全屏页（微信平台硬性约束：web-view 页面不能混用其他组件）
- 业务：全部在 H5（`web/src`），本壳只负责「加载 H5 + scenario 透传 + 分享卡片」
- 关联文档：`docs/miniapp/`（域名绑定 / 业务域名 / 类目文案 / 隐私指引 / 提审清单）

---

## 0. 占位符替换清单（用户提供材料后替换）

| 占位符 | 位置 | 替换为 | 阻塞 |
|---|---|---|---|
| `<CUSTOM_DOMAIN>` | `pages/index/index.js` 常量区 `H5_BASE` | 自定义域名（建议 `chat.<用户域名>`） | 真机加载 H5（域名未绑定前开发者工具需勾选「不校验合法域名」调试） |
| `<APPID>` | `project.config.json` | 小程序 AppID | 真机预览 / 上传 |

> 唯一代码替换点是 `pages/index/index.js` 顶部常量区，其余文件无需改动。
> 域名绑定流程见 `docs/miniapp/domain-binding.md`；业务域名配置见 `docs/miniapp/business-domain.md`。

---

## 1. 微信开发者工具导入

1. 打开微信开发者工具 → 导入项目
2. 目录选择本目录 `miniapp/`
3. AppID 填 `<APPID>`（用户提供；无 AppID 时可用测试号，但 web-view 真机加载需正式 AppID + 业务域名）
4. 导入后编译，应看到 web-view 全屏加载 `https://<CUSTOM_DOMAIN>/chat?scenario=baodao`

## 2. 本地调试（域名未配置前的临时手段）

- 详情 → 本地设置 → 勾选 **「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**
- 仅限调试期使用；业务域名配置完成后**务必取消勾选**，否则真机预览可能因「非业务域名」被拦（见 `docs/miniapp/business-domain.md`）

## 3. 真机预览

1. 开发者工具 → 点「预览」
2. 手机微信扫码（iOS + Android 各一台，AC-M1.3）
3. 检查：web-view 加载成功、可输入提问、可收到流式回答、右上角「…」可转发

## 4. 上传与版本管理

1. 开发者工具 → 点「上传」
2. 填版本号（如 `1.0.0`）与备注（如「首版：WebView 套壳 + scenario 透传 + 分享卡片」）
3. 登录微信公众平台 → 「版本管理」→ 可看到该开发版
4. 提审 / 发布：材料齐备后按 `docs/miniapp/submit-checklist.md` 操作

---

## 5. 注意事项

- **web-view 页面不能混用其他组件**：`pages/index/index.wxml` 只有 `<web-view>` 一个组件
- **分享卡片标题/描述在壳内定死**：H5 侧 postMessage 不能实时改分享卡标题（架构 M-5.③ 已判定不做）
- **业务域名硬性要求**：web-view 加载的域名必须是微信公众平台「业务域名」中已配置的 HTTPS 域名
- **本工程不含任何 baodao 业务代码**：问答内容 / 知识库 / 场景定义全部在 H5 与后端
