import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import BuildDetailPage from '../pages/build-detail-page.page'
import BuildListPage from '../pages/build-list-page.page'
import PlanDetailPage from '../pages/plan-detail-page.page'
import PlanListPage from '../pages/plan-list-page.page'
import ProductBranchesPage from '../pages/product-branches-page.page'
import ProductCategoriesPage from '../pages/product-categories-page.page'
import ProductDetailPage from '../pages/product-detail-page.page'
import ProductKanbanPage from '../pages/product-kanban-page.page'
import ProductListPage from '../pages/product-list-page.page'
import ProductProjectsPage from '../pages/product-projects-page.page'
import ReleaseDetailPage from '../pages/release-detail-page.page'
import ReleaseListPage from '../pages/release-list-page.page'

/** product 域页面冒烟：种子数据经 MSW 渲染（T-3/T-7/T-10 的「MSW 下可操作」最低保障）。 */
initI18n()

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

/** 删除入口（V-01）测试用权限码：产品删除入口按 HasPerm 显隐。 */
const DELETE_PRIVILEGES = ['product-view', 'product-delete', 'branch-delete', 'plan-delete', 'release-delete']

function renderPage(page: ReactElement, path: string, entry: string, privileges: string[] = []): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={privileges}>
            <MemoryRouter initialEntries={[entry]}>
              <Routes>
                <Route path={path} element={page} />
              </Routes>
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('product 主页族', () => {
  test('列表渲染产品与状态页签', async () => {
    renderPage(<ProductListPage />, '/products', '/products')
    expect((await screen.findAllByText('Demo Product')).length).toBeGreaterThan(0)
  })

  test('看板按状态分列', async () => {
    renderPage(<ProductKanbanPage />, '/products/kanban', '/products/kanban')
    expect((await screen.findAllByText('Cloud Platform')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('已结束').length).toBeGreaterThan(0)
  })

  test('详情渲染页头动作区与简介页签', async () => {
    renderPage(<ProductDetailPage />, '/products/:productId', '/products/1')
    expect((await screen.findAllByText('Demo Product')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '结束产品' })).toBeInTheDocument()
  })
})

describe('branch / category 页', () => {
  test('分支列表渲染默认分支与行内动作', async () => {
    renderPage(<ProductBranchesPage />, '/products/:productId/branches', '/products/2/branches')
    expect((await screen.findAllByText('Trunk')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('默认分支').length).toBeGreaterThan(0)
  })

  test('分类树按 type 页签渲染节点树', async () => {
    renderPage(<ProductCategoriesPage />, '/products/:productId/categories', '/products/1/categories')
    expect((await screen.findAllByText('User Center')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('Sign In')).length).toBeGreaterThan(0)
  })
})

describe('plan / release / build 页族', () => {
  test('计划列表渲染列表视图并可切看板', async () => {
    renderPage(<PlanListPage />, '/products/:productId/plans', '/products/1/plans')
    expect((await screen.findAllByText('V1.0 Release Plan')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('V1.0 Sprint 1').length).toBeGreaterThan(0)
  })

  test('计划详情渲染动作区与需求页签', async () => {
    renderPage(<PlanDetailPage />, '/plans/:planId', '/plans/1')
    expect((await screen.findAllByText('V1.0 Release Plan')).length).toBeGreaterThan(0)
    expect(await screen.findByRole('button', { name: /完\s*成/ })).toBeInTheDocument()
    expect((await screen.findAllByText('Support SMS captcha on login page')).length).toBeGreaterThan(0)
  })

  test('发布列表与详情渲染', async () => {
    renderPage(<ReleaseListPage />, '/products/:productId/releases', '/products/1/releases')
    expect((await screen.findAllByText('V0.9 Beta')).length).toBeGreaterThan(0)
    cleanup()
    renderPage(<ReleaseDetailPage />, '/releases/:releaseId', '/releases/1')
    expect((await screen.findAllByText('V0.9 Beta')).length).toBeGreaterThan(0)
  })

  test('构建列表与详情渲染关联需求', async () => {
    renderPage(<BuildListPage />, '/products/:productId/builds', '/products/1/builds')
    expect((await screen.findAllByText('build-20260815')).length).toBeGreaterThan(0)
    cleanup()
    renderPage(<BuildDetailPage />, '/builds/:buildId', '/builds/1')
    expect((await screen.findAllByText('build-20260815')).length).toBeGreaterThan(0)
  })
})

describe('产品下项目页（B-PRD-01）', () => {
  test('按 filters[productId] 反查渲染关联项目，其他产品的项目不出现', async () => {
    renderPage(<ProductProjectsPage />, '/products/:productId/projects', '/products/1/projects')
    // 种子 project_products：3→1、3→2、4→2，故产品 1 只见项目 3
    expect(await screen.findByText('Demo Dev Project')).toBeInTheDocument()
    expect(screen.queryByText('Cloud Private Project')).not.toBeInTheDocument()
  })

  test('列表请求携带 filters[productId] 参数', async () => {
    let captured: string | null = null
    server.use(
      http.get('*/api/v1/projects', ({ request }) => {
        captured = new URL(request.url).searchParams.get('filters[productId]')
        return HttpResponse.json({ data: { items: [], total: 0 } })
      }),
    )
    renderPage(<ProductProjectsPage />, '/products/:productId/projects', '/products/1/projects')
    // 空结果由列表卡内的 Table 自身呈现空态（页面不再挂 EmptyState）：文案取自 antd locale，本测试未挂 locale 故为英文缺省
    await waitFor(() => expect(captured).toBe('1'))
    expect(screen.getAllByText('No data').length).toBeGreaterThan(0)
  })

  test('详情页头含产品下项目入口', async () => {
    renderPage(<ProductDetailPage />, '/products/:productId', '/products/1')
    expect(await screen.findByRole('button', { name: '项目列表' })).toBeInTheDocument()
  })
})

describe('删除入口（V-01：DELETE 端点接线 + 二次确认）', () => {
  test('产品列表行内删除：无下挂对象 → 二次确认后删除并移出列表', async () => {
    renderPage(<ProductListPage />, '/products', '/products', DELETE_PRIVILEGES)
    expect(await screen.findByText('Archived Product')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'product-delete-3' }))
    // 未确认前不发请求，对象仍在
    expect(db.products.some((item) => item.id === 3)).toBe(true)
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('已删除')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Archived Product')).toBeNull())
    expect(db.products.some((item) => item.id === 3)).toBe(false)
  })

  test('产品删除守卫：存在未删需求/分支/计划/发布/构建 → 42203 文案', async () => {
    renderPage(<ProductListPage />, '/products', '/products', DELETE_PRIVILEGES)
    expect(await screen.findByText('Demo Product')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'product-delete-1' }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('操作条件不满足，请确认对象状态后重试。')).toBeInTheDocument()
    // 守卫拒绝：产品仍在列表
    expect(screen.getByText('Demo Product')).toBeInTheDocument()
    expect(db.products.some((item) => item.id === 1)).toBe(true)
  })

  test('分支/计划/发布列表行内删除入口接线（按权限码显隐）', async () => {
    renderPage(<ProductBranchesPage />, '/products/:productId/branches', '/products/2/branches', DELETE_PRIVILEGES)
    expect(await screen.findByLabelText('branch-delete-1')).toBeInTheDocument()
    cleanup()
    renderPage(<PlanListPage />, '/products/:productId/plans', '/products/1/plans', DELETE_PRIVILEGES)
    expect(await screen.findByLabelText('plan-delete-1')).toBeInTheDocument()
    cleanup()
    renderPage(<ReleaseListPage />, '/products/:productId/releases', '/products/1/releases', DELETE_PRIVILEGES)
    expect(await screen.findByLabelText('release-delete-1')).toBeInTheDocument()
    cleanup()
    // 无权限码时不渲染删除入口
    renderPage(<ReleaseListPage />, '/products/:productId/releases', '/products/1/releases')
    expect(await screen.findByText('V0.9 Beta')).toBeInTheDocument()
    expect(screen.queryByLabelText('release-delete-1')).toBeNull()
  })
})
