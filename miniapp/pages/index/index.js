// ============ 常量集中区（唯一配置点，占位符替换处） ============
// 用户提供自定义域名后，把 <CUSTOM_DOMAIN> 替换为实际域名（建议子域名 chat.<用户域名>），
// 并确认已在 CloudBase「HTTP 访问服务（网关）」绑定该域名（见 docs/miniapp/domain-binding.md）。
const H5_BASE = 'https://<CUSTOM_DOMAIN>/chat'; // TODO: 用户提供域名后替换 <CUSTOM_DOMAIN>
const DEFAULT_SCENARIO = 'baodao'; // PRD D-M4 默认场景
const SHARE_TITLE = '吉小农报到助手'; // M-6 默认名称（用户可定稿）
const SHARE_DESC = '新生报到 AI 答疑，秒回！'; // 分享描述

Page({
  data: { src: '', scenario: DEFAULT_SCENARIO },

  // scenario 从启动参数/分享卡片路径取，默认 baodao（PRD D-M4）。
  // 支持未来多场景（如 dorm / fee）：encodeURIComponent 保证多场景安全透传。
  onLoad(options) {
    const scenario = (options && options.scenario) || DEFAULT_SCENARIO;
    this.setData({
      scenario,
      src: `${H5_BASE}?scenario=${encodeURIComponent(scenario)}`,
    });
  },

  // 分享卡片：标题/路径带 scenario，保证点卡片直达答疑页（AC-M1.2 / AC-M1.4）。
  onShareAppMessage() {
    return {
      title: SHARE_TITLE,
      desc: SHARE_DESC,
      path: `/pages/index/index?scenario=${encodeURIComponent(this.data.scenario)}`,
      // imageUrl: '/assets/share.png', // 可选：用户提供 5:4（500×400）分享图后启用；缺省用页面截图
    };
  },

  // M-5 可选：接收 H5 侧 postMessage（仅在分享/关闭等时机触发，不能实时改分享卡标题——
  // 架构已判定 M-5.③ 不做，分享标题直接在本文件常量区定死）。
  onMessage() {
    // 当前无消费方，保留空实现以承载 bindmessage 绑定。
  },
});
