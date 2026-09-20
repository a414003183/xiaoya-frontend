import { defineConfig } from '@playwright/test'

/**
 * E2E 走真实链路（phase-6 T-7）：真后端（e2e profile → MySQL 独立 schema zentao_e2e，
 * 启动命令链先 db-reset 重建再起 api，Flyway 自动建表）+ 真前端（VITE_API_MOCK=0 关闭 MSW）。
 * 01 §5：关键链路验收，用例由各阶段卡指定。本机需可达的 MySQL（默认 127.0.0.1:3306 root/root，
 * 可用 E2E_DB_URL/E2E_DB_USER/E2E_DB_PASSWORD 覆写）。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: [
    {
      // 先重建 zentao_e2e 再起 api（Playwright 先起 webServer 后跑 globalSetup，顺序只能靠命令链保证）
      command: 'node e2e/db-reset.mjs && mvn -q -f ../../backend spring-boot:run -Dspring-boot.run.profiles=e2e',
      url: 'http://localhost:8080/v3/api-docs',
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      env: { VITE_API_MOCK: '0' },
      // 始终起新实例：复用残留 vite（可能 VITE_API_MOCK 不一致或模块图过期）曾让用例"确定性"失败
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
