import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { type NavigationSection, navigation } from '../../../app/routes'
import { db, resetMockData } from '../../../mocks/db'
import { platformHandlers } from '../../../mocks/platform-handlers'
import AuditLogListPage from '../pages/audit-log-list-page.page'
import LoginLogListPage from '../pages/login-log-list-page.page'

initI18n()

const AUDIT_PRIVS = ['audit-log-view']

const server = setupServer(...platformHandlers)

/** 审计流水 GET 请求留痕：断言 page/limit/q/filters[x] 由前端下发、过滤由服务端做。 */
const auditQueries: string[] = []
server.events.on('request:start', ({ request }) => {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/v1/audit-logs') {
    auditQueries.push(request.url)
  }
})

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  auditQueries.length = 0
  db.sessionActive = true
  db.currentAccountId = 1 // admin：持有全部权限码（含 audit-log-view）
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

function renderPage(page: React.ReactElement, entry: string, privileges: string[] = []) {
  return render(
    <ConfigProvider theme={createTheme()}>
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

/** 最近一次审计请求的查询参数。 */
function lastQuery(): URLSearchParams {
  return new URL(auditQueries[auditQueries.length - 1] ?? '', 'http://mock').searchParams
}

describe('AuditLogListPage（操作日志）', () => {
  test('渲染种子流水：操作人 / 动作 / 对象 / 时间', async () => {
    renderPage(<AuditLogListPage />, '/admin/audit-logs', AUDIT_PRIVS)

    expect(await screen.findByText('account-create')).toBeInTheDocument()
    expect(screen.getByText('login')).toBeInTheDocument()
    expect(screen.getByText('login-failed')).toBeInTheDocument()
    expect(screen.getAllByText('admin').length).toBeGreaterThan(0)
    // 对象列把 objectType 与 objectId 合成一格
    expect(screen.getByText('account #2')).toBeInTheDocument()
    expect(screen.getByText(new Date('2026-09-04T10:00:00Z').toLocaleString())).toBeInTheDocument()
  })

  test('关键词 + 搜索：q 下发到请求，命中行留下、未命中行消失', async () => {
    const user = userEvent.setup()
    renderPage(<AuditLogListPage />, '/admin/audit-logs', AUDIT_PRIVS)
    await screen.findByText('login-failed')

    await user.type(screen.getByLabelText('操作人'), 'account-create')
    await user.click(screen.getByRole('button', { name: /搜\s*索/ }))

    await waitFor(() => {
      expect(lastQuery().get('q')).toBe('account-create')
    })
    await waitFor(() => {
      expect(screen.queryByText('login-failed')).not.toBeInTheDocument()
    })
    expect(screen.getByText('account-create')).toBeInTheDocument()
  })

  test('缺少 audit-log-view：接口 403，页面呈现无权文案且无行', async () => {
    db.currentAccountId = 2 // dev1：只有 account-view / department-view
    renderPage(<AuditLogListPage />, '/admin/audit-logs')

    expect(await screen.findByText('没有执行该操作的权限。')).toBeInTheDocument()
    expect(screen.queryByText('login-failed')).not.toBeInTheDocument()
  })
})

describe('LoginLogListPage（登录日志）', () => {
  test('恒带 filters[action]=login,login-failed：成功与失败行都渲染，写流水不出现', async () => {
    renderPage(<LoginLogListPage />, '/admin/login-logs', AUDIT_PRIVS)

    expect(await screen.findByText('login-failed')).toBeInTheDocument()
    expect(screen.getByText('login')).toBeInTheDocument()
    expect(screen.queryByText('account-create')).not.toBeInTheDocument()
    expect(lastQuery().get('filters[action]')).toBe('login,login-failed')
  })

  test('预设不可编辑：URL 上手写 filters[action] 被覆盖', async () => {
    renderPage(<LoginLogListPage />, '/admin/login-logs?filters[action]=account-create', AUDIT_PRIVS)

    expect(await screen.findByText('login')).toBeInTheDocument()
    expect(lastQuery().get('filters[action]')).toBe('login,login-failed')
    expect(screen.queryByText('account-create')).not.toBeInTheDocument()
  })
})

describe('审计日志两页的路由/菜单（route-codegen 产物）', () => {
  test('挂在「系统 → 审计日志」分区，权限码 audit-log-view', () => {
    const section = navigation
      .flatMap((group) => group.children)
      .find((child): child is NavigationSection => 'key' in child && child.key === 'admin/audit')

    expect(section?.children.map((item) => [item.path, item.perm])).toEqual([
      ['/admin/audit-logs', 'audit-log-view'],
      ['/admin/login-logs', 'audit-log-view'],
    ])
  })
})
