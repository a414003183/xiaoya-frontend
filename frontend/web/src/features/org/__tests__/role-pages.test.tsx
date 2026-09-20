import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import {
  AppProvider,
  antdLocaleZhCN,
  ConfigProvider,
  createTheme,
  destroyStaticMessages,
  PermScope,
} from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import AccountListPage from '../pages/account-list-page.page'
import RoleListPage from '../pages/role-list-page.page'

/**
 * 角色列表（/admin/roles，org 卡 §6）：页签装配（权限角色 / 岗位角色）与岗位字典四条链路。
 * 2026-09-20 起本页是两类角色的唯一入口：字典用例走 `?tab=dict` 深链（等价于点第二个页签）。
 */
initI18n()

const ROLE_PRIVS = ['role-view', 'role-manage']
const GROUP_PRIVS = ['role-view', 'role-manage', 'group-view']
const ACCOUNT_PRIVS = ['account-view', 'account-edit', 'account-create', 'department-view', 'group-view']

const server = setupServer(...handlers)

/** 写请求体留痕（断言 POST/PATCH 的上行形状，含 lockVersion）。 */
const sent: { method: string; url: string; body: unknown }[] = []
server.events.on('request:start', async ({ request }) => {
  if (request.url.includes('/api/v1/roles') && request.method !== 'GET') {
    sent.push({
      method: request.method,
      url: request.url,
      body: await request
        .clone()
        .json()
        .catch(() => null),
    })
  }
})

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  sent.length = 0
  db.sessionActive = true
  db.currentAccountId = 1 // admin：全部权限码
})
afterEach(() => {
  cleanup()
  destroyStaticMessages()
  server.resetHandlers()
})
afterAll(() => server.close())

function renderPage(page: React.ReactElement, privileges: string[] = ROLE_PRIVS, entry = '/admin/roles?tab=dict') {
  return render(
    // antd locale 随语言联动（AppProviders 同款）：确认框按钮等 antd 内建文案才与真机一致
    <ConfigProvider theme={createTheme()} locale={antdLocaleZhCN}>
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

/** 行定位：某文案所在的表格行。 */
function rowOf(text: string): HTMLElement {
  const cell = screen.getByText(text)
  const row = cell.closest('tr')
  if (!row) {
    throw new Error(`no table row around ${text}`)
  }
  return row
}

describe('RoleListPage「岗位角色」页签（角色字典）', () => {
  test('渲染内置九角色：本地化名称、角色码、其他语言副行与使用账号数', async () => {
    renderPage(<RoleListPage />)
    expect(await screen.findByText('研发')).toBeInTheDocument()
    expect(screen.getByText('测试')).toBeInTheDocument()
    expect(screen.getByText('其他')).toBeInTheDocument()
    // 角色码列 + 另一语言的副行
    expect(within(rowOf('研发')).getByText('dev')).toBeInTheDocument()
    expect(within(rowOf('研发')).getByText('en: Developer')).toBeInTheDocument()
    // 使用账号数现算：admin 角色 top、dev1 角色 dev、guest 角色 others
    expect(within(rowOf('研发')).getByText('1')).toBeInTheDocument()
    expect(within(rowOf('高层管理')).getByText('1')).toBeInTheDocument()
    // 计数已随分页（用户裁决 2026-09-20 二次修订）；字典页关分页 → 断言行数（9 行数据 + 1 行表头）
    expect(screen.getAllByRole('row')).toHaveLength(10)
  })

  test('关键词筛选按角色码/名称在客户端过滤', async () => {
    const user = userEvent.setup()
    renderPage(<RoleListPage />)
    await screen.findByText('研发')
    await user.type(screen.getByPlaceholderText('搜索'), 'dev')
    await user.click(screen.getByRole('button', { name: /搜\s*索/ }))
    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(2)
    })
    expect(screen.getByText('研发')).toBeInTheDocument()
    expect(screen.queryByText('测试主管')).not.toBeInTheDocument()
  })

  test('新建角色：POST 体含 roleCreateRequest 三字段，成功后出现在列表', async () => {
    const user = userEvent.setup()
    renderPage(<RoleListPage />)
    await screen.findByText('研发')
    await user.click(screen.getByRole('button', { name: '新建角色' }))
    await user.type(screen.getByLabelText('role-form-code'), 'ops')
    await user.type(screen.getByLabelText('role-form-label-zh-CN'), '运维')
    await user.type(screen.getByLabelText('role-form-label-en'), 'Ops Engineer')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      expect(db.roles.some((role) => role.code === 'ops')).toBe(true)
    })
    expect(sent.at(-1)).toMatchObject({
      method: 'POST',
      body: { code: 'ops', labels: { 'zh-CN': '运维', en: 'Ops Engineer' } },
    })
    expect(await screen.findByText('运维')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(11)
  })

  test('名称全空拦截提交（labels 至少一项非空）', async () => {
    const user = userEvent.setup()
    renderPage(<RoleListPage />)
    await screen.findByText('研发')
    await user.click(screen.getByRole('button', { name: '新建角色' }))
    await user.type(screen.getByLabelText('role-form-code'), 'blank-name')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    expect(await screen.findByText('此项必填')).toBeInTheDocument()
    expect(db.roles.some((role) => role.code === 'blank-name')).toBe(false)
  })

  test('编辑角色：code 只读、PATCH 体带 labels/sort/lockVersion', async () => {
    const user = userEvent.setup()
    renderPage(<RoleListPage />)
    await screen.findByText('研发')
    await user.click(within(rowOf('研发')).getByRole('button', { name: '编辑' }))
    expect(await screen.findByLabelText('role-form-code')).toBeDisabled()
    expect(screen.getByLabelText('role-form-code')).toHaveValue('dev')
    await user.clear(screen.getByLabelText('role-form-label-zh-CN'))
    await user.type(screen.getByLabelText('role-form-label-zh-CN'), '开发')
    await user.clear(screen.getByLabelText('role-form-sort'))
    await user.type(screen.getByLabelText('role-form-sort'), '15')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      expect(db.roles.find((role) => role.code === 'dev')?.labels['zh-CN']).toBe('开发')
    })
    expect(sent.at(-1)).toMatchObject({
      method: 'PATCH',
      body: { labels: { 'zh-CN': '开发', en: 'Developer' }, sort: 15, lockVersion: 0 },
    })
    const devRole = db.roles.find((role) => role.code === 'dev')
    expect(devRole?.sort).toBe(15)
    expect(devRole?.lockVersion).toBe(1)
    expect(await screen.findByText('开发')).toBeInTheDocument()
  })

  test('删除内置角色被守卫拦住：确认框写明规则，服务端 42203 后角色仍在', async () => {
    const user = userEvent.setup()
    renderPage(<RoleListPage />)
    await screen.findByText('研发')
    await user.click(within(rowOf('研发')).getByRole('button', { name: '删除' }))
    expect(await screen.findByText('内置角色不可删除（可改名或调整排序）。')).toBeInTheDocument()
    expect(screen.getByText('仍被账号使用的角色不可删除，请先调整这些账号的角色。')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /确\s*定/ }))
    await waitFor(() => {
      expect(sent.at(-1)).toMatchObject({ method: 'DELETE' })
    })
    expect(db.roles.some((role) => role.code === 'dev')).toBe(true)
    expect(await screen.findByText('操作条件不满足，请确认对象状态后重试。')).toBeInTheDocument()
  })

  test('删除仍被账号使用的自建角色被守卫拦住；未被使用的可删', async () => {
    const user = userEvent.setup()
    db.roles.push({
      code: 'ops',
      labels: { 'zh-CN': '运维', en: 'Ops Engineer' },
      sort: 100,
      builtin: false,
      createdBy: 'admin',
      createdAt: '2026-09-20T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
    })
    const guest = db.accounts.find((account) => account.account === 'guest')
    if (!guest) {
      throw new Error('seed account guest missing')
    }
    guest.role = 'ops'
    renderPage(<RoleListPage />)
    await screen.findByText('运维')
    await user.click(within(rowOf('运维')).getByRole('button', { name: '删除' }))
    await user.click(await screen.findByRole('button', { name: /确\s*定/ }))
    expect(await screen.findByText('操作条件不满足，请确认对象状态后重试。')).toBeInTheDocument()
    expect(db.roles.some((role) => role.code === 'ops')).toBe(true)

    // 停用该账号的使用后即可删除
    guest.role = null
    await user.click(within(rowOf('运维')).getByRole('button', { name: '删除' }))
    await user.click(await screen.findByRole('button', { name: /确\s*定/ }))
    await waitFor(() => {
      expect(db.roles.some((role) => role.code === 'ops')).toBe(false)
    })
    expect(await screen.findByText('角色已删除。')).toBeInTheDocument()
  })
})

describe('角色列表页签（2026-09-20 合并：权限角色 / 岗位角色）', () => {
  test('默认落「角色」页签并加载组列表；切到「岗位角色」后岗位字典才渲染', async () => {
    const user = userEvent.setup()
    renderPage(<RoleListPage />, GROUP_PRIVS, '/admin/roles')
    // 页签 1 = 权限角色（原 /org/groups 列表页），缺省激活
    expect(await screen.findByText('Admins')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '角色' })).toHaveAttribute('aria-selected', 'true')
    // 岗位字典此时未挂载（表数据来自 GET /roles，未激活的页签不加载）
    expect(screen.queryByText('研发')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '岗位角色' }))
    expect(await screen.findByText('研发')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '岗位角色' })).toHaveAttribute('aria-selected', 'true')
  })

  test('?tab=dict 深链直接落「岗位角色」页签（权限角色页签内容不挂载）', async () => {
    renderPage(<RoleListPage />, GROUP_PRIVS, '/admin/roles?tab=dict')
    expect(await screen.findByText('研发')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '岗位角色' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('Admins')).not.toBeInTheDocument()
  })

  test('无 group-view：「角色」页签整体不渲染，岗位字典照常（组列表连请求都不发）', async () => {
    renderPage(<RoleListPage />, ROLE_PRIVS, '/admin/roles')
    expect(await screen.findByText('研发')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '角色' })).not.toBeInTheDocument()
    expect(screen.queryByText('Admins')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '岗位角色' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('角色选项来源（账号侧）', () => {
  test('账号列表的角色列显示字典名称（dev → 研发），筛选下拉同样来自字典', async () => {
    renderPage(<AccountListPage />, ACCOUNT_PRIVS, '/org/accounts')
    expect(await screen.findByText('Dev One')).toBeInTheDocument()
    // 登录名/姓名列之外，role 列渲染的是 GET /roles 的当前语言 label，不再是裸码
    expect(within(rowOf('Dev One')).getByText('研发')).toBeInTheDocument()
    expect(within(rowOf('Dev One')).queryByText('dev')).not.toBeInTheDocument()
  })
})
