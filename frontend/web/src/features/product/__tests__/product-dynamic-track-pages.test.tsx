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
import ProductDynamicPage from '../pages/product-dynamic-page.page'
import ProductTrackPage from '../pages/product-track-page.page'

/**
 * 产品动态流 + 需求×发布跟踪（T72 / AUDIT FE-13：0 覆盖页面补渲染/交互断言）。
 */
initI18n()

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1
  // 产品动态种子一条（活动流按 objectType=product 过滤）
  db.activities.push({
    id: 9900,
    objectType: 'product',
    objectId: 1,
    actor: 'admin',
    action: 'created',
    detail: null,
    remark: '产品立项动态',
    occurredAt: '2026-09-01T00:00:00Z',
  })
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => server.close())

function renderPage(page: ReactElement, path: string, entry: string): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={['product-view']}>
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

describe('产品动态流页（FE-13）', () => {
  test('渲染产品动态：页头 + 动态条目', async () => {
    renderPage(<ProductDynamicPage />, '/products/:productId/dynamic', '/products/1/dynamic')
    expect(await screen.findByText('产品动态')).toBeInTheDocument()
    expect(await screen.findByText('产品立项动态')).toBeInTheDocument()
    expect((await screen.findAllByText('admin')).length).toBeGreaterThan(0)
  })
})

describe('需求发布跟踪页（FE-13）', () => {
  test('矩阵渲染：需求行 × 发布列，关联格显「已关联」', async () => {
    renderPage(<ProductTrackPage />, '/products/:productId/track', '/products/1/track')
    // 列：需求 + 两个发布（V0.9 Beta / V1.0 Stable）
    expect((await screen.findAllByText('需求')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('V0.9 Beta')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('V1.0 Stable').length).toBeGreaterThan(0)
    // 行：产品需求；story 4 被 V0.9 Beta 关联（release.storyIds=[4]）→ 有「已关联」格
    expect((await screen.findAllByText('Refactor login module')).length).toBeGreaterThan(0)
    expect(await screen.findByText('已关联')).toBeInTheDocument()
  })
})
