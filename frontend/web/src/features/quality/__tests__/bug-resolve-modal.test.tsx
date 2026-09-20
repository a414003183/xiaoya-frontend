import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import type { BugView } from '@zentao/api-client/generated/model/bugView'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import { BugResolveModal } from '../components/bug-resolve-modal'

/** Bug 解决弹窗联动必填矩阵（T-3 / quality §4.1）。 */
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

const bug: BugView = {
  id: 1,
  productId: 1,
  title: '登录页验证码不刷新',
  severity: 2,
  priority: 2,
  type: 'codeerror',
  status: 'active',
  confirmed: false,
  activatedCount: 0,
  assignee: 'dev1',
  relatedBugIds: [],
  notifyAccounts: [],
  createdBy: 'admin',
  createdAt: '2026-09-01T08:00:00Z',
  lockVersion: 0,
}

function renderModal(ui: ReactElement): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter>{ui}</MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('BugResolveModal 联动必填矩阵', () => {
  test('默认 fixed：解决版本必填为空时提交禁用，填写后可提交', async () => {
    renderModal(<BugResolveModal bug={bug} open onClose={() => {}} />)
    expect(await screen.findByLabelText('bug-resolved-build')).toBeInTheDocument()
    expect(screen.queryByLabelText('bug-duplicate-of')).not.toBeInTheDocument()
    const submit = screen.getByRole('button', { name: /提\s*交/ })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText('bug-resolved-build'), { target: { value: 'build-20260901' } })
    expect(submit).toBeEnabled()
  })

  test('切到 duplicate：解决版本隐藏、重复 Bug 必填，提交禁用直至选择', async () => {
    renderModal(<BugResolveModal bug={bug} open onClose={() => {}} />)
    fireEvent.click(await screen.findByText('重复 Bug'))
    expect(screen.queryByLabelText('bug-resolved-build')).not.toBeInTheDocument()
    expect(screen.getByLabelText('bug-duplicate-of')).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: /提\s*交/ })
    expect(submit).toBeDisabled()
    // 重复 Bug 候选来自同产品列表（种子 #2/#3/#4），排除自身 #1
    fireEvent.mouseDown(screen.getByLabelText('bug-duplicate-of'))
    const option = await screen.findByText('#3 Homepage carousel occasionally blank', {}, { timeout: 3000 })
    fireEvent.click(option)
    expect(submit).toBeEnabled()
  })

  test('切到 tostory：两个联动字段都不出现，提交直接可用', async () => {
    renderModal(<BugResolveModal bug={bug} open onClose={() => {}} />)
    fireEvent.click(await screen.findByText('转为需求'))
    expect(screen.queryByLabelText('bug-resolved-build')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('bug-duplicate-of')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /提\s*交/ })).toBeEnabled()
  })
})
