import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import { linkTestRunCasesAction, runTestRunAction, submitTestRun } from '../api/quality.api'
import TestRunCasesPage from '../pages/test-run-cases-page.page'

// 并行负载下 MSW+antd 偶发超 1s：本文件 waitFor 放宽到 8s（既有偶发红，隔离跑绿）
configure({ asyncUtilTimeout: 8000 })

/** 执行用例页（T-9 / quality §4.3 record-result：登记后行内即时刷新 + 幂等 upsert 同行 + 用例 lastRun 同步）。 */
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

const PRIVILEGES = ['testrun-view', 'testrun-link-case', 'testrun-record-result', 'testrun-assign-case']

/** 建单 → 关联用例 1 → start（doing 才可登记结果，§4.3）。 */
async function seedDoingRun(): Promise<number> {
  const testRun = await submitTestRun(1, {
    executionId: 5,
    name: '迭代一回归',
    priority: 2,
    beginDate: '2026-09-01',
    endDate: '2026-09-30',
  })
  await linkTestRunCasesAction(testRun.id, { caseIds: [1] })
  await runTestRunAction(testRun.id, 'start')
  return testRun.id
}

function renderPage(testRunId: number): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={PRIVILEGES}>
            <MemoryRouter initialEntries={[`/test-runs/${testRunId}/cases`]}>
              <Routes>
                <Route path="/test-runs/:testRunId/cases" element={<TestRunCasesPage />} />
              </Routes>
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

/** 当前用例行文本（重查行元素，避免表格重渲染后引用失效）。 */
function runRowText(): string {
  return screen.getByText('Login success main flow').closest('tr')?.textContent ?? ''
}

describe('执行用例页', () => {
  test('登记结果：行内结果即时刷新、lastRun 同步、重复登记同一行不新增', async () => {
    const user = userEvent.setup()
    const testRunId = await seedDoingRun()
    renderPage(testRunId)

    await screen.findByText('Login success main flow')
    expect(runRowText()).toContain('未执行')

    // 第一次登记 fail（antd Radio 的 input 为 pointer-events:none，用 fireEvent 触发）
    await user.click(screen.getByRole('button', { name: /登记结果/ }))
    fireEvent.click(await screen.findByLabelText('run-result-fail'))
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))

    await waitFor(() => {
      expect(runRowText()).toContain('失败')
    })
    const testCase = db.testCases.find((item) => item.id === 1)
    expect(testCase?.lastRunResult).toBe('fail')
    expect(testCase?.lastRunner).toBe('admin')
    expect(testCase?.lastRunAt).toBeTruthy()

    // 第二次登记 pass：同 (testRun, case) 覆写同行，行数不变
    await user.click(screen.getByRole('button', { name: /登记结果/ }))
    fireEvent.click(await screen.findByLabelText('run-result-pass'))
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))

    await waitFor(() => {
      expect(runRowText()).toContain('通过')
    })
    expect(db.testRunCases.filter((item) => item.testRunId === testRunId)).toHaveLength(1)
    expect(db.testRunCases[0]?.result).toBe('pass')
    expect(db.testCases.find((item) => item.id === 1)?.lastRunResult).toBe('pass')
  })

  test('指派执行人：就地改派后行内执行人更新', async () => {
    const user = userEvent.setup()
    const testRunId = await seedDoingRun()
    renderPage(testRunId)
    await screen.findByText('Login success main flow')

    await user.click(screen.getByRole('button', { name: /指派执行人/ }))
    await user.click(await screen.findByLabelText('run-assignee'))
    await user.click(await screen.findByText('Dev One（dev1）'))
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))

    await waitFor(() => {
      expect(db.testRunCases[0]?.assignee).toBe('dev1')
    })
    expect(runRowText()).toContain('dev1')
  })
})
