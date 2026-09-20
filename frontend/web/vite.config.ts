import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react({
      compiler: true,
      // 生成物（orval 产物）不走 React Compiler：无收益且引入 compiler-runtime 解析问题
      exclude: [/\/node_modules\//, /\/src\/generated\//],
    }),
    tailwindcss(),
  ],
  server: {
    // 端口与代理目标可用环境变量覆盖，便于与其它会话/实例并行起服（缺省仍是 5173 → 8080）
    port: Number(process.env.VITE_PORT ?? 5173),
    proxy: {
      '/api': process.env.VITE_API_PROXY ?? 'http://localhost:8080',
    },
  },
  build: {
    // Vite 8（rolldown 内核）：分包走 output.codeSplitting（manualChunks 在 rolldown 下被静默忽略）。
    // 按 features/<domain> 分包（P6 T-8）：每个业务域一块（chunk 名 domain-<domain>），
    // 使「单域 chunk ≤120KB gz」可度量（01 §5）；域间共享依赖与 node_modules 由 rolldown
    // 自动拆共享 chunk，echarts/marked/diff 等重库只随消费域的懒加载链走、进不了入口。
    // platform 域例外不分组：入口 app-router 静态引用其 NotificationBell，分组会把整域
    // （含各页面）拖进首屏；不分组时 platform 保持按页小 chunk。
    rolldownOptions: {
      output: {
        codeSplitting: {
          // 不递归收编域内模块的依赖（默认 true 会把 antd/echarts 等重库拖进先建组的域 chunk）
          includeDependenciesRecursively: false,
          groups: [
            {
              name(id) {
                const domain = id.match(/[\\/]src[\\/]features[\\/](\w+)[\\/]/)
                return domain && domain[1] !== 'platform' ? `domain-${domain[1]}` : null
              },
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // e2e/ 归 Playwright（pnpm test:e2e），vitest 只收 src 下的单测
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // 并行负载下 MSW+antd 渲染偶发超默认 5s（隔离跑绿）；放宽到 15s 不弱化断言
    testTimeout: 15_000,
  },
})
