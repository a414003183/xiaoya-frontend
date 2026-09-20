import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import type { TestCaseView } from '@zentao/api-client/generated/model/testCaseView'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import { TestCaseReviewModal } from '../components/test-case-review-modal'

/** 用例评审弹窗（T-5 / quality §4.2：pass 进 normal、clarify 保持 wait）。 */
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

const waitCase: TestCaseView = {
  id: 2,
  productId: 1,
  branchId: 0,
  libraryId: 0,
  title: '密码错误锁定（待评审）',
  priority: 2,
  type: 'feature',
  stage: ['feature'],
  status: 'wait',
  steps: [{ sort: 1, description: '连续输错密码 6 次', expects: '账号锁定 10 分钟' }],
  reviewers: [],
  version: 1,
  createdBy: 'dev1',
  createdAt: '2026-09-05T08:00:00Z',
  lockVersion: 0,
}

function renderModal(): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter>
            <TestCaseReviewModal testCase={waitCase} open onClose={() => {}} />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('TestCaseReviewModal', () => {
  test('pass：评审通过后用例进 normal 且 reviewers 追加当前人', async () => {
    renderModal()
    expect(screen.getByText('评审通过')).toBeInTheDocument()
    expect(screen.getByText('继续澄清')).toBeInTheDocument()
    expect(screen.getByLabelText('case-review-comment')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      const item = db.testCases.find((candidate) => candidate.id === 2)
      expect(item?.status).toBe('normal')
      expect(item?.reviewers).toContain('admin')
      expect(item?.reviewedAt).not.toBeNull()
    })
  })

  test('clarify：继续澄清保持 wait、reviewers 不追加', async () => {
    renderModal()
    fireEvent.click(screen.getByText('继续澄清'))
    fireEvent.change(screen.getByLabelText('case-review-comment'), { target: { value: '请补充前置条件' } })
    fireEvent.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      const item = db.testCases.find((candidate) => candidate.id === 2)
      expect(item?.status).toBe('wait')
      expect(item?.reviewers ?? []).not.toContain('admin')
    })
  })
})
