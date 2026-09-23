# 小雅管理后台 · 前端（xiaoya-frontend）

产品 → 需求 → 项目/执行 → 任务 → 测试（Bug/用例）闭环项目管理平台的前端 monorepo。

- React 19 + Vite 8 + TypeScript（strict + `noUncheckedIndexedAccess`，全仓 `any` 为零）+ antd 5
- pnpm monorepo：`api-client`（orval 从契约生成）/ `design-system`（唯一 UI 来源）/ `app-shell`（布局/会话/权限）/ `i18n` + 主应用 `web`
- 契约先行：`contract/openapi.yaml` 为唯一真源（与[后端仓库](https://github.com/a414003183/xiaoya-backend)中的契约同步），`pnpm codegen` 重新生成 API 层
- 机器门禁：域边界 / 语言键 / 禁用词 / 原始样式 / 权限覆盖 / 路由生成物 diff（`tools/`）

## 环境要求

Node ≥ 22.12（推荐 24 LTS）+ pnpm 12。

## 快速开始

```bash
cd frontend
pnpm install
pnpm dev          # MSW mock 独立开发；联调真后端用 VITE_API_MOCK=0
```

## 常用命令（均在 `frontend/` 下）

```bash
pnpm typecheck    # 全包 tsc --noEmit
pnpm lint         # biome + 域边界门禁
pnpm test         # vitest 行为测试（MSW，零快照）
pnpm routes       # 由页面注解重新生成路由表
pnpm codegen      # 由 contract/openapi.yaml 重新生成 api-client
pnpm build        # 产物在 web/dist
pnpm test:e2e     # Playwright 真链路 E2E（需把后端仓库克隆到本仓 backend/，或设 E2E_BACKEND_DIR 指向别处；另需 Docker/MySQL）
```

## 目录

```
frontend/   pnpm monorepo（packages/* + web 主应用）
contract/   openapi.yaml —— 从后端仓库同步的 API 契约副本
tools/      工程门禁脚本（契约 diff / 域边界 / 语言键 / 路由生成 / bundle 预算）
package.json + pnpm-lock.yaml   tools/ 脚本运行依赖（yaml 等）
```

## 许可与来源

本仓库是禅道（ZenTao）开源版管理后台的独立重写实现，上游为 <https://gitee.com/wwccss/zentaopms>，
以上游双授权中的 **AGPL-3.0** 发布。衍生范围、来源说明与商标声明见 [NOTICE.md](NOTICE.md)，许可全文见 [LICENSE](LICENSE)。
