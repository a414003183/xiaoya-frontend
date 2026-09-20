import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import ReportBugDistributionPage from '../pages/report-bug-distribution-page.page'
import ReportBurnPage from '../pages/report-burn-page.page'
import ReportCasePassRatePage from '../pages/report-case-pass-rate-page.page'
import ReportStorySummaryPage from '../pages/report-story-summary-page.page'
import WeeklyReportPage from '../pages/weekly-report-page.page'

/** T-12 报表页：EVM/analysis 逐行渲染、周导航 ?date=、图表宿主与通过率空分母呈现。 */
initI18n()

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1 // admin：全部权限码
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

describe('项目周报页', () => {
  const WEEK = '/projects/3/weekly-report?date=2026-02-05'

  test('EVM 数字区 + analysis 逐行纯文本 + 三张任务表', async () => {
    renderPage(<WeeklyReportPage />, '/projects/:projectId/weekly-report', WEEK)
    // date 归一到当周周一..周日（服务端口径）
    expect(await screen.findByText('2026-02-02 ~ 2026-02-08')).toBeInTheDocument()
    expect(screen.getByText('计划工时 PV')).toBeInTheDocument()
    expect(screen.getByText('挣值工时 EV')).toBeInTheDocument()
    expect(screen.getByText('进度偏差 SV')).toBeInTheDocument()
    // analysis 纯文本按行渲染（不注入 HTML）
    expect(await screen.findByText(/进度偏差 -?\d.*成本偏差/)).toBeInTheDocument()
    // 三张任务表：本周完成 = task 3(02-05)/task 7(02-06)；本周无延期、下周无计划任务
    expect(await screen.findByText('Captcha API implementation')).toBeInTheDocument()
    expect(screen.getByText('API auth review')).toBeInTheDocument()
    // 行数不再挂卡标题（计数随分页由 ListCard 统一注入），标题即区块名
    expect(screen.getByText('本周完成任务')).toBeInTheDocument()
    expect(screen.getByText('本周未完成任务')).toBeInTheDocument()
    expect(screen.getByText('下周计划任务')).toBeInTheDocument()
  })

  test('周导航通过 ?date= 前后平移一周', async () => {
    renderPage(<WeeklyReportPage />, '/projects/:projectId/weekly-report', WEEK)
    await screen.findByText('2026-02-02 ~ 2026-02-08')
    fireEvent.click(screen.getByLabelText('weekly-prev'))
    await waitFor(() => {
      expect(screen.getByText('2026-01-26 ~ 2026-02-01')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByLabelText('weekly-next'))
    await waitFor(() => {
      expect(screen.getByText('2026-02-02 ~ 2026-02-08')).toBeInTheDocument()
    })
  })
})

describe('固定报表页', () => {
  test('燃尽页渲染 ideal/remaining 折线（图表宿主 + 起止日）', async () => {
    renderPage(<ReportBurnPage />, '/executions/:executionId/reports/burn', '/executions/5/reports/burn')
    // 起止日期同时出现在 Descriptions 与图表轴标签（SVG）中
    expect((await screen.findAllByText('2026-02-01')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('2026-02-14').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: '燃尽图' })).toBeInTheDocument()
  })

  test('需求统计页四组分布图', async () => {
    renderPage(
      <ReportStorySummaryPage />,
      '/products/:productId/reports/story-summary',
      '/products/1/reports/story-summary',
    )
    expect(await screen.findByText(/合计/)).toBeInTheDocument()
    for (const group of ['状态', '优先级', '阶段', '类型']) {
      expect(screen.getByRole('img', { name: group })).toBeInTheDocument()
    }
  })

  test('Bug 分布页三组分布图', async () => {
    renderPage(
      <ReportBugDistributionPage />,
      '/products/:productId/reports/bug-distribution',
      '/products/1/reports/bug-distribution',
    )
    expect(await screen.findByText(/合计/)).toBeInTheDocument()
    for (const group of ['严重度', '状态', '解决方案']) {
      expect(screen.getByRole('img', { name: group })).toBeInTheDocument()
    }
  })
})

describe('用例通过率页', () => {
  function seedRun(id: number, results: ('pass' | 'fail' | 'blocked' | 'n/a')[]): void {
    db.testRuns.push({
      id,
      productId: 1,
      executionId: 5,
      name: `通过率用例单-${id}`,
      priority: 3,
      beginDate: '2026-02-01',
      endDate: '2026-02-28',
      status: 'doing',
      lockVersion: 0,
    })
    results.forEach((result, index) => {
      db.testRunCases.push({ id: id * 100 + index, testRunId: id, testCaseId: index + 1, version: 1, result })
    })
  }

  test('环形图 + 四种结果计数；passRate = passed/(total−na)', async () => {
    seedRun(901, ['pass', 'fail', 'blocked', 'n/a'])
    renderPage(
      <ReportCasePassRatePage />,
      '/test-runs/:testRunId/reports/case-pass-rate',
      '/test-runs/901/reports/case-pass-rate',
    )
    // 1/(4−1) = 33.33%
    expect(await screen.findByText('33.33%')).toBeInTheDocument()
    // 结果计数在 Descriptions 与环形图图例中各出现一次
    expect(screen.getAllByText('通过').length).toBeGreaterThan(0)
    expect(screen.getAllByText('不适用').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: '用例通过率' })).toBeInTheDocument()
  })

  test('分母为 0（全部不适用）→ 展示「无有效执行」', async () => {
    seedRun(902, ['n/a'])
    renderPage(
      <ReportCasePassRatePage />,
      '/test-runs/:testRunId/reports/case-pass-rate',
      '/test-runs/902/reports/case-pass-rate',
    )
    expect(await screen.findByText('无有效执行')).toBeInTheDocument()
  })
})
