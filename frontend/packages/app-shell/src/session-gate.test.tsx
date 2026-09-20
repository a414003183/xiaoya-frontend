// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { SessionGate } from './session-gate'

/** 06 A7-5 首登强制改密：会话门禁在 mustChangePassword 为真时把业务路由重定向到 /my/profile。 */

initI18n()

function stubMe(mustChangePassword: boolean): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              account: {
                id: 1,
                account: 'admin',
                realName: '管理员',
                gender: 'm',
                status: 'active',
                mustChangePassword,
                groupIds: [1],
                fails: 0,
                createdAt: '2026-01-01T00:00:00Z',
                lockVersion: 0,
              },
              privileges: ['account-view'],
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    ),
  )
}

function renderGate(initialEntry: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <SessionGate />,
        children: [
          { path: 'my', element: <div>business-page</div> },
          { path: 'my/profile', element: <div>profile-page</div> },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  )
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>
    </QueryClientProvider>,
  )
  return router
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('首登未改密：业务路由被重定向到 /my/profile 并提示', async () => {
  stubMe(true)
  const router = renderGate('/my')

  expect(await screen.findByText('profile-page')).toBeInTheDocument()
  expect(screen.queryByText('business-page')).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/my/profile')
  expect(await screen.findByText('首次登录须先修改初始口令，才能进入其他页面。')).toBeInTheDocument()
})

test('已改密（标记为假）：业务路由照常放行', async () => {
  stubMe(false)
  const router = renderGate('/my')

  expect(await screen.findByText('business-page')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/my')
})

test('标记缺失（旧后端/契约可选字段）：不拦，照常放行', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              account: {
                id: 1,
                account: 'admin',
                realName: '管理员',
                gender: 'm',
                status: 'active',
                groupIds: [1],
                fails: 0,
                createdAt: '2026-01-01T00:00:00Z',
                lockVersion: 0,
              },
              privileges: [],
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    ),
  )
  const router = renderGate('/my')

  expect(await screen.findByText('business-page')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/my')
})
