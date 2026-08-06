// [QA 配置] 既有 jsdom 组件/集成测试套件（test/ 目录），由 `npm run test:qa` 运行。
//
// 来源说明：本文件内容原本就是仓库里的 vitest.config.ts。T01 把 vitest.config.ts
// 改成了交付物用途（纯函数内核层 · node 环境 · 覆盖率门禁），为避免破坏既有 QA 套件，
// 把原配置原样搬到这里，只改文件名，不改任何行为。
//
// ⚠️ 依赖提示：本配置需要 jsdom。
// jsdom 原先只存在于 node_modules 而**未声明在 package.json**（历史 QA 临时安装的产物），
// 因此 T01 执行 `npm i -D @vitest/coverage-v8` 时被 npm 当作 extraneous 包连带清理掉了。
// 已在 package.json 补上声明；当前工作区需执行一次 `npm i` 才能真正装回。
// 在此之前 `npm run test:qa` 会报 "Cannot find package 'jsdom'"。
// 交付物主测试链 `npm test`（node 环境，纯函数层）不依赖 jsdom，不受影响。
//
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
