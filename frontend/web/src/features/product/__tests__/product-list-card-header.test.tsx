import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import PlanListPage from '../pages/plan-list-page.page'
import ProductCategoriesPage from '../pages/product-categories-page.page'

/**
 * ListCardHeader 两页接入（T72 / AUDIT FE-12）：plan 看板视图与分类树页的手写卡头收敛到
 * design-system 标准件后，「左功能按钮 / 右工具栏」的行为不变（渲染断言即接入看护）。
 */
initI18n()

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => server.close())

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

describe('ListCardHeader 接入（FE-12）', () => {
  test('计划看板视图卡头：功能按钮 + 视图切换同在标准件一行', async () => {
    renderPage(<PlanListPage />, '/products/:productId/plans', '/products/1/plans?view=board')
    // 卡头左：主操作；右：列表/看板切换（原手写 Flex 行的两组内容，现走 ListCardHeader）
    expect(await screen.findByRole('button', { name: /^新\s*建计\s*划$/ })).toBeInTheDocument()
    expect(screen.getByText('列表')).toBeInTheDocument()
    expect(screen.getByText('看板')).toBeInTheDocument()
    // 看板视图的列卡照常渲染（V1.0 Release Plan 在「进行中」列）
    expect(await screen.findByText('V1.0 Release Plan')).toBeInTheDocument()
    expect(screen.getByText('进行中')).toBeInTheDocument()
  })

  test('分类树页卡头：新建分类按钮在卡头（左组单按钮形态）', async () => {
    renderPage(<ProductCategoriesPage />, '/products/:productId/categories', '/products/1/categories', [
      'product-view',
      'category-manage',
    ])
    expect(await screen.findByRole('button', { name: '新建分类' })).toBeInTheDocument()
    // 树节点照常渲染
    expect((await screen.findAllByText('User Center')).length).toBeGreaterThan(0)
  })
})
