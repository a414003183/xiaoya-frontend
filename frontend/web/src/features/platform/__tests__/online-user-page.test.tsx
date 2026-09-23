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
import { platformHandlers } from '../../../mocks/platform-handlers'
import OnlineUserListPage from '../pages/online-user-list-page.page'

initI18n()

const server = setupServer(...platformHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  // id=1 = admin（超管组）：自己那条会话在列表里标「当前会话」
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
          <MemoryRouter initialEntries={['/admin/online-users']}>
            {/* 权限码由 /me 注入 PermScope：页面上的强退入口只认它（真鉴权在后端） */}
            <PermScope privileges={['online-user-view', 'online-user-kick']}>
              <OnlineUserListPage />
            </PermScope>
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

/** 按钮名：antd 会给两个汉字之间插空格（「强退」→「强 退」），故一律用宽松正则匹配。 */
const KICK = /强\s*退/
const SEARCH = /搜\s*索/
const CONFIRM = /^(OK|确定)$/

describe('OnlineUserListPage（T13 P1-1）', () => {
  test('列出在线会话：自己那条标「当前会话」且不给强退入口，别人的行才可强退', async () => {
    renderPage()
    expect(await screen.findByText('dev1')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('当前会话')).toBeInTheDocument()
    // 只剩 dev1 那行有强退按钮
    expect(screen.getAllByRole('button', { name: KICK })).toHaveLength(1)
    const adminRow = screen.getByText('admin').closest('tr')
    expect(adminRow).not.toBeNull()
    expect(within(adminRow as HTMLElement).queryByRole('button', { name: KICK })).not.toBeInTheDocument()
  })

  test('强退：确认后该会话从列表消失（后端删行，列表重取）', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: KICK }))
    await user.click(await screen.findByRole('button', { name: CONFIRM }))
    await waitFor(() => expect(screen.queryByText('dev1')).not.toBeInTheDocument())
    expect(db.onlineUsers.map((row) => row.account)).toEqual(['admin'])
  })

  test('按账号筛选：只留匹配行', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('dev1')
    await user.type(screen.getByLabelText('账号'), 'dev1')
    await user.click(screen.getByRole('button', { name: SEARCH }))
    await waitFor(() => expect(screen.queryByText('admin')).not.toBeInTheDocument())
    expect(screen.getByText('dev1')).toBeInTheDocument()
  })
})
