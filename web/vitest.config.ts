// 交付物配置（T01 / MAINT-2）：纯函数内核层单测。
//
// 设计要点（架构 §2.1 C6 / §2.2）：
//  1) environment: 'node' —— 被测对象（sse/retry/errors/context/requestId/config/chat-core）
//     全部是零副作用纯函数，不 import react、不碰 fetch/window/localStorage。
//     用 node 环境可省掉 jsdom 的启动开销与配置复杂度，也反向约束了内核层不许长出 DOM 依赖：
//     一旦有人在 lib/ 里碰了 window，单测会立刻红，这是结构性护栏而不只是跑得快。
//  2) 覆盖率阈值 80%，且 include 只圈定 T02 新建的内核模块 + B5 新增的 chat-core
//     （状态机纯函数层，T07 覆盖率门禁）。lib/ 下的既有模块（api/storage/theme/gpa/...）
//     属于 T04/T05 范围，本轮不测也不计分，否则分母被稀释后这个阈值就失去门禁意义。
//  3) 独立于 vite.config.ts：vitest.config.ts 存在时会取代 vite.config.ts，
//     因此不会加载 mock 中间件，测试环境零 dev server 依赖。
//
// 既有的 jsdom 组件/集成测试（test/ 目录）已迁到 vitest.qa.config.ts，
// 用 `npm run test:qa` 运行，两套互不干扰。

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/lib/**/*.test.ts'],
    css: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // 只统计 T02 纯函数内核层 + B5 chat-core（状态机纯函数，T07 覆盖率门禁）
      include: [
        'src/lib/sse.ts',
        'src/lib/errors.ts',
        'src/lib/retry.ts',
        'src/lib/context.ts',
        'src/lib/requestId.ts',
        'src/lib/config.ts',
        'src/lib/chat-core.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
