import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import RoleListPage from '../pages/role-list-page.page'

const pick = (elements: HTMLElement[], index = 0): HTMLElement => {
  const el = elements.at(index)
  if (!el) {
    throw new Error(`no matching element at ${index}`)
  }
  return el
}

/** A-08 组编辑/复制/数据权限接线（2026-09-20 起组列表是 /admin/roles 的「角色」页签）。 */
initI18n()

/** 行内写动作按权限码显隐（角色页签 HasPerm）：测试给足组维护四码 + group-view（页签可见性）。 */
const PRIVILEGES = ['role-view', 'group-view', 'group-create', 'group-edit', 'group-copy', 'group-delete', 'group-acl']

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

function renderPage() {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={PRIVILEGES}>
            <MemoryRouter initialEntries={['/admin/roles?tab=roles']}>
              <RoleListPage />
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('角色页签（原 GroupListPage）编辑/复制/数据权限', () => {
  test('编辑弹窗：改名带 lockVersion 落库', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Members')
    await user.click(pick(screen.getAllByRole('button', { name: /编\s*辑/ })))
    const name = await screen.findByLabelText('group-form-name')
    expect(name).toHaveValue('Admins')
    await user.clear(name)
    await user.type(name, '超管组')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      expect(db.groups.find((group) => group.id === 1)?.name).toBe('超管组')
      expect(db.groups.find((group) => group.id === 1)?.lockVersion).toBe(1)
    })
  })

  test('复制弹窗：默认勾选权限与成员，复制出新组', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Members')
    // 第二行 = 成员组（id=2）
    await user.click(pick(screen.getAllByRole('button', { name: /org\.group\.action\.copy|复\s*制/ }), 1))
    const name = await screen.findByLabelText('group-copy-name')
    await user.clear(name)
    await user.type(name, '成员副本')
    const privilegeCheck = screen.getByRole('checkbox', { name: /org\.group\.copy\.privileges|复制权限/ })
    expect(privilegeCheck).toBeChecked()
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      const copied = db.groups.find((group) => group.name === '成员副本')
      expect(copied).toBeDefined()
      expect(copied?.memberIds).toEqual([2])
      expect(copied?.privCodes).toEqual(['account-view', 'department-view'])
    })
  })

  test('数据权限弹窗：勾选产品后 acl 整体替换落库', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Members')
    // 第二行 = 成员组（id=2）
    await user.click(pick(screen.getAllByRole('button', { name: /org\.group\.action\.acl|数据权限/ }), 1))
    await screen.findByLabelText('group-acl-products')
    fireEvent.mouseDown(screen.getByLabelText('group-acl-products'))
    // 远程搜索候选来自 listProducts（种子：禅道产品/云平台/已归档产品）
    const option = await screen.findByText('Demo Product', {}, { timeout: 3000 })
    fireEvent.click(option)
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      expect(db.groups.find((group) => group.id === 2)?.acl?.products).toContain(1)
    })
  })
})
