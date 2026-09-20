import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { orgHandlers } from '../../../mocks/org-handlers'
import { platformHandlers } from '../../../mocks/platform-handlers'
import { departmentKeyId, departmentOptions, monthRange } from '../model'
import PersonnelListPage from '../pages/personnel-list-page.page'
import PersonnelWorkloadPage from '../pages/personnel-workload-page.page'

/** T-14 人员管理两页：计数列口径、部门过滤、区间必填（40001 呈现）、图表与明细。 */
initI18n()

const server = setupServer(...orgHandlers, ...platformHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1 // admin：含 personnel-view
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

function renderPage(page: ReactElement, entry: string, path: string): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path={path} element={page} />
              <Route path="/org/accounts/:accountId" element={<div>account-detail-stub</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('org model（人员两页共用纯函数）', () => {
  test('monthRange 取当月首末日（含闰年 2 月与 12 月边界）', () => {
    expect(monthRange('2026-02-18')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange('2026-12-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(monthRange('2024-02-10')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })

  test('departmentKeyId 前缀校验', () => {
    expect(departmentKeyId('department-7')).toBe(7)
    expect(departmentKeyId('7')).toBeNull()
  })

  test('departmentOptions 按层级展开', () => {
    const options = departmentOptions([
      {
        id: 1,
        name: '总部',
        path: ',1,',
        grade: 1,
        sort: 0,
        children: [{ id: 2, name: '研发部', path: ',1,2,', grade: 2, sort: 0, children: [] }],
      },
    ])
    expect(options.map((option) => option.value)).toEqual([1, 2])
    expect(options[1]?.label).toBe('　研发部')
  })
})

describe('人员列表页', () => {
  const PATH = '/personnel'

  test('计数列与 task/bug 口径一致（dev1 在办任务 1 / 未解决 Bug 2）', async () => {
    renderPage(<PersonnelListPage />, PATH, PATH)
    const table = await screen.findByRole('table')
    const row = within(table).getByText('Dev One').closest('tr') as HTMLElement
    const cells = within(row).getAllByRole('cell')
    // 列序：登录名/姓名/部门/角色/在办任务/未解决 Bug
    expect(cells[0]?.textContent).toBe('dev1')
    expect(cells[4]?.textContent).toBe('1')
    expect(cells[5]?.textContent).toBe('2')
  })

  test('停用账号不出现（启用账号视图）', async () => {
    const guest = db.accounts.find((account) => account.account === 'guest')
    if (guest) {
      guest.status = 'disabled'
    }
    renderPage(<PersonnelListPage />, PATH, PATH)
    await screen.findByText('Dev One')
    expect(screen.queryByText('Guest User')).not.toBeInTheDocument()
  })

  test('左部门树过滤出研发部成员', async () => {
    renderPage(<PersonnelListPage />, PATH, PATH)
    await screen.findByText('Dev One')
    const tree = screen.getByRole('tree')
    fireEvent.click(within(tree).getByText('R&D Department'))
    await waitFor(() => {
      expect(screen.queryByText('Admin User')).not.toBeInTheDocument()
      expect(screen.getByText('Dev One')).toBeInTheDocument()
    })
  })

  test('行内账号跳账号详情', async () => {
    renderPage(<PersonnelListPage />, PATH, PATH)
    fireEvent.click(await screen.findByText('dev1'))
    expect(await screen.findByText('account-detail-stub')).toBeInTheDocument()
  })
})

describe('工作量统计页', () => {
  const PATH = '/personnel/workload'

  test('区间内按人聚合消耗工时与完成任务数', async () => {
    renderPage(<PersonnelWorkloadPage />, `${PATH}?from=2026-02-01&to=2026-02-28`, PATH)
    expect(await screen.findByRole('img', { name: '工作量统计' })).toBeInTheDocument()
    const table = screen.getByRole('table')
    const row = within(table).getByText('Dev One').closest('tr') as HTMLElement
    const cells = within(row).getAllByRole('cell')
    // dev1：2+2+4 小时；区间内完成任务 task 3(02-05)/task 7(02-06)
    expect(cells[3]?.textContent).toBe('8')
    expect(cells[4]?.textContent).toBe('2')
  })

  test('缺省区间为当前自然月（URL 同步进日期输入）', async () => {
    renderPage(<PersonnelWorkloadPage />, PATH, PATH)
    const expected = monthRange(new Date().toISOString().slice(0, 10))
    await waitFor(() => {
      expect(screen.getByLabelText('personnel-workload-from')).toHaveValue(expected.from)
    })
    expect(screen.getByLabelText('personnel-workload-to')).toHaveValue(expected.to)
  })

  test('区间倒置被后端拒绝（40001）时原样呈现服务端文案', async () => {
    renderPage(<PersonnelWorkloadPage />, `${PATH}?from=2026-03-01&to=2026-02-01`, PATH)
    expect(await screen.findByText('请求参数有误，请检查后重试。')).toBeInTheDocument()
  })
})
