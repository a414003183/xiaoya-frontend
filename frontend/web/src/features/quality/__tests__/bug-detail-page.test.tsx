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
import BugDetailPage from '../pages/bug-detail-page.page'

const pick = (elements: HTMLElement[], index = 0): HTMLElement => {
  const el = elements.at(index)
  if (!el) {
    throw new Error(`no matching element at ${index}`)
  }
  return el
}

/** Bug 详情页（A-02）：附件页签 + 编辑弹窗附件区按 objectType=bug 绑定。 */
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

// T02：file-upload = 附件上传控件（FileUploadField）的显隐码
const PRIVILEGES = ['bug-view', 'bug-edit', 'bug-delete', 'file-upload']

function renderPage(page: ReactElement, path: string, entry: string, privileges: string[] = PRIVILEGES): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={privileges}>
            <MemoryRouter initialEntries={[entry]}>
              <Routes>
                <Route path={path} element={page} />
                <Route path="/products/:productId/bugs" element={<div>bug-list-stub</div>} />
              </Routes>
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('Bug 详情页附件（A-02）', () => {
  // vitest5+jsdom30 无法经 MSW 走 multipart 真上传（File._buffer 缺失，见 platform file-upload-field.test）；
  // 页面级断言走列表侧：按 filters[objectType]=bug&filters[objectId] 只列本 Bug 附件即证明接线。
  beforeEach(() => {
    db.files.push(
      {
        id: 101,
        title: '复现步骤.txt',
        extension: 'txt',
        size: 5,
        objectType: 'bug',
        objectId: 1,
        downloads: 0,
        createdBy: 'admin',
        createdAt: '2026-09-18T00:00:00Z',
        deletedAt: null,
      },
      {
        id: 102,
        title: '别人的附件.txt',
        extension: 'txt',
        size: 5,
        objectType: 'story',
        objectId: 9,
        downloads: 0,
        createdBy: 'admin',
        createdAt: '2026-09-18T00:00:00Z',
        deletedAt: null,
      },
    )
  })

  test('附件页签按 objectType=bug 只列本 Bug 附件', async () => {
    renderPage(<BugDetailPage />, '/bugs/:bugId', '/bugs/1')
    expect(await screen.findByText('Login captcha not refreshing')).toBeInTheDocument()
    fireEvent.click(pick(screen.getAllByRole('tab'), 2)) // steps/activities/files
    expect(await screen.findByText('复现步骤.txt')).toBeInTheDocument()
    expect(screen.queryByText('别人的附件.txt')).not.toBeInTheDocument()
  })

  test('编辑弹窗带附件区（仅有 objectId 的编辑态）', async () => {
    renderPage(<BugDetailPage />, '/bugs/:bugId', '/bugs/1')
    expect(await screen.findByText('Login captcha not refreshing')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /编\s*辑/ }))
    expect(await screen.findByLabelText('选择文件')).toBeInTheDocument()
    expect(await screen.findByText('复现步骤.txt')).toBeInTheDocument()
  })
})

describe('Bug 删除入口（V-01 接线）', () => {
  test('无 bug-delete 码时详情页不渲染删除按钮', async () => {
    renderPage(<BugDetailPage />, '/bugs/:bugId', '/bugs/1', ['bug-view'])
    expect(await screen.findByText('Login captcha not refreshing')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /删\s*除/ })).not.toBeInTheDocument()
  })

  test('二次确认后软删并回 Bug 列表', async () => {
    renderPage(<BugDetailPage />, '/bugs/:bugId', '/bugs/1')
    expect(await screen.findByText('Login captcha not refreshing')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('已删除')).toBeInTheDocument()
    await waitFor(() => expect(db.bugs.some((item) => item.id === 1)).toBe(false))
    expect(await screen.findByText('bug-list-stub')).toBeInTheDocument()
  })
})
