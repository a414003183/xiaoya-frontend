import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import type { SuiteView } from '@zentao/api-client/generated/model/suiteView'
import type { TestRunView } from '@zentao/api-client/generated/model/testRunView'
import { AppProvider, ConfigProvider, createTheme, destroyStaticMessages, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import { fetchSuite } from '../api/quality.api'
import { SuiteLinkCaseModal } from '../components/suite-link-case-modal'
import { TestRunLinkCaseModal } from '../components/test-run-link-case-modal'

/**
 * case 族关联弹窗等价测试（T72 / AUDIT FE-11 三处等价之二/三）：
 * SuiteLinkCaseModal 与 TestRunLinkCaseModal 都收敛到 LinkPickerModal（table 形态），
 * 两处的差异逐项冻结：suite 空选禁用、test-run 空选弹提示（「请先勾选用例。」）+ 筛选行 + forceRender。
 */
initI18n()

const server = setupServer(...handlers)

/** getSuite 取数计数探针（FE-14 缓存失效集：关联成功 → invalidate getSuite 的可观测面）。 */
let suiteGets = 0

beforeAll(() => {
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'GET' && /\/suites\/9101$/.test(new URL(request.url).pathname)) {
      suiteGets += 1
    }
  })
  server.listen({ onUnhandledRequest: 'error' })
})
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1
  suiteGets = 0
  db.suites.push({ ...SUITE, caseIds: [1] })
  db.testRuns.push({ ...RUN })
})
afterEach(() => {
  destroyStaticMessages()
  for (const node of document.querySelectorAll('.ant-message .ant-message-notice')) {
    node.remove()
  }
  server.resetHandlers()
})
afterAll(() => server.close())

const SUITE: SuiteView = {
  id: 9101,
  productId: 1,
  name: '登录回归套件',
  description: null,
  type: 'public',
  sort: 0,
  caseIds: [],
  caseCount: 0,
  createdBy: 'admin',
  createdAt: '2026-09-01T00:00:00Z',
  updatedBy: null,
  updatedAt: null,
  lockVersion: 0,
}

const RUN: TestRunView = {
  id: 9201,
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

/** 探针：复刻父级 getSuite 观测者，使 invalidate 可观测（同 menu-route-cache 的探针口径）。 */
function GetSuiteProbe(): null {
  useQuery({ queryKey: ['getSuite', SUITE.id], queryFn: () => fetchSuite(SUITE.id) })
  return null
}

function renderWith(children: ReactNode): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={['suite-view', 'suite-manage', 'test-run-view', 'test-run-manage']}>
            <MemoryRouter>
              <GetSuiteProbe />
              {children}
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('SuiteLinkCaseModal（table 形态 · 空选禁用口径）', () => {
  test('候选排除已关联；空选时关联按钮禁用', async () => {
    renderWith(<SuiteLinkCaseModal suite={{ ...SUITE, caseIds: [1] }} open onClose={() => {}} />)
    // 候选：case 1 已关联被滤掉，其余在表内
    await screen.findByText('Captcha refresh research')
    expect(screen.queryByText('Login success main flow')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^关\s*联$/ })).toBeDisabled()
  })

  test('勾选候选 → 可提交 → 成功提示 + 关窗 + getSuite 失效重取', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWith(<SuiteLinkCaseModal suite={{ ...SUITE, caseIds: [1] }} open onClose={onClose} />)
    await screen.findByText('Captcha refresh research')
    await waitFor(() => expect(suiteGets).toBe(1))
    const row = screen.getByText('Captcha refresh research').closest('tr') as HTMLElement
    await user.click(within(row).getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /^关\s*联$/ }))
    expect(await screen.findByText('已保存')).toBeInTheDocument()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    // 缓存失效集：getSuite 重取（探针 1→2）；关联落库
    await waitFor(() => expect(suiteGets).toBe(2))
    expect(db.suites.find((item) => item.id === SUITE.id)?.caseIds).toContain(4)
  })
})

describe('TestRunLinkCaseModal（table 形态 · 空选提示口径）', () => {
  test('筛选行在位；空选点关联弹「请先勾选用例。」不提交', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWith(<TestRunLinkCaseModal testRun={{ ...RUN }} open onClose={onClose} />)
    await screen.findByText('Login success main flow')
    // 筛选行（套件/执行人）
    expect(screen.getByRole('combobox', { name: 'run-link-suite' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'run-link-assignee' })).toBeInTheDocument()
    // 空选口径与 suite 不同：按钮不禁用、点击弹提示
    const confirm = screen.getByRole('button', { name: /^关\s*联$/ })
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(await screen.findByText('请先勾选用例。')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('勾选候选 → 关联成功 → 提示 + 关窗（close 口径，与 suite 同）', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWith(<TestRunLinkCaseModal testRun={{ ...RUN }} open onClose={onClose} />)
    await screen.findByText('Login success main flow')
    const row = screen.getByText('Login success main flow').closest('tr') as HTMLElement
    await user.click(within(row).getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /^关\s*联$/ }))
    expect(await screen.findByText('已保存')).toBeInTheDocument()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
