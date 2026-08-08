import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { getStore } from './store';

/**
 * 兜底：未捕获的 Promise rejection 只记日志，不崩进程。
 * 主防线是 app.ts 的 asyncHandler 包装（路由 rejection → errorHandler → 5002）；
 * 这里是双保险，防任何漏网的异步 rejection 把云函数进程搞挂（线上 443 教训）。
 */
process.on('unhandledRejection', (reason) => {
  console.error('[jlau-ai-assistant] unhandledRejection', reason);
});

async function main(): Promise<void> {
  await getStore(); // 初始化存储（首次运行灌种子）
  const app = createApp();
  app.listen(config.port, () => {
    console.log(
      `[jlau-ai-assistant] 薄壳后端已启动 http://localhost:${config.port} (brain=${config.brain})`,
    );
  });
}

main().catch((e) => {
  console.error('[jlau-ai-assistant] 启动失败', e);
  process.exit(1);
});
