# 禅道重写 · 前端

pnpm monorepo：`web/`（应用与路由）、`packages/`（design-system / api-client / app-shell / i18n）。
架构分层、命名与页面骨架规定见 `../docs/plan/CONVENTIONS.md`（§2 后端 / §3 前端）与 `../docs/plan/architecture/`（ADR）。

## 命令（在 `frontend/` 下执行）

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 起前端 dev server（5173，proxy → 后端 8080） |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | 类型 / Biome / vitest 三件套 |
| `pnpm test:e2e` | Playwright 关键链路（真后端 + 真前端，需本机 MySQL 3306） |
| `pnpm test:visual` | 视觉基线截图 —— **手动量具，不是门禁**（只截图不比对；产物 `tmp/shots/baseline/`，见 `web/visual/`） |
| `pnpm routes` / `pnpm routes:check` | 路由 codegen / 防手改校验（格式化失败即非零退出） |
| `pnpm codegen` | 由 `contract/openapi.yaml` 重生成 api-client |

## 连接后端：默认真后端，mock 要显式开

- **默认连真后端**（06 A4-2）：`pnpm dev` 起的是 5173，`/api/v1` 经 vite proxy 打到 `http://localhost:8080`，需要后端已在跑（`mvn -f ../backend spring-boot:run`）。
- **离线开发走 mock 才需要显式开**：`VITE_API_MOCK=1 pnpm dev`（MSW 只在这个开关下注册，见 `web/src/main.tsx`）。
- **单测与 E2E 不受该开关影响**：vitest 用例各自 `setupServer(...handlers)`；E2E 走 `VITE_API_MOCK=0` 的真后端链路。

> mock 数据（`web/src/mocks/*.ts`）只服务单测与离线开发，一律用英文/中性占位——界面文案走 i18n 语言包
> （`packages/i18n/src/locales/`），后端错误只用错误码（`common.message.*` 映射，见 `packages/api-client/src/error-text.ts`）。
