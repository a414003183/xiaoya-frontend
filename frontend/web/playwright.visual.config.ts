import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/**
 * 视觉基线量具（08 B2-3 / 07 §5.1d）：**手动量具，不是门禁**。
 * 旧形态（`e2e/visual-baseline.spec.ts`）只截图不做比对，永远通过——留在 `pnpm test:e2e`
 * 里只会给套件灌入 20 页 ×2 主题的重活与两处固定睡眠带来的假信心，故移出默认 testDir。
 * 用法：`pnpm test:visual`（需 API/前端起服，继承 e2e 的 webServer 与 MySQL 夹具）。
 * 产物落 `tmp/shots/baseline/`（不入库，06 §七 决策⑨）。
 */
export default defineConfig({
  ...base,
  testDir: './visual',
})
