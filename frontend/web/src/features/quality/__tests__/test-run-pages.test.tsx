import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import {
  linkTestRunCasesAction,
  recordRunResult,
  runTestRunAction,
  submitReport,
  submitTestRun,
} from '../api/quality.api'
import ReportDetailPage from '../pages/report-detail-page.page'
import TestRunDetailPage from '../pages/test-run-detail-page.page'

/** 测试单/报告详情页冒烟（T-9/T-10）：meta 动作区随状态显隐、执行统计由 runs 现算、报告正文原样渲染。 */
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

const PRIVILEGES = [
  'testrun-view',
  'testrun-start',
  'testrun-block',
  'testrun-activate',
  'testrun-close',
  'testrun-edit',
  'testrun-link-case',
  'testrun-record-result',
  'testrun-delete',
  'report-view',
  'report-edit',
  'report-delete',
]

function renderRoute(path: string, entry: string, element: React.ReactElement): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={PRIVILEGES}>
            <MemoryRouter initialEntries={[entry]}>
              <Routes>
                <Route path={path} element={element} />
              </Routes>
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('测试单详情页', () => {
  test('执行统计由 runs 现算，doing 状态只出阻塞/关闭/编辑', async () => {
    const testRun = await submitTestRun(1, {
      executionId: 5,
      name: '迭代一回归',
      priority: 2,
      beginDate: '2026-09-10',
      endDate: '2026-09-20',
    })
    await linkTestRunCasesAction(testRun.id, { caseIds: [1, 2] })
    await runTestRunAction(testRun.id, 'start')
    await recordRunResult(testRun.id, 1, { result: 'pass' })
    await recordRunResult(testRun.id, 2, { result: 'fail' })

    renderRoute('/test-runs/:testRunId', `/test-runs/${testRun.id}`, <TestRunDetailPage />)

    expect(await screen.findByText('迭代一回归')).toBeInTheDocument()
    // 统计：通过 1 / 失败 1 / 阻塞 0 / 忽略 0 / 未执行 0（§6 无独立统计端点）
    expect(screen.getByText('通过 1')).toBeInTheDocument()
    expect(screen.getByText('失败 1')).toBeInTheDocument()
    expect(screen.getByText('忽略 0')).toBeInTheDocument()
    expect(screen.getByText('未执行 0')).toBeInTheDocument()
    // meta actions × allowedStatus：doing → block/close/edit；start 仅 wait 不出现
    expect(screen.getByRole('button', { name: /阻\s*塞/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /关\s*闭/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /开\s*始/ })).not.toBeInTheDocument()
  })
})

describe('报告详情页', () => {
  test('正文按不透明文本渲染，关联测试单出链接列表', async () => {
    const testRun = await submitTestRun(1, {
      executionId: 5,
      name: '迭代一回归',
      priority: 2,
      beginDate: '2026-09-10',
      endDate: '2026-09-20',
    })
    const report = await submitReport(5, {
      title: '迭代一测试报告',
      testRunIds: [testRun.id],
      beginDate: '2026-09-10',
      endDate: '2026-09-20',
      content: '# 结论\n本轮通过率 100%',
    })

    renderRoute('/reports/:reportId', `/reports/${report.id}`, <ReportDetailPage />)

    expect(await screen.findByText('迭代一测试报告')).toBeInTheDocument()
    // content 为不透明文本（§3.6）：原样渲染 Markdown 原文，不做解析
    expect(screen.getAllByText(/本轮通过率 100%/).length).toBeGreaterThan(0)
    expect(db.testRuns.find((item) => item.id === testRun.id)?.reportId).toBe(report.id)
  })
})

describe('测试单/报告删除入口（V-01 接线）', () => {
  test('测试单二次确认后删除，执行清单行连带失效', async () => {
    const testRun = await submitTestRun(1, {
      executionId: 5,
      name: '待删测试单',
      priority: 3,
      beginDate: '2026-09-10',
      endDate: '2026-09-20',
    })
    await linkTestRunCasesAction(testRun.id, { caseIds: [1] })

    renderRoute('/test-runs/:testRunId', `/test-runs/${testRun.id}`, <TestRunDetailPage />)

    expect(await screen.findByText('待删测试单')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('已删除')).toBeInTheDocument()
    expect(db.testRuns.some((item) => item.id === testRun.id)).toBe(false)
    expect(db.testRunCases.some((item) => item.testRunId === testRun.id)).toBe(false)
  })

  test('报告二次确认后删除，关联测试单 reportId 清空', async () => {
    const testRun = await submitTestRun(1, {
      executionId: 5,
      name: '带报告测试单',
      priority: 3,
      beginDate: '2026-09-10',
      endDate: '2026-09-20',
    })
    const report = await submitReport(5, {
      title: '待删测试报告',
      testRunIds: [testRun.id],
      beginDate: '2026-09-10',
      endDate: '2026-09-20',
    })
    expect(db.testRuns.find((item) => item.id === testRun.id)?.reportId).toBe(report.id)

    renderRoute('/reports/:reportId', `/reports/${report.id}`, <ReportDetailPage />)

    expect(await screen.findByText('待删测试报告')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('已删除')).toBeInTheDocument()
    expect(db.reports.some((item) => item.id === report.id)).toBe(false)
    expect(db.testRuns.find((item) => item.id === testRun.id)?.reportId).toBeNull()
  })
})
