import { defineConfig } from '@playwright/test'

/**
 * E2E 走真实链路（phase-6 T-7）：真后端（e2e profile → MySQL 独立 schema zentao_e2e，
 * 启动命令链先 db-reset 重建再起 api，Flyway 自动建表）+ 真前端（VITE_API_MOCK=0 关闭 MSW）。
 * 01 §5：关键链路验收，用例由各阶段卡指定。本机需可达的 MySQL（默认 127.0.0.1:3306 root/root，
 * 可用 E2E_DB_URL/E2E_DB_USER/E2E_DB_PASSWORD 覆写）。
 *
 * T73/OPS-12/16 端口与产物面：
 * - E2E_API_PORT / E2E_WEB_PORT（缺省 8080 / 5173）——一次性端口并行起服，不撞常驻开发实例；
 * - E2E_BACKEND_DIR（缺省 ../../backend）——多会话并行时指向隔离副本跑 maven（backend/target 是
 *   共享产物目录，绝不在真 backend/ 上并发 mvn）；
 * - trace: retain-on-failure + html reporter（OPS-03：CI 失败时 playwright-report/ 与 test-results/
 *   整包上传取证）。
 */
const apiPort = Number(process.env.E2E_API_PORT ?? 8080)
const webPort = Number(process.env.E2E_WEB_PORT ?? 5173)
const backendDir = process.env.E2E_BACKEND_DIR ?? '../../backend'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // 先重建 zentao_e2e 再起 api（Playwright 先起 webServer 后跑 globalSetup，顺序只能靠命令链保证）。
      // 探活走匿名 /actuator/health——/v3/api-docs 自 T14 起要 api-doc-view（匿名 401），不能当就绪探针。
      command: `node e2e/db-reset.mjs && mvn -q -f ${backendDir} spring-boot:run -Dspring-boot.run.profiles=e2e -Dspring-boot.run.arguments=--server.port=${apiPort}`,
      url: `http://localhost:${apiPort}/actuator/health`,
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      command: 'pnpm dev',
      url: `http://localhost:${webPort}`,
      env: {
        VITE_API_MOCK: '0',
        // vite.config.ts 认这两个口（T61 起）：端口与代理目标都随一次性端口走
        VITE_PORT: String(webPort),
        VITE_API_PROXY: `http://localhost:${apiPort}`,
      },
      // 始终起新实例：复用残留 vite（可能 VITE_API_MOCK 不一致或模块图过期）曾让用例"确定性"失败
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
