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
