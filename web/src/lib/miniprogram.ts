// web/src/lib/miniprogram.ts —— 微信小程序 web-view 环境最小适配（M-5，P1 可选）
//
// 检测依据（不依赖手动引入 jweixin，web-view 内微信会自动注入桥）：
//   - window.__wxjs_environment === 'miniprogram'（web-view 内注入的官方标记）
//   - window.wx?.miniProgram 存在（微信注入的桥对象）
//
// 普通浏览器 / 微信内置浏览器中 isMiniProgram() 返回 false，所有分支走既有路径，行为零变化。

interface MiniProgramBridge {
  navigateBack?: (opts?: { delta?: number }) => void;
  postMessage?: (opts?: { data?: unknown }) => void;
}

interface WeChatBridge {
  miniProgram?: MiniProgramBridge;
}

type MiniProgramWindow = Window & {
  __wxjs_environment?: string;
  wx?: WeChatBridge;
};

/** 当前是否运行在微信小程序 web-view 环境中。 */
export function isMiniProgram(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as MiniProgramWindow;
  return w.__wxjs_environment === 'miniprogram' || Boolean(w.wx?.miniProgram);
}

/** 小程序环境内返回：调用 wx.miniProgram.navigateBack 退出 web-view 页面栈。非小程序环境静默无操作。 */
export function navigateBackInMiniProgram(): void {
  if (!isMiniProgram()) return;
  (window as MiniProgramWindow).wx?.miniProgram?.navigateBack?.({ delta: 1 });
}

/**
 * 向小程序侧 postMessage（M-5.③ 已判定不做，此函数保留供审计/未来用）。
 * 注意：数据只能通过 web-view 的 bindmessage 在分享/关闭/返回等特定时机回传，
 * 不能实时改变分享卡标题——分享标题由小程序壳 onShareAppMessage 静态决定。
 */
export function postToMiniProgram(data: unknown): void {
  if (!isMiniProgram()) return;
  (window as MiniProgramWindow).wx?.miniProgram?.postMessage?.({ data });
}
