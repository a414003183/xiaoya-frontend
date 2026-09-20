import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import { submitBatchTestCases } from '../api/quality.api'
import TestCaseBatchEditPage from '../pages/test-case-batch-edit-page.page'

/** 用例批量编辑页（T-5 / A-03）：按 ids 载入行、edit 提交 params.rows 逐行乐观锁。 */
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

function renderPage(page: ReactElement, path: string, entry: string): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path={path} element={page} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('用例批量编辑页', () => {
  test('无 ids 时提示先勾选', async () => {
    renderPage(<TestCaseBatchEditPage />, '/test-cases/batch-edit', '/test-cases/batch-edit')
    expect(await screen.findByText('请先在列表勾选用例。')).toBeInTheDocument()
  })

  test('批量编辑提交 params.rows：仅改动行带 id+lockVersion+变更字段（A-03）', async () => {
    let captured: { ids: number[]; action: string; params?: { rows?: unknown[] } } | null = null
    server.use(
      http.post('*/api/v1/test-cases/batch', async ({ request }) => {
        captured = (await request.json()) as { ids: number[]; action: string; params?: { rows?: unknown[] } }
        return HttpResponse.json({ data: { results: [{ id: 1, ok: true, error: null }] } })
      }),
    )
    renderPage(<TestCaseBatchEditPage />, '/test-cases/batch-edit', '/test-cases/batch-edit?productId=1&ids=1,2')
    expect(await screen.findByLabelText('case-title-1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /保\s*存/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('case-title-1'), { target: { value: '登录成功冒烟主链路' } })
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(captured).not.toBeNull())
    const body = captured as { ids: number[]; action: string; params?: { rows?: unknown[] } } | null
    expect(body?.action).toBe('edit')
    expect(body?.ids).toEqual([1])
    expect(body?.params?.rows).toEqual([{ id: 1, lockVersion: 0, title: '登录成功冒烟主链路' }])
  })

  test('批量 edit 逐行乐观锁：行缺 lockVersion → 该行 40901，版本相符才应用', async () => {
    const missing = await submitBatchTestCases({
      ids: [1],
      action: 'edit',
      params: { rows: [{ id: 1, title: '缺版本' }] },
    })
    expect(missing.results[0]).toEqual({ id: 1, ok: false, error: '40901' })
    const applied = await submitBatchTestCases({
      ids: [1],
      action: 'edit',
      params: { rows: [{ id: 1, lockVersion: 0, priority: 4 }] },
    })
    expect(applied.results[0]?.ok).toBe(true)
    const item = db.testCases.find((entry) => entry.id === 1)
    expect(item?.priority).toBe(4)
    expect(item?.lockVersion).toBe(1)
  })
})
