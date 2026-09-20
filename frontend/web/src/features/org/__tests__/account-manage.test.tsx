import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, antdLocaleZhCN, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import AccountListPage from '../pages/account-list-page.page'
import DepartmentListPage from '../pages/department-list-page.page'

const DEPARTMENT_PRIVS = ['department-view', 'department-create', 'department-edit', 'department-delete']

const pick = (elements: HTMLElement[], index = 0): HTMLElement => {
  const el = elements.at(index)
  if (!el) {
    throw new Error(`no matching element at ${index}`)
  }
  return el
}

/** A-01 账号管理接线：新建/编辑弹窗、@me 改密、重置、删除守卫；部门列表真实删除。 */
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

function renderPage(page: React.ReactElement, entry = '/org/accounts', privileges: string[] = []) {
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

/** 行定位：按名称列的链接式按钮定位所在表格行（parentName 列会重复出现同一部门名，故不按文本查）。 */
function rowOf(name: string): HTMLElement {
  const row = screen.getByRole('button', { name }).closest('tr')
  if (!row) {
    throw new Error(`no table row around ${name}`)
  }
  return row
}

describe('AccountListPage 账号管理接线', () => {
  test('登录名即详情入口：名称单元格是真链接，操作列不再有「详情」', async () => {
    renderPage(<AccountListPage />)
    // 用户要求 2026-09-20：点登录名进 /org/accounts/{id}，行内「详情」按钮删除
    expect(await screen.findByRole('link', { name: 'guest' })).toHaveAttribute('href', '/org/accounts/3')
    expect(screen.queryByRole('button', { name: /详\s*情/ })).not.toBeInTheDocument()
  })

  test('新建弹窗：必填齐备后提交，列表出现新账号', async () => {
    const user = userEvent.setup()
    renderPage(<AccountListPage />)
    await screen.findByText('Dev One')
    await user.click(screen.getByRole('button', { name: /org\.account\.action\.create|创建账号/ }))
    await user.type(await screen.findByLabelText('account-create-account'), 'newbie01')
    await user.type(screen.getByLabelText('account-create-password'), 'pass1234')
    await user.type(screen.getByLabelText('account-create-realName'), '新建甲')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    expect(await screen.findByText('newbie01')).toBeInTheDocument()
    expect(db.accounts.some((account) => account.account === 'newbie01')).toBe(true)
  })

  test('编辑弹窗：登录名只读，改名后列表刷新', async () => {
    const user = userEvent.setup()
    renderPage(<AccountListPage />)
    await screen.findByText('Dev One')
    await user.click(pick(screen.getAllByRole('button', { name: /编\s*辑/ })))
    const realName = await screen.findByLabelText('account-edit-realName')
    expect(realName).toHaveValue('Guest User')
    expect(screen.getByLabelText('account-edit-account')).toBeDisabled()
    await user.clear(realName)
    await user.type(realName, '访客改')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    expect(await screen.findByText('访客改')).toBeInTheDocument()
  })

  test('@me 行内改密弹窗：旧密码校验通过后落库', async () => {
    const user = userEvent.setup()
    renderPage(<AccountListPage />)
    await screen.findByText('Admin User')
    await user.click(screen.getByRole('button', { name: /org\.account\.action\.password|修改密码/ }))
    await user.type(await screen.findByLabelText('account-password-old'), 'admin123')
    await user.type(screen.getByLabelText('account-password-new'), 'newpass123')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      expect(db.accounts.find((account) => account.id === 1)?.password).toBe('newpass123')
    })
  })

  test('改密旧密码错误：展示服务端 42201 文案', async () => {
    const user = userEvent.setup()
    renderPage(<AccountListPage />)
    await screen.findByText('Admin User')
    await user.click(screen.getByRole('button', { name: /org\.account\.action\.password|修改密码/ }))
    await user.type(await screen.findByLabelText('account-password-old'), 'wrong-old')
    await user.type(screen.getByLabelText('account-password-new'), 'newpass123')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    expect(await screen.findByText('提交内容未通过校验，请检查表单。')).toBeInTheDocument()
  })

  test('重置密码弹窗：随机生成可填入，重置后通知本人', async () => {
    const user = userEvent.setup()
    renderPage(<AccountListPage />)
    await screen.findByText('Dev One')
    // 行序 id 倒序：guest(3) 在首行
    await user.click(pick(screen.getAllByRole('button', { name: /org\.account\.action\.resetPassword|重置密码/ })))
    const input = await screen.findByLabelText('account-reset-password')
    await user.type(input, 'reset123456')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      expect(db.accounts.find((account) => account.id === 3)?.password).toBe('reset123456')
      expect(
        db.notifications.some((item) => item.recipient === 'guest' && item.type === 'account-reset-password'),
      ).toBe(true)
    })
  })

  test('删除守卫：本人/admin 行无删除按钮，删除他人走软删', async () => {
    const user = userEvent.setup()
    renderPage(<AccountListPage />)
    await screen.findByText('Guest User')
    // 3 行账号，仅 guest/dev1 两行有删除（admin=本人不可删）
    expect(screen.getAllByRole('button', { name: /删\s*除/ }).length).toBe(2)
    await user.click(pick(screen.getAllByRole('button', { name: /删\s*除/ })))
    // 守卫提示文案 + 确认删除（Modal 挂载在 body 末尾，取最后一个）
    expect(await screen.findByText(/org\.account\.deleteGuard|不可删除本人/)).toBeInTheDocument()
    const confirm = screen.getAllByRole('button', { name: /删\s*除/ }).at(-1) as HTMLElement
    await user.click(confirm)
    await waitFor(() => {
      expect(screen.queryByText('Guest User')).not.toBeInTheDocument()
      expect(db.accounts.find((account) => account.id === 3)?.deletedAt).not.toBeNull()
    })
  })
})

describe('DepartmentListPage 真实删除', () => {
  test('有子部门的删除被 42203 拦截并保留；空部门二次确认后删除', async () => {
    const user = userEvent.setup()
    db.departments.push({
      id: 99,
      name: '空部门',
      parentId: null,
      path: ',99,',
      grade: 1,
      sort: 5,
      manager: null,
    })
    renderPage(<DepartmentListPage />, '/org/departments', DEPARTMENT_PRIVS)
    // 总部（id=1）有子部门 → 确认框写明守卫规则，服务端 42203 toast，行保留
    await screen.findByRole('button', { name: 'Headquarters' })
    await user.click(within(rowOf('Headquarters')).getByRole('button', { name: /删\s*除/ }))
    expect(await screen.findByText('有子部门的部门不可删除。', undefined, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('部门下存在成员时不可删除。')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /确\s*定/ }, { timeout: 3000 }))
    expect(
      await screen.findAllByText('操作条件不满足，请确认对象状态后重试。', undefined, { timeout: 3000 }),
    ).toBeTruthy()
    expect(db.departments.some((department) => department.id === 1)).toBe(true)

    // 空部门（id=99，无子无成员）→ DELETE 成功后行消失
    await user.click(within(rowOf('空部门')).getByRole('button', { name: /删\s*除/ }))
    await user.click(await screen.findByRole('button', { name: /确\s*定/ }, { timeout: 3000 }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '空部门' })).not.toBeInTheDocument()
      expect(db.departments.some((department) => department.id === 99)).toBe(false)
    })
    expect(await screen.findByText('部门已删除。', undefined, { timeout: 3000 })).toBeInTheDocument()
  })
})
