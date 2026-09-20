import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import { isDashboardLayout, parseDashboardLayout, reorderDashboardLayout, visibleDashboardLayout } from '../model'
import MyDashboardPage from '../pages/my-dashboard-page.page'
import { useDashboardLayout } from '../use-dashboard-layout'

/** T-15 可配置地盘：网格渲染、显隐落个人级 setting、换序/损坏回退在重挂载后保持。 */
initI18n()

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1 // admin
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

function renderApp(node: React.ReactNode): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter>{node}</MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

/** 布局 hook 宿主：暴露当前可见序与换序提交，等价于页面拖拽落点后的 commit。 */
function LayoutHarness() {
  const { layout, commit } = useDashboardLayout()
  return (
    <div>
      <span data-testid="visible-order">
        {visibleDashboardLayout(layout)
          .map((item) => item.widget)
          .join(',')}
      </span>
      <button type="button" onClick={() => commit(reorderDashboardLayout(layout, 'myActivities', 'summary'))}>
        move
      </button>
    </div>
  )
}

describe('地盘网格', () => {
  test('六种 widget 全部渲染，卡头提供半栏/通栏与隐藏', async () => {
    renderApp(<MyDashboardPage />)
    await screen.findByRole('button', { name: 'dashboard-handle-summary' })
    for (const widget of ['myTodos', 'myTasks', 'myBugs', 'myStories', 'myActivities']) {
      expect(screen.getByRole('button', { name: `dashboard-size-${widget}` })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: `dashboard-hide-${widget}` })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: `dashboard-handle-${widget}` })).toBeInTheDocument()
    }
  })

  test('隐藏 widget 写个人级 setting 并即时生效', async () => {
    renderApp(<MyDashboardPage />)
    await screen.findByRole('button', { name: 'dashboard-handle-summary' })
    fireEvent.click(screen.getByRole('button', { name: 'dashboard-hide-myStories' }))
    await waitFor(() => {
      const stored = db.settings.get('admin:dashboard.layout')
      expect(isDashboardLayout(stored)).toBe(true)
      expect((stored as { widget: string; visible: boolean }[]).find((i) => i.widget === 'myStories')?.visible).toBe(
        false,
      )
    })
    expect(screen.queryByRole('button', { name: 'dashboard-size-myStories' })).not.toBeInTheDocument()
    // 布局配置面板的勾选框可重新显示
    fireEvent.click(screen.getByRole('checkbox', { name: '需求' }))
    expect(await screen.findByRole('button', { name: 'dashboard-size-myStories' })).toBeInTheDocument()
  })

  test('半栏/通栏切换持久化（full → half）', async () => {
    renderApp(<MyDashboardPage />)
    await screen.findByRole('button', { name: 'dashboard-handle-summary' })
    // summary 缺省通栏：按钮显示「半栏」
    fireEvent.click(screen.getByRole('button', { name: 'dashboard-size-summary' }))
    await waitFor(() => {
      const stored = db.settings.get('admin:dashboard.layout')
      expect((stored as { widget: string; size: string }[]).find((i) => i.widget === 'summary')?.size).toBe('half')
    })
  })
})

describe('布局持久化（个人级 setting）', () => {
  test('换序后重挂载保持（同一账号）', async () => {
    renderApp(<LayoutHarness />)
    expect(await screen.findByTestId('visible-order')).toHaveTextContent(
      'summary,myTodos,myTasks,myBugs,myStories,myActivities',
    )
    fireEvent.click(screen.getByRole('button', { name: 'move' }))
    await waitFor(() => {
      // 本地即时生效 + PUT 落个人级 setting
      expect(parseDashboardLayout(db.settings.get('admin:dashboard.layout'))[0]?.widget).toBe('myActivities')
    })
    expect(screen.getByTestId('visible-order')).toHaveTextContent(
      'myActivities,summary,myTodos,myTasks,myBugs,myStories',
    )
    // 刷新（重挂载 + 新 QueryClient）后从 setting 读回
    cleanup()
    renderApp(<LayoutHarness />)
    await waitFor(() => {
      expect(screen.getByTestId('visible-order')).toHaveTextContent(
        'myActivities,summary,myTodos,myTasks,myBugs,myStories',
      )
    })
  })

  test('布局损坏 → 缺省布局并静默覆写', async () => {
    db.settings.set('admin:dashboard.layout', [{ widget: 'nope' }])
    renderApp(<MyDashboardPage />)
    await screen.findByRole('button', { name: 'dashboard-handle-summary' })
    await waitFor(() => {
      expect(isDashboardLayout(db.settings.get('admin:dashboard.layout'))).toBe(true)
    })
  })

  test('数据接口失败（403）时布局仍回退缺省并可配置', async () => {
    db.currentAccountId = 3 // guest：无 my-view，数据卡 403
    renderApp(<MyDashboardPage />)
    await screen.findByRole('button', { name: 'dashboard-handle-summary' })
    for (const widget of ['myTodos', 'myTasks', 'myBugs', 'myStories', 'myActivities']) {
      expect(screen.getByRole('button', { name: `dashboard-size-${widget}` })).toBeInTheDocument()
    }
  })
})
