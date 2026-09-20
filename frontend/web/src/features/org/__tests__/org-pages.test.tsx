import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { orgHandlers } from '../../../mocks/org-handlers'
import { platformHandlers } from '../../../mocks/platform-handlers'
import AccountBatchCreatePage from '../pages/account-batch-create-page.page'
import AccountListPage from '../pages/account-list-page.page'
import DepartmentListPage from '../pages/department-list-page.page'

initI18n()

const DEPARTMENT_PRIVS = ['department-view', 'department-create', 'department-edit', 'department-delete']

const server = setupServer(...orgHandlers, ...platformHandlers)

/** 部门列表 GET 请求留痕：断言 page/limit/q/sort/filters[x] 由前端下发、结果由服务端给。 */
const departmentQueries: string[] = []
server.events.on('request:start', ({ request }) => {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/v1/departments') {
    departmentQueries.push(request.url)
  }
})

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  departmentQueries.length = 0
  db.sessionActive = true
  db.currentAccountId = 1 // admin：全部权限码
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

function renderPage(page: React.ReactElement, entry = '/org/accounts', privileges: string[] = []) {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={privileges}>
            <MemoryRouter initialEntries={[entry]}>{page}</MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

/** 行定位：按名称列的链接式按钮定位所在表格行（parentName 列会重复出现同一部门名，故不按文本查）。 */
function rowOf(name: string): HTMLElement {
  const row = screen.getByRole('button', { name }).closest('tr')
  if (!row) {
    throw new Error(`no table row around ${name}`)
  }
  return row
}

/** 整表 21 条 Site-* 部门（分页用例：page=2 只剩 1 条）。 */
function seedSiteDepartments(count: number): void {
  for (let index = 1; index <= count; index += 1) {
    db.departments.push({
      id: 100 + index,
      name: `Site-${index}`,
      parentId: null,
      path: `,${100 + index},`,
      grade: 1,
      sort: 0,
      manager: null,
    })
  }
}

describe('AccountListPage', () => {
  test('渲染账号列表并按部门树过滤', async () => {
    const user = userEvent.setup()
    renderPage(<AccountListPage />)
    expect(await screen.findByText('Dev One')).toBeInTheDocument()
    await user.click(await screen.findByText('R&D Department'))
    await waitFor(() => {
      expect(screen.getAllByText('Dev One').length).toBeGreaterThan(0)
    })
  })

  test('行内动作按状态显示：active 显示停用', async () => {
    renderPage(<AccountListPage />)
    await screen.findByText('Dev One')
    const buttons = await screen.findAllByRole('button', { name: /停\s*用/ })
    expect(buttons.length).toBeGreaterThan(0)
  })
})

describe('AccountBatchCreatePage', () => {
  test('密码缺失拦截提交；随机生成后提交并展示成功行号', async () => {
    const user = userEvent.setup()
    renderPage(<AccountBatchCreatePage />)
    await user.type(await screen.findByLabelText('account-1'), 'batcher01')
    await user.type(screen.getByLabelText('realName-1'), '批量甲')
    // B-WKS-03：不再有统一弱口令，密码缺失时拦截提交
    await user.click(screen.getByRole('button', { name: '提交创建' }))
    await waitFor(() => {
      expect(screen.getByText(/org\.accounts\.batchPasswordRequired|密码需为 6/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/#\d+/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /org\.accounts\.batchRandomPassword|随机生成全部/ }))
    await waitFor(() => {
      expect((screen.getByLabelText('password-1') as HTMLInputElement).value).toMatch(/^.{12}$/)
    })
    await user.click(screen.getByRole('button', { name: '提交创建' }))
    await waitFor(() => {
      expect(screen.getByText(/#\d+/)).toBeInTheDocument()
    })
  })
})

describe('DepartmentListPage', () => {
  test('平铺列表渲染：名称/上级部门（服务端 parentName）/层级/负责人/排序', async () => {
    db.departments.push({
      id: 99,
      name: 'Branch Office',
      parentId: 2,
      path: ',1,2,99,',
      grade: 3,
      sort: 7,
      manager: 'guest',
    })
    renderPage(<DepartmentListPage />, '/org/departments', DEPARTMENT_PRIVS)
    await screen.findByRole('button', { name: 'Branch Office' })
    const row = rowOf('Branch Office')
    expect(within(row).getByText('R&D Department')).toBeInTheDocument() // 上级部门列 = 服务端解析的 parentName
    expect(within(row).getByText('3')).toBeInTheDocument() // 层级
    expect(within(row).getByText('guest')).toBeInTheDocument() // 负责人
    expect(within(row).getByText('7')).toBeInTheDocument() // 排序
    // 根部门的上级为空 → 显示占位「无」，不出现前端拼装的父名
    expect(within(rowOf('Headquarters')).getByText('无')).toBeInTheDocument()
  })

  test('筛选/排序/分页全部走服务端参数：URL → GET /departments → 服务端结果', async () => {
    seedSiteDepartments(21)
    renderPage(<DepartmentListPage />, '/org/departments?q=Site&sort=-id&page=2', DEPARTMENT_PRIVS)
    // 21 条命中、limit=20：第 2 页 + 降序 → 只剩 id 最小的 Site-1
    expect(await screen.findByRole('button', { name: 'Site-1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Site-21' })).not.toBeInTheDocument()
    const params = new URL(departmentQueries.at(-1) ?? '').searchParams
    expect(params.get('q')).toBe('Site')
    expect(params.get('sort')).toBe('-id')
    expect(params.get('page')).toBe('2')
    expect(params.get('limit')).toBe('20')
  })

  test('上级部门筛选 filters[parentId] 由服务端过滤（客户端不二次筛选）', async () => {
    db.departments.push({
      id: 99,
      name: 'Branch Office',
      parentId: 2,
      path: ',1,2,99,',
      grade: 3,
      sort: 7,
      manager: null,
    })
    renderPage(<DepartmentListPage />, '/org/departments?filters[parentId]=2', DEPARTMENT_PRIVS)
    expect(await screen.findByRole('button', { name: 'Branch Office' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Headquarters' })).not.toBeInTheDocument()
    const params = new URL(departmentQueries.at(-1) ?? '').searchParams
    expect(params.get('filters[parentId]')).toBe('2')
  })

  test('名称关键词搜索 q：服务端命中后只剩匹配行', async () => {
    renderPage(<DepartmentListPage />, '/org/departments?q=R%26D', DEPARTMENT_PRIVS)
    expect(await screen.findByRole('button', { name: 'R&D Department' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Headquarters' })).not.toBeInTheDocument()
    expect(new URL(departmentQueries.at(-1) ?? '').searchParams.get('q')).toBe('R&D')
  })

  test('点名称打开编辑弹窗，改名提交 PATCH 后列表刷新', async () => {
    const user = userEvent.setup()
    renderPage(<DepartmentListPage />, '/org/departments', DEPARTMENT_PRIVS)
    await user.click(await screen.findByRole('button', { name: 'R&D Department' }))
    const nameInput = await screen.findByLabelText('department-form-name')
    expect(nameInput).toHaveValue('R&D Department')
    await user.clear(nameInput)
    await user.type(nameInput, 'R&D Lab')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    expect(await screen.findByRole('button', { name: 'R&D Lab' })).toBeInTheDocument()
    expect(db.departments.find((department) => department.id === 2)?.name).toBe('R&D Lab')
  })

  test('行内「新增子部门」带上该行 parentId 创建', async () => {
    const user = userEvent.setup()
    renderPage(<DepartmentListPage />, '/org/departments', DEPARTMENT_PRIVS)
    await screen.findByRole('button', { name: 'Headquarters' })
    await user.click(within(rowOf('Headquarters')).getByRole('button', { name: '新增子部门' }))
    await user.type(await screen.findByLabelText('department-form-name'), 'Northern Branch')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      expect(db.departments.find((department) => department.name === 'Northern Branch')?.parentId).toBe(1)
    })
  })

  test('顶部「新增根部门」创建 parentId 为空的部门', async () => {
    const user = userEvent.setup()
    renderPage(<DepartmentListPage />, '/org/departments', DEPARTMENT_PRIVS)
    await screen.findByRole('button', { name: 'Headquarters' })
    await user.click(screen.getByRole('button', { name: '新增根部门' }))
    await user.type(await screen.findByLabelText('department-form-name'), 'Southern Branch')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      expect(db.departments.find((department) => department.name === 'Southern Branch')?.parentId ?? null).toBeNull()
    })
  })
})
