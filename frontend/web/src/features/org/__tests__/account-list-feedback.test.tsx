import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
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
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import AccountListPage from '../pages/account-list-page.page'

/**
 * T69 / FE-02 回归：账号行内「启用/停用/解锁」失败必须在界面上有回音。
 *
 * 失败样本走真实链路：只给 `account-view`（列表可见、动作不可用），mock 的
 * `/accounts/{id}/disable` 会按权限码回 40301——旧实现（无 onError、`void mutateAsync`）
 * 的表现是「点了没反应 + 未处理拒绝」，现在是按错误码映射的提示。
 */
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
  destroyStaticMessages()
  server.resetHandlers()
})
afterAll(() => server.close())

function renderPage(privileges: string[]) {
  return render(
    <ConfigProvider theme={createTheme()} locale={antdLocaleZhCN}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={privileges}>
            <MemoryRouter initialEntries={['/org/accounts']}>
              <AccountListPage />
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

/** 行定位（同 account-manage.test.tsx：名称列是真链接，按它定位所在行；等列表取数到位）。 */
async function rowOf(account: string): Promise<HTMLElement> {
  const row = (await screen.findByRole('link', { name: account })).closest('tr')
  if (!row) {
    throw new Error(`no table row around ${account}`)
  }
  return row
}

describe('账号行内动作的失败面（T69）', () => {
  test('停用被拒（40302 数据权限）：弹出按错误码映射的文案，不是静默', async () => {
    // mock 的权限判定看会话账号（admin 全码），故显式把该端点改成拒绝：失败样本才是被测对象
    server.use(
      http.post('*/api/v1/accounts/:accountId/disable', () =>
        HttpResponse.json({ error: { code: 40302, message: '', traceId: 'test' } }, { status: 403 }),
      ),
    )
    const user = userEvent.setup()
    renderPage(['account-view'])

    await user.click(within(await rowOf('guest')).getByRole('button', { name: /停\s*用/ }))

    expect(await screen.findByText('没有访问该数据的权限。')).toBeInTheDocument()
  })

  test('有权停用：成功路径不变，目标账号变成停用态', async () => {
    const user = userEvent.setup()
    renderPage(['account-view', 'account-disable'])

    await user.click(within(await rowOf('guest')).getByRole('button', { name: /停\s*用/ }))

    await screen.findByText('停用')
    expect(db.accounts.find((item) => item.account === 'guest')?.status).toBe('disabled')
  })
})
