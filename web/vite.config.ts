import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { mockMiddleware } from './mock/server';

/**
 * 吉小农薄壳 H5 —— Vite 配置。
 *
 * 两种前端联调模式：
 *  A) 默认（不设置 VITE_USE_REAL_API）：内置 mock 中间件覆盖 openapi.yaml 5 端点，
 *     前端不依赖真实后端即可开发/演示（QA 验收即此模式）。
 *  B) 接真实后端：设置 VITE_USE_REAL_API=1，并通过 VITE_API_TARGET 指向薄壳后端
 *     （默认 http://localhost:3100）。此时禁用内置 mock，由 Vite proxy 把 /api 同源
 *     转发到真实后端，规避浏览器跨域（CORS），等价于生产态云函数代理。
 *
 * 生产部署由 CloudBase HTTP 云函数代理；前端静态产物同源托管，无需 CORS。
 *
 * T01（LOAD-4 / MAINT-5）：
 *  - manualChunks 把 react / react-dom / react-router 拆为独立 vendor chunk，
 *    使业务 chunk 与框架 chunk 走不同缓存周期，并让 scripts/check-bundle-size.mjs
 *    能对「首屏业务 chunk」单独设阈值。
 *  - reportCompressedSize 打开，构建日志直接给出 gzip 后体积，便于对齐 ≤150KB 预算。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useRealApi = env.VITE_USE_REAL_API === '1';
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:3100';

  return {
    plugins: [
      react(),
      {
        name: 'jlau-mock-api',
        configureServer(server) {
          // 模式 B：禁用 mock，交给 vite proxy 转发真实后端
          if (useRealApi) return;
          server.middlewares.use((req, res, next) => {
            void mockMiddleware(req, res, next);
          });
        },
      },
    ],
    build: {
      // 体积门禁靠 scripts/check-bundle-size.mjs 兜底，这里只负责把真实 gzip 体积打进日志
      reportCompressedSize: true,
      // 超过 150KB（LOAD-4 预算）即在构建日志给出警告，早于 CI 门禁暴露问题
      chunkSizeWarningLimit: 150,
      rollupOptions: {
        output: {
          /**
           * 框架层与业务层分离。注意：不按 node_modules 一刀切，
           * 否则 lucide-react 的按需图标会被聚成一个大 vendor，反而拖慢首屏。
           */
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/]react-router/.test(id)) return 'vendor-router';
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
              return 'vendor-react';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      port: 3000,
      host: true,
      // 仅模式 B 启用：同源转发 /api -> 真实后端
      proxy: useRealApi
        ? {
            '/api': {
              target: apiTarget,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    preview: {
      port: 3000,
    },
  };
});
