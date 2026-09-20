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
import { submitBatchBugs } from '../api/quality.api'
import BugBatchEditPage from '../pages/bug-batch-edit-page.page'

/** Bug 批量编辑页（T-3 / A-03）：按 ids 载入行、行内编辑、批量指派逐项结果、edit 提交 rows 逐行乐观锁。 */
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

describe('Bug 批量编辑页', () => {
  test('无 ids 时提示先勾选', async () => {
    renderPage(<BugBatchEditPage />, '/bugs/batch-edit', '/bugs/batch-edit')
    expect(await screen.findByText('请先在列表勾选 Bug。')).toBeInTheDocument()
  })

  test('按 ids 载入行并可批量指派出逐项结果', async () => {
    renderPage(<BugBatchEditPage />, '/bugs/batch-edit', '/bugs/batch-edit?productId=1&ids=1,2')
    expect(await screen.findByLabelText('bug-title-1')).toBeInTheDocument()
    expect(screen.getByLabelText('bug-title-2')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Login captcha not refreshing')).toBeInTheDocument()
    // 行内编辑标题
    fireEvent.change(screen.getByLabelText('bug-title-1'), { target: { value: '验证码点击无响应' } })
    expect(screen.getByLabelText('bug-title-1')).toHaveValue('验证码点击无响应')
    // 批量指派：选择 dev1 后提交
    fireEvent.mouseDown(screen.getByLabelText('batch-assignee'))
    const option = await screen.findByText('Dev One(dev1)', {}, { timeout: 3000 })
    fireEvent.click(option)
    fireEvent.click(screen.getByRole('button', { name: /指\s*派/ }))
    expect(await screen.findAllByText('ok')).toHaveLength(2)
    const bugAfter = db.bugs.find((item) => item.id === 1)
    expect(bugAfter?.assignee).toBe('dev1')
    expect(bugAfter?.assignedAt).not.toBeNull()
  })

  test('批量确认只对未确认的行成功', async () => {
    renderPage(<BugBatchEditPage />, '/bugs/batch-edit', '/bugs/batch-edit?productId=1&ids=1,2')
    expect(await screen.findByLabelText('bug-title-1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /确\s*认/ }))
    expect(await screen.findByText('ok')).toBeInTheDocument()
    expect(await screen.findByText('42202')).toBeInTheDocument()
    expect(db.bugs.find((item) => item.id === 1)?.confirmed).toBe(true)
  })

  test('批量编辑提交 params.rows：仅改动行带 id+lockVersion+变更字段（A-03）', async () => {
    let captured: { ids: number[]; action: string; params?: { rows?: unknown[] } } | null = null
    server.use(
      http.post('*/api/v1/bugs/batch', async ({ request }) => {
        captured = (await request.json()) as { ids: number[]; action: string; params?: { rows?: unknown[] } }
        return HttpResponse.json({ data: { results: [{ id: 1, ok: true, error: null }] } })
      }),
    )
    renderPage(<BugBatchEditPage />, '/bugs/batch-edit', '/bugs/batch-edit?productId=1&ids=1,2')
    expect(await screen.findByLabelText('bug-title-1')).toBeInTheDocument()
    // 未改动时保存禁用
    expect(screen.getByRole('button', { name: /保\s*存/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('bug-title-1'), { target: { value: '验证码点击无响应' } })
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(captured).not.toBeNull())
    const body = captured as { ids: number[]; action: string; params?: { rows?: unknown[] } } | null
    expect(body?.action).toBe('edit')
    expect(body?.ids).toEqual([1])
    expect(body?.params?.rows).toEqual([{ id: 1, lockVersion: 0, title: '验证码点击无响应' }])
  })

  test('批量 edit 逐行乐观锁：行缺 lockVersion 或版本不符 → 该行 40901', async () => {
    const missing = await submitBatchBugs({ ids: [1], action: 'edit', params: { rows: [{ id: 1, title: '缺版本' }] } })
    expect(missing.results[0]).toEqual({ id: 1, ok: false, error: '40901' })
    const stale = await submitBatchBugs({
      ids: [1],
      action: 'edit',
      params: { rows: [{ id: 1, lockVersion: 9, title: '旧版本' }] },
    })
    expect(stale.results[0]?.ok).toBe(false)
    expect(stale.results[0]?.error).toBe('40901')
    const applied = await submitBatchBugs({
      ids: [1],
      action: 'edit',
      params: { rows: [{ id: 1, lockVersion: 0, severity: 1, priority: 1 }] },
    })
    expect(applied.results[0]?.ok).toBe(true)
    const bug = db.bugs.find((item) => item.id === 1)
    expect(bug?.severity).toBe(1)
    expect(bug?.priority).toBe(1)
    expect(bug?.lockVersion).toBe(1)
  })
})
