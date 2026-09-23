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
 * 角色页（T23 统一实体）：**一张表、一套动作**——旧的两类角色（权限角色/岗位角色）已合成 role 表。
 * 本文件锁四件事：① 列表不再有类型列/类型筛选；② 每一行的行内动作相同（权限/成员/数据权限/编辑/复制/删除）
 * 且按权限码显隐、内置角色不给删除；③ 建/改/删/复制/数据权限五条写路径；④ 账号侧的角色列走角色表。
 */
initI18n()

const FULL_PRIVS = [
  'role-view',
  'role-create',
  'role-edit',
  'role-delete',
  'role-copy',
  'role-priv-edit',
  'role-member-edit',
]
const ACCOUNT_PRIVS = ['account-view', 'account-edit', 'account-create', 'department-view', 'role-view']

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

/** 造一个非内置角色（删除链路用）。 */
function pushRole(id: number, name: string): void {
  db.roles.push({
    id,
    code: null,
    name,
    description: '',
    acl: {},
    builtin: false,
    sort: id,
    createdBy: 'admin',
    createdAt: '2026-09-20T00:00:00Z',
    updatedBy: null,
    updatedAt: null,
    lockVersion: 0,
  })
}

function renderPage(page: React.ReactElement, privileges: string[] = FULL_PRIVS, entry = '/admin/roles') {
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

describe('RoleListPage（统一实体：一张表装全部角色）', () => {
  test('所有角色在一张表里：内置标记、成员数/权限数、无类型列与类型筛选', async () => {
    renderPage(<RoleListPage />)
    // 内置超管角色 + 迁移来的岗位角色（研发/测试/…）同表
    expect(await screen.findByText('管理员')).toBeInTheDocument()
    expect(screen.getByText('研发')).toBeInTheDocument()
    expect(screen.getByText('测试主管')).toBeInTheDocument()
    // 没有页签、没有类型筛选（用户裁决：不需要区分权限角色/岗位角色）
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('类型')).not.toBeInTheDocument()
    // 内置标记：管理员与研发都是内置角色
    expect(within(rowOf('管理员')).getByText('内置')).toBeInTheDocument()
    expect(within(rowOf('研发')).getByText('内置')).toBeInTheDocument()
    // 超管角色有 1 个成员；研发角色没有成员也没有权限码
    expect(within(rowOf('管理员')).getAllByText('1').length).toBeGreaterThan(0)
    expect(within(rowOf('研发')).getAllByText('0').length).toBeGreaterThan(0)
    // 角色码列（迁移来的岗位角色带码，超管角色没有码）
    expect(within(rowOf('研发')).getByText('dev')).toBeInTheDocument()
  })

  test('每一行的动作都一样：权限/成员/数据权限/编辑/复制（内置角色不给删除）', async () => {
    renderPage(<RoleListPage />)
    await screen.findByText('研发')
    for (const name of ['管理员', '研发']) {
      const actions = within(rowOf(name))
      for (const button of [/^权\s*限$/, /^成\s*员$/, /^数据权限$/, /^编\s*辑$/, /^复\s*制$/]) {
        expect(actions.getByRole('button', { name: button })).toBeInTheDocument()
      }
      // 内置角色不可删除（服务端 42203），入口也不渲染
      expect(actions.queryByRole('button', { name: /删\s*除/ })).not.toBeInTheDocument()
    }
  })

  test('权限码显隐：没有 role-copy / role-delete / role-create 时对应入口不渲染', async () => {
    renderPage(<RoleListPage />, ['role-view', 'role-edit'])
    await screen.findByText('研发')
    const actions = within(rowOf('研发'))
    expect(actions.queryByRole('button', { name: /复\s*制/ })).not.toBeInTheDocument()
    expect(actions.queryByRole('button', { name: /删\s*除/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '新建角色' })).not.toBeInTheDocument()
    // 编辑与数据权限要 role-edit：在
    expect(actions.getByRole('button', { name: /编\s*辑/ })).toBeInTheDocument()
  })

  test('新建角色：POST /roles 带 name/code/description，成功后出现在列表', async () => {
    const user = userEvent.setup()
    renderPage(<RoleListPage />)
    await screen.findByText('研发')
    await user.click(screen.getByRole('button', { name: '新建角色' }))
    await user.type(screen.getByLabelText('role-form-name'), '运维')
    await user.type(screen.getByLabelText('role-form-code'), 'ops')
    await user.type(screen.getByLabelText('role-form-description'), '值班与发布')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => expect(db.roles.some((role) => role.name === '运维')).toBe(true))
    expect(sent.at(-1)).toMatchObject({
      method: 'POST',
      body: { name: '运维', code: 'ops', description: '值班与发布' },
    })
    expect(await screen.findByText('运维')).toBeInTheDocument()
  })

  test('新建角色：名称必填（空 → 不出请求）', async () => {
    const user = userEvent.setup()
    renderPage(<RoleListPage />)
    await screen.findByText('研发')
    await user.click(screen.getByRole('button', { name: '新建角色' }))
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    expect(await screen.findByText('此项必填')).toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })

  test('编辑角色：角色码只读，PATCH 带 name/description/lockVersion', async () => {
    const user = userEvent.setup()
    renderPage(<RoleListPage />)
    await screen.findByText('研发')
    await user.click(within(rowOf('研发')).getByRole('button', { name: '编辑' }))
    const code = await screen.findByLabelText('role-form-code')
    expect(code).toBeDisabled()
    expect(code).toHaveValue('dev')
    await user.clear(screen.getByLabelText('role-form-name'))
    await user.type(screen.getByLabelText('role-form-name'), '开发工程师')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => expect(db.roles.find((role) => role.code === 'dev')?.name).toBe('开发工程师'))
    expect(sent.at(-1)).toMatchObject({
      method: 'PATCH',
      body: { name: '开发工程师', lockVersion: 0 },
    })
    expect(await screen.findByText('开发工程师')).toBeInTheDocument()
  })

  test('删除角色：确认框写明后果，DELETE 落到该角色', async () => {
    const user = userEvent.setup()
    pushRole(99, '临时角色')
    renderPage(<RoleListPage />)
    await screen.findByText('临时角色')
    await user.click(within(rowOf('临时角色')).getByRole('button', { name: '删除' }))
    expect(await screen.findByText('确认删除该角色？它的成员关系与权限码会一并清除。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /确\s*定/ }))
    await waitFor(() => expect(db.roles.some((role) => role.id === 99)).toBe(false))
    expect(await screen.findByText('角色已删除。')).toBeInTheDocument()
  })

  test('复制角色：副本按勾选项带权限码/成员，源角色不变', async () => {
    const user = userEvent.setup()
    pushRole(97, '源角色')
    db.rolePrivs.push({ roleId: 97, code: 'account-view' }, { roleId: 97, code: 'department-view' })
    db.userRoles.push({ accountId: 2, roleId: 97 })
    renderPage(<RoleListPage />)
    await screen.findByText('源角色')
    await user.click(within(rowOf('源角色')).getByRole('button', { name: '复制' }))
    const name = await screen.findByLabelText('role-copy-name')
    expect(name).toHaveValue('源角色-副本')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => expect(db.roles.some((role) => role.name === '源角色-副本')).toBe(true))
    const copy = db.roles.find((role) => role.name === '源角色-副本')
    expect(
      db.rolePrivs
        .filter((item) => item.roleId === copy?.id)
        .map((item) => item.code)
        .sort(),
    ).toEqual(['account-view', 'department-view'])
    expect(db.userRoles.filter((item) => item.roleId === copy?.id)).toHaveLength(1)
    // 源角色不变
    expect(db.rolePrivs.filter((item) => item.roleId === 97)).toHaveLength(2)
  })

  test('数据权限：勾选对象后 PATCH acl', async () => {
    const user = userEvent.setup()
    pushRole(96, '数据权限角色')
    renderPage(<RoleListPage />)
    await screen.findByText('数据权限角色')
    await user.click(within(rowOf('数据权限角色')).getByRole('button', { name: '数据权限' }))
    expect(await screen.findByText(/数据权限 · 数据权限角色/)).toBeInTheDocument()
    await user.click(screen.getByLabelText('role-acl-products'))
    await user.click(await screen.findByTitle('Demo Product'))
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      const acl = db.roles.find((role) => role.id === 96)?.acl as { products?: number[] } | undefined
      expect(acl?.products).toContain(1)
    })
  })
})

describe('账号侧的角色（成员关系）', () => {
  test('账号列表的角色列显示角色名（角色表解析），不是裸码', async () => {
    renderPage(<AccountListPage />, ACCOUNT_PRIVS, '/org/accounts')
    expect(await screen.findByText('Dev One')).toBeInTheDocument()
    expect(within(rowOf('Dev One')).getByText('成员')).toBeInTheDocument()
    // admin 是超管角色成员
    expect(within(rowOf('Admin User')).getByText('管理员')).toBeInTheDocument()
  })
})
