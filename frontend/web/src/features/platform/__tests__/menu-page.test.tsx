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
import MenuListPage from '../pages/menu-list-page.page'

/**
 * 菜单管理（T19 P2-1 / T21）：内置基线树 + 三类节点（目录/菜单/按钮）+ 三条写路径。
 * mock 基线是真实基线的缩影（见 mocks/menu-handlers.ts），断言按 mock 的形状写。
 */
initI18n()

const PRIVS = ['menu-manage', 'setting-manage', 'role-view', 'todo-view']

const server = setupServer(...handlers)

/** 写请求体留痕（断言 POST/PATCH 的上行形状）。 */
const sent: { method: string; url: string; body: unknown }[] = []
server.events.on('request:start', async ({ request }) => {
  if (request.url.includes('/api/v1/menus') && request.method !== 'GET') {
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

function renderPage() {
  return render(
    <ConfigProvider theme={createTheme()} locale={antdLocaleZhCN}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={PRIVS}>
            <MemoryRouter initialEntries={['/admin/menus']}>
              <MenuListPage />
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

/** 展开整棵树（缺省是收起的，逐层断言前先点开）。 */
async function expandAll(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: '展开全部' }))
}

describe('菜单管理树（内置基线 + DB 覆盖）', () => {
  test('默认收起：只渲染一级模块，展开后逐层显示；叶子没有展开按钮', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('工作台')).toBeInTheDocument()
    expect(screen.getByText('系统')).toBeInTheDocument()
    // 收起态：分区与菜单项都不在表里
    expect(screen.queryByText('系统管理')).not.toBeInTheDocument()
    expect(screen.queryByText('字典管理')).not.toBeInTheDocument()

    await expandAll(user)
    expect(await screen.findByText('系统管理')).toBeInTheDocument()
    expect(screen.getByText('字典管理')).toBeInTheDocument()
    // 一级模块与分区有展开按钮（render 成 aria-label=toggle 的图标按钮），叶子没有
    const leaf = screen.getByText('字典管理').closest('tr') as HTMLElement
    expect(leaf.querySelector('.ant-table-row-expand-icon-collapsed, .ant-table-row-expand-icon-expanded')).toBeNull()

    // 一键收起回到初始态
    await user.click(screen.getByRole('button', { name: '收起全部' }))
    await waitFor(() => expect(screen.queryByText('字典管理')).not.toBeInTheDocument())
  })

  test('编辑菜单行：PATCH /menus?nodeKey=…（T03：没有「覆盖行」这回事），路径可改', async () => {
    const user = userEvent.setup()
    renderPage()
    await expandAll(user)
    const row = (await screen.findByText('字典管理')).closest('tr') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /编\s*辑/ }))

    const title = await screen.findByLabelText('menu-form-title')
    expect(title).toHaveValue('platform.dict.title') // 预填 i18n 键，不是译文
    const path = screen.getByLabelText('menu-form-path')
    expect(path).toBeEnabled() // T21：路径是普通字段，可改
    expect(path).toHaveValue('/admin/dicts')
    await user.clear(title)
    await user.type(title, '数据字典')
    await user.clear(path)
    await user.type(path, '/admin/dicts')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))

    await waitFor(() => expect(sent).toHaveLength(1))
    const patched = sent[0] as { method: string; url: string; body: { title?: string; path?: string } }
    expect(patched.method).toBe('PATCH')
    expect(patched.url).toContain('nodeKey=' + encodeURIComponent('/admin/dicts'))
    expect(patched.body).toMatchObject({ title: '数据字典', path: '/admin/dicts' })
    await waitFor(() => expect(screen.getAllByText('数据字典').length).toBeGreaterThan(0))
    expect(db.menus.find((item) => item.nodeKey === '/admin/dicts')?.title).toBe('数据字典')
  })

  test('新增一级模块：parentKey 不传、type=dir，落到树的顶层', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '新增一级模块' }))

    await user.type(await screen.findByLabelText('menu-form-title'), '自建模块')
    // 目录不给选上级（就是一级模块），路径字段不出现
    expect(screen.queryByLabelText('menu-form-path')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))

    await waitFor(() => expect(sent).toHaveLength(1))
    const posted = sent[0]?.body as { type: string; title: string; status: string; parentKey?: string }
    expect(posted).toMatchObject({ type: 'dir', title: '自建模块', status: 'active' })
    expect(posted.parentKey).toBeUndefined()
    expect(await screen.findByText('自建模块')).toBeInTheDocument()
  })

  test('新增按钮：挂到菜单下，权限标识是文本框而不是下拉框', async () => {
    const user = userEvent.setup()
    renderPage()
    await expandAll(user)
    const row = (await screen.findByText('字典管理')).closest('tr') as HTMLElement
    await user.click(within(row).getByRole('button', { name: '新增下级' }))

    // 菜单下的下级只能是按钮：类型已切成按钮，权限标识是自由文本
    const perm = await screen.findByLabelText('menu-form-perm')
    expect(perm.tagName).toBe('INPUT')
    await user.type(screen.getByLabelText('menu-form-title'), '导出')
    await user.type(perm, 'setting-manage')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]?.body).toMatchObject({ type: 'button', title: '导出', perm: 'setting-manage' })
    await waitFor(() => expect(screen.getAllByText('按钮').length).toBeGreaterThan(0))
    // 基线按钮的标题是 i18n 键 priv.<code>：菜单里显示中文名（授权页同一份名字表）
    // 「字典管理」页声明的 setting-manage → priv.setting-manage = 管理系统参数
    // 基线按钮的标题是 i18n 键 priv.<code>：菜单里显示中文名（授权页同一份名字表）
    expect(screen.getAllByText('创建角色').length).toBeGreaterThan(0)
    expect(db.menus[0]?.nodeType).toBe('button')
    expect(db.menus[0]?.path).toBeNull()
  })

  test('停用（PATCH）与删除（DELETE）都按 nodeKey 寻址', async () => {
    const user = userEvent.setup()
    db.menus.push({
      id: 77,
      nodeKey: 'db-77',
      parentKey: 'admin/system',
      nodeType: 'menu',
      title: '临时入口',
      component: null,
      path: '/admin/tmp',
      icon: null,
      orderNo: 9,
      perm: null,
      status: 'active',
    })
    renderPage()
    await expandAll(user)
    const row = (await screen.findByText('临时入口')).closest('tr') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /编\s*辑/ }))

    await user.click(screen.getByLabelText('menu-form-status'))
    await user.click(await screen.findByTitle('停用'))
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]?.method).toBe('PATCH')
    expect(sent[0]?.url).toContain('nodeKey=' + encodeURIComponent('db-77'))
    expect(sent[0]?.body).toMatchObject({ status: 'disabled', perm: '' })
    expect(sent[0]?.body).toMatchObject({ path: '/admin/tmp' })
    await waitFor(() => expect(db.menus.find((item) => item.nodeKey === 'db-77')?.status).toBe('disabled'))

    await user.click(within(row).getByRole('button', { name: /删\s*除/ }))
    expect(await screen.findByText('删除后该节点从侧栏消失。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /确\s*定/ }))
    await waitFor(() => expect(db.menus.some((item) => item.nodeKey === 'db-77')).toBe(false))
    await waitFor(() => expect(screen.queryByText('临时入口')).not.toBeInTheDocument())
  })

  test('关键词筛选保留命中项的祖先（树剪枝），清空后恢复', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('系统')
    await user.type(screen.getByLabelText('菜单名称/路径/权限标识'), '字典')
    await user.click(screen.getByRole('button', { name: /搜\s*索/ }))
    await waitFor(() => expect(screen.queryByText('角色')).not.toBeInTheDocument())
    await expandAll(user)
    expect(screen.getByText('字典管理')).toBeInTheDocument()
    expect(screen.getByText('系统管理')).toBeInTheDocument() // 祖先还在，命中项才可见
    await user.click(screen.getByRole('button', { name: /重\s*置/ }))
    expect(await screen.findByText('角色')).toBeInTheDocument()
  })
})
