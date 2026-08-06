// [QA 临时文件] 仅供 QA 验收使用，不属于交付物。
// 独立于 vite.config.ts：不引入 mock/server 中间件，避免测试环境依赖 dev server。
// tsconfig.json 的 include 只有 "src"，因此 test/ 目录不进入 `tsc --noEmit`，不污染 npm run build。

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    css: false,
    restoreMocks: true,
  },
});
