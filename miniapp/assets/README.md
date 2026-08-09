# miniapp/assets/ —— 分享卡片图片（可选）

此目录用于放置分享卡片图 `share.png`（用户定稿后放入），规格：

- 尺寸 **5:4**（建议 500×400）
- 内容建议：答疑页截图 / 校徽素材（用户可提供）

放入后在 `pages/index/index.js` 的 `onShareAppMessage` 中启用：

```js
imageUrl: '/assets/share.png',
```

缺省情况下微信使用页面截图作为分享图，无需本文件即可正常分享。

> 本文件仅作占位说明，**不提交真实图片**。当前目录不含任何业务资源。
