import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { getStore } from './store';

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
