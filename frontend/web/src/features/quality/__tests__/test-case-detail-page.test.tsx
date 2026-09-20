import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import TestCaseDetailPage from '../pages/test-case-detail-page.page'

// 并行负载下 MSW+antd 偶发超 1s：本文件 waitFor 放宽到 8s（隔离跑绿）
configure({ asyncUtilTimeout: 8000 })

const pick = (elements: HTMLElement[], index = 0): HTMLElement => {
  const el = elements.at(index)
  if (!el) {
    throw new Error(`no matching element at ${index}`)
  }
  return el
}

/** 用例详情页（B-QUA-02 提 Bug 入口 + A-02 附件页签）。 */
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

const PRIVILEGES = ['testcase-view', 'testcase-edit', 'bug-create']

function renderPage(page: ReactElement, path: string, entry: string): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={PRIVILEGES}>
            <MemoryRouter initialEntries={[entry]}>
              <Routes>
                <Route path={path} element={page} />
                <Route path="/bugs/:bugId" element={<div>bug-detail-stub</div>} />
              </Routes>
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('用例详情页', () => {
  test('从本用例提 Bug：预填 testCaseId 创建并跳转 Bug 详情（B-QUA-02）', async () => {
    renderPage(<TestCaseDetailPage />, '/test-cases/:caseId', '/test-cases/1')
    expect(await screen.findByText('Login success main flow')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('case-report-bug'))
    // 弹窗打开：预填关联用例 #1
    expect(await screen.findByLabelText('bug-test-case-prefill')).toHaveTextContent('#1')
    fireEvent.change(screen.getByLabelText('bug-title'), { target: { value: '登录页冒烟失败' } })
    fireEvent.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => expect(screen.getByText('bug-detail-stub')).toBeInTheDocument())
    const created = db.bugs.find((bug) => bug.title === '登录页冒烟失败')
    expect(created?.testCaseId).toBe(1)
  })

  test('附件页签按 objectType=testCase 只列本用例附件（A-02）', async () => {
    // vitest5+jsdom30 无法经 MSW 走 multipart 真上传（见 platform file-upload-field.test），列表侧断言接线
    db.files.push(
      {
        id: 201,
        title: '用例截图.png',
        extension: 'png',
        size: 5,
        objectType: 'testCase',
        objectId: 1,
        downloads: 0,
        createdBy: 'admin',
        createdAt: '2026-09-18T00:00:00Z',
        deletedAt: null,
      },
      {
        id: 202,
        title: '别人的附件.txt',
        extension: 'txt',
        size: 5,
        objectType: 'bug',
        objectId: 1,
        downloads: 0,
        createdBy: 'admin',
        createdAt: '2026-09-18T00:00:00Z',
        deletedAt: null,
      },
    )
    renderPage(<TestCaseDetailPage />, '/test-cases/:caseId', '/test-cases/1')
    expect(await screen.findByText('Login success main flow')).toBeInTheDocument()
    fireEvent.click(pick(screen.getAllByRole('tab'), 2)) // steps/activities/files
    expect(await screen.findByText('用例截图.png')).toBeInTheDocument()
    expect(screen.queryByText('别人的附件.txt')).not.toBeInTheDocument()
  })
})
