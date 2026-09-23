import { QueryClientProvider, useQuery } from '@tanstack/react-query'
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
import { fetchMenuRoutes, MENU_ROUTES_KEY } from '../api/platform.api'
import MenuListPage from '../pages/menu-list-page.page'

/**
 * T68 / FE-01 回归：菜单保存后**动态路由表**必须重取。
 *
 * 路由表的取数形态与 `app/app-router.tsx` 一致（同一 queryKey + `staleTime: Infinity`），
 * 故这里用一个探针组件复刻那个观测者——它读到的路径就是侧栏点击时用的路径。
 * 旧 bug：保存只失效菜单树与侧栏，路由表停在旧路径 → 侧栏跳到新路径 404。
 */
initI18n()

const PRIVS = ['menu-manage']

const server = setupServer(...handlers)

/** `/menus/routes` 的请求次数（重取与否的唯一硬证据）。 */
let routesRequests = 0
server.events.on('request:start', ({ request }) => {
  if (request.method === 'GET' && request.url.includes('/api/v1/menus/routes')) {
    routesRequests += 1
  }
})

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  routesRequests = 0
  db.sessionActive = true
  db.currentAccountId = 1
})
afterEach(() => {
  cleanup()
  destroyStaticMessages()
  server.resetHandlers()
})
afterAll(() => server.close())

/** app-router 的路由表观测者（同 key、同 staleTime）。 */
function RoutesProbe() {
  const routes = useQuery({
    queryKey: MENU_ROUTES_KEY,
    queryFn: fetchMenuRoutes,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const dictPath = routes.data?.items.find((item) => item.title === 'platform.dict.title')?.path
  return <div data-testid="probe-path">{dictPath ?? ''}</div>
}

function renderPage() {
  return render(
    <ConfigProvider theme={createTheme()} locale={antdLocaleZhCN}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={PRIVS}>
            <MemoryRouter initialEntries={['/admin/menus']}>
              <MenuListPage />
              <RoutesProbe />
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('菜单保存 → 路由表缓存失效（FE-01）', () => {
  test('改菜单路径后路由表重取，探针读到新路径', async () => {
    const user = userEvent.setup()
    renderPage()

    // 首屏：路由表取一次，探针读到的还是内置路径（探针节点先挂载、数据后到，故用 waitFor）
    await waitFor(() => expect(screen.getByTestId('probe-path')).toHaveTextContent('/admin/dicts'))
    expect(routesRequests).toBe(1)

    await user.click(await screen.findByRole('button', { name: '展开全部' }))
    const row = (await screen.findByText('字典管理')).closest('tr') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /编\s*辑/ }))

    const path = await screen.findByLabelText('menu-form-path')
    await user.clear(path)
    await user.type(path, '/admin/dicts-v2')
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))

    // 保存成功 = 覆盖行落库 + 路由表失效（没有这一条失效，请求数会停在 1）
    await waitFor(() => expect(db.menus[0]?.path).toBe('/admin/dicts-v2'))
    await waitFor(() => expect(routesRequests).toBe(2))
    await waitFor(() => expect(screen.getByTestId('probe-path')).toHaveTextContent('/admin/dicts-v2'))
  })
})
