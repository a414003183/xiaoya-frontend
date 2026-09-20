import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import { submitLibrary, submitLibraryCase } from '../api/quality.api'
import LibraryDetailPage from '../pages/library-detail-page.page'

/** 用例库详情页（B-QUA-09）：库用例行内编辑入口复用 test-case-edit-modal（productId=0 走 libraryCase 分支）。 */
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

const PRIVILEGES = ['library-view', 'library-edit', 'testcase-edit', 'library-delete', 'testcase-delete']

function renderPage(page: ReactElement, path: string, entry: string, privileges: string[] = PRIVILEGES): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={privileges}>
            <MemoryRouter initialEntries={[entry]}>
              <Routes>
                <Route path={path} element={page} />
                <Route path="/libraries" element={<div>library-list-stub</div>} />
              </Routes>
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('用例库详情页', () => {
  test('库用例行内编辑：走 test-case-edit-modal（无产品维度字段）保存后列表刷新（B-QUA-09）', async () => {
    const library = await submitLibrary({ name: '公共用例库' })
    const libCase = await submitLibraryCase(library.id, { title: '库用例·登录冒烟', priority: 2, type: 'feature' })

    renderPage(<LibraryDetailPage />, '/libraries/:libraryId', `/libraries/${library.id}`)
    expect(await screen.findByText('库用例·登录冒烟')).toBeInTheDocument()
    // 行内编辑入口（PATCH /test-cases/{id} 免产品 ACL，quality §7）
    fireEvent.click(screen.getByLabelText(`library-case-edit-${libCase.id}`))
    const titleInput = await screen.findByLabelText('case-title')
    expect(titleInput).toHaveValue('库用例·登录冒烟')
    // libraryCase 分支：产品维度字段（分支/分类/需求）不渲染
    expect(screen.queryByLabelText('case-branch')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('case-story')).not.toBeInTheDocument()
    fireEvent.change(titleInput, { target: { value: '库用例·登录冒烟（修订）' } })
    fireEvent.click(screen.getByRole('button', { name: /提\s*交/ }))
    // 保存后 invalidate listLibraryCases，表格行刷新为新标题
    expect(await screen.findByText('库用例·登录冒烟（修订）')).toBeInTheDocument()
    const saved = db.testCases.find((item) => item.id === libCase.id)
    expect(saved?.title).toBe('库用例·登录冒烟（修订）')
    expect(saved?.lockVersion).toBe(1)
  })
})

describe('用例库删除入口（V-01 接线）', () => {
  test('库内有未删用例 → 42203 守卫文案，库保留', async () => {
    const library = await submitLibrary({ name: '有内容的库' })
    await submitLibraryCase(library.id, { title: '库用例·守卫', priority: 2, type: 'feature' })

    renderPage(<LibraryDetailPage />, '/libraries/:libraryId', `/libraries/${library.id}`)
    expect(await screen.findByText('库用例·守卫')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('操作条件不满足，请确认对象状态后重试。')).toBeInTheDocument()
    expect(db.suites.some((item) => item.id === library.id)).toBe(true)
  })

  test('空库二次确认后删除并回库列表', async () => {
    const library = await submitLibrary({ name: '待删空库' })

    renderPage(<LibraryDetailPage />, '/libraries/:libraryId', `/libraries/${library.id}`)
    expect(await screen.findByText('待删空库')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('已删除')).toBeInTheDocument()
    await waitFor(() => expect(db.suites.some((item) => item.id === library.id)).toBe(false))
    expect(await screen.findByText('library-list-stub')).toBeInTheDocument()
  })
})
