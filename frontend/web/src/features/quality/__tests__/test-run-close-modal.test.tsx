import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import type { TestRunView } from '@zentao/api-client/generated/model/testRunView'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import { TestRunCloseModal } from '../components/test-run-close-modal'

/** 关单弹窗（T-9 / quality §4.3）：realFinishedAt 必填、≥ beginDate、≤ 次日 → 三种提示 + 合法提交。 */
initI18n()

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1 // admin：超管组，全权限码
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

const RUN: TestRunView = {
  id: 9001,
  productId: 1,
  projectId: 3,
  executionId: 5,
  buildId: 0,
  name: '迭代一回归',
  owner: 'dev1',
  priority: 2,
  type: 'integrate',
  beginDate: '2026-09-10',
  endDate: '2026-09-20',
  realBeganAt: '2026-09-10T08:00:00Z',
  realFinishedAt: null,
  description: null,
  members: [],
  notifyAccounts: [],
  status: 'doing',
  reportId: null,
  customFields: {},
  createdBy: 'admin',
  createdAt: '2026-09-01T00:00:00Z',
  updatedBy: null,
  updatedAt: null,
  lockVersion: 0,
}

function renderModal(): void {
  db.testRuns.push({ ...RUN })
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter>
            <TestRunCloseModal testRun={{ ...RUN }} open onClose={() => {}} />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

/** 填入实际结束日期并提交。 */
function submitWith(value: string): void {
  fireEvent.change(screen.getByLabelText('test-run-real-finished'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: /提\s*交/ }))
}

describe('TestRunCloseModal 日期守卫', () => {
  test('缺 realFinishedAt → 必填提示', async () => {
    renderModal()
    submitWith('')
    expect(await screen.findByText('请填写实际结束时间。')).toBeInTheDocument()
  })

  test('早于 beginDate → 不得早于开始日期', async () => {
    renderModal()
    submitWith('2026-09-01')
    expect(await screen.findByText('实际结束时间不得早于开始日期。')).toBeInTheDocument()
  })

  test('晚于 endDate 次日 → 不得晚于结束日期的次日', async () => {
    renderModal()
    submitWith('2026-09-22')
    expect(await screen.findByText('实际结束时间不得晚于结束日期的次日。')).toBeInTheDocument()
  })

  test('endDate 次日为边界内最后一天 → 关单落 done', async () => {
    renderModal()
    submitWith('2026-09-21')
    await waitFor(() => {
      expect(db.testRuns.find((item) => item.id === 9001)?.status).toBe('done')
    })
  })

  test('合法日期（beginDate 当日）→ 关单落 done 且 realFinishedAt 落库', async () => {
    renderModal()
    submitWith('2026-09-10')
    await waitFor(() => {
      const saved = db.testRuns.find((item) => item.id === 9001)
      expect(saved?.status).toBe('done')
      expect(saved?.realFinishedAt).toBe('2026-09-10T00:00:00Z')
    })
  })
})
