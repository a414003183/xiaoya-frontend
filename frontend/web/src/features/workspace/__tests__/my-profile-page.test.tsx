import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import MyProfilePagePage from '../pages/my-profile-page.page'

/** B-WKS-03 /my/profile：资料读写、account-edit 显隐、@me 改密。 */
initI18n()

const server = setupServer(...handlers)

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

function renderPage() {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter>
            <MyProfilePagePage />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('MyProfilePagePage', () => {
  test('admin 可编辑：改名保存落库', async () => {
    db.currentAccountId = 1
    const user = userEvent.setup()
    renderPage()
    const realName = await screen.findByLabelText('my-profile-realName')
    await waitFor(() => {
      expect(realName).toHaveValue('Admin User')
    })
    await user.clear(realName)
    await user.type(realName, '管理员大')
    await user.click(screen.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => {
      expect(db.accounts.find((account) => account.id === 1)?.realName).toBe('管理员大')
    })
  })

  test('无 account-edit 码：只读提示、字段禁用、无保存按钮', async () => {
    db.currentAccountId = 2 // dev1：仅 account-view/department-view
    renderPage()
    const realName = await screen.findByLabelText('my-profile-realName')
    await waitFor(() => {
      expect(realName).toHaveValue('Dev One')
    })
    expect(realName).toBeDisabled()
    expect(screen.getByLabelText('my-profile-email')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /保\s*存/ })).not.toBeInTheDocument()
    expect(screen.getByText(/my\.profile\.readonlyHint|没有权限/)).toBeInTheDocument()
  })

  test('@me 改密弹窗：旧密码校验通过后落库', async () => {
    db.currentAccountId = 2
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText('my-profile-realName')
    await user.click(screen.getByRole('button', { name: /org\.account\.action\.password|修改密码/ }))
    await user.type(await screen.findByLabelText('account-password-old'), 'admin123')
    await user.type(screen.getByLabelText('account-password-new'), 'dev1pass9')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      expect(db.accounts.find((account) => account.id === 2)?.password).toBe('dev1pass9')
    })
  })
})
