import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { menuHandlers } from '../../../mocks/menu-handlers'
import { orgHandlers } from '../../../mocks/org-handlers'
import { platformHandlers } from '../../../mocks/platform-handlers'
import RolePrivilegesPage from '../pages/role-privileges-page.page'

/**
 * 角色权限页（T22 改版 / T23 挂在角色下）：菜单树勾选 + 未编入菜单的权限码兜底区，
 * 保存走 PUT /roles/{id}/privileges（整体替换）。树来自 mocks/menu-handlers.ts 的基线缩影
 * （工作台/系统两组，系统下有系统设置、字典管理、角色）。
 */
initI18n()

const server = setupServer(...orgHandlers, ...platformHandlers, ...menuHandlers)

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

function renderPage(roleId = 2) {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={[`/admin/roles/${roleId}/privileges`]}>
            <Routes>
              <Route path="/admin/roles/:roleId/privileges" element={<RolePrivilegesPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

/** 树节点里的 checkbox（antd 的树节点没有 label 关联，只能按节点文本定位；它是 span 不是 input）。 */
function treeCheckbox(title: string): HTMLElement {
  const node = screen.getByText(title).closest('.ant-tree-treenode') as HTMLElement
  return within(node).getByRole('checkbox')
}

/** 树节点的勾选态（antd 用 aria-checked 表达）。 */
function isChecked(title: string): boolean {
  return treeCheckbox(title).getAttribute('aria-checked') === 'true'
}

/** 展开整棵树（缺省收起；节点标题点击不展开，展开靠工具栏按钮或节点前的开关）。 */
async function expandAll(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: '展开全部' }))
}

/** 角色 2（成员）当前的权限码（存储真值）。 */
function codesOf(roleId: number): string[] {
  return db.rolePrivs.filter((item) => item.roleId === roleId).map((item) => item.code)
}

describe('RolePrivilegesPage', () => {
  test('按菜单树渲染层级：勾上菜单节点即勾上它的权限码，保存整体提交', async () => {
    const user = userEvent.setup()
    renderPage(2)
    // 层级：一级模块 → 目录 → 菜单（默认收起，展开后才看得到下级）
    expect(await screen.findByText('系统')).toBeInTheDocument()
    expect(screen.queryByText('字典管理')).not.toBeInTheDocument()
    await expandAll(user)
    expect(await screen.findByText('字典管理')).toBeInTheDocument()

    // 角色 2 只授了 account-view / department-view，树上的 setting-manage 未授予
    expect(isChecked('字典管理')).toBe(false)
    await user.click(treeCheckbox('字典管理'))
    await user.click(screen.getByRole('button', { name: /保\s*存\s*权\s*限/ }))
    await waitFor(() => {
      expect(codesOf(2)).toContain('setting-manage')
      expect(codesOf(2)).toContain('account-view')
    })
  })

  test('勾选已授予的节点 → 取消该权限码；权限标识展示在节点标题旁', async () => {
    const user = userEvent.setup()
    db.rolePrivs.push({ roleId: 2, code: 'setting-manage' })
    renderPage(2)
    await expandAll(user)
    expect(isChecked('字典管理')).toBe(true)
    expect(screen.getAllByText('setting-manage').length).toBeGreaterThan(0)
    // 页面声明出来的按钮（role-create 等）标题走 priv.<code> 名字表：树里显示中文名
    expect(screen.getByText('创建角色')).toBeInTheDocument()
    expect(screen.getByText('编辑角色权限')).toBeInTheDocument()

    await user.click(treeCheckbox('字典管理'))
    await user.click(screen.getByRole('button', { name: /保\s*存\s*权\s*限/ }))
    await waitFor(() => {
      expect(codesOf(2)).not.toContain('setting-manage')
      expect(codesOf(2)).toContain('account-view')
    })
  })

  test('父子联动：勾一级模块 → 整棵子树的权限码一起勾上；关掉联动后勾它不再牵连子树', async () => {
    const user = userEvent.setup()
    renderPage(2)
    await expandAll(user)

    // 「系统」自己没有权限码，联动着勾它 = 勾上子树里的所有权限码（setting-manage + role-view）
    await user.click(treeCheckbox('系统'))
    await user.click(screen.getByRole('button', { name: /保\s*存\s*权\s*限/ }))
    await waitFor(() => {
      expect(codesOf(2)).toContain('setting-manage')
      expect(codesOf(2)).toContain('role-view')
    })

    // 关掉联动：再勾一次「系统」只动它自己的权限码（它一个也没有）→ 已授的码原样留着
    await user.click(screen.getByLabelText('privilege-tree-linked'))
    await user.click(treeCheckbox('系统'))
    await user.click(screen.getByRole('button', { name: /保\s*存\s*权\s*限/ }))
    await waitFor(() => {
      expect(codesOf(2)).toContain('setting-manage')
      expect(codesOf(2)).toContain('role-view')
    })
  })

  test('未编入菜单的权限码留在兜底区，仍可勾选保存', async () => {
    const user = userEvent.setup()
    renderPage(2)
    // department-view 不在菜单树里（没有哪个菜单节点带这个码）
    const fallback = await screen.findByLabelText('department-view')
    await waitFor(() => expect((fallback as HTMLInputElement).checked).toBe(true))
    await user.click(screen.getByLabelText('department-edit'))
    await user.click(screen.getByRole('button', { name: /保\s*存\s*权\s*限/ }))
    await waitFor(() => {
      expect(codesOf(2)).toContain('department-edit')
      expect(codesOf(2)).toContain('department-view')
    })
  })
})
