import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, grantRolePrivileges, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import MyDashboardPage from '../pages/my-dashboard-page.page'
import TodoBatchCreatePage from '../pages/todo-batch-create-page.page'
import TodoBatchEditPage from '../pages/todo-batch-edit-page.page'
import TodoDetailPage from '../pages/todo-detail-page.page'
import TodoListPage from '../pages/todo-list-page.page'

/** workspace 页面（T-7/T-9）：行动作显隐只认 meta actions × /me 权限码；42203 原样呈现；批量逐行结果。 */
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

const TODO_PRIVILEGES = [
  'todo-view',
  'todo-create',
  'todo-edit',
  'todo-start',
  'todo-finish',
  'todo-activate',
  'todo-close',
  'todo-assign',
  'todo-delete',
  'my-view',
]

function renderPage(page: ReactElement, path: string, entry: string, privileges: string[] = TODO_PRIVILEGES): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={privileges}>
            <MemoryRouter initialEntries={[entry]}>
              <Routes>
                <Route path={path} element={page} />
                <Route path="/my/tasks" element={<div>my-tasks-stub</div>} />
              </Routes>
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('待办列表页', () => {
  // 日期范围是筛选条件之一：一律下拉（用户裁决 2026-09-19：列表页不用按钮/页签做筛选）
  test('日期范围下拉（今天/本周/待定/全部），按所选范围列出归属待办', async () => {
    renderPage(<TodoListPage />, '/my/todos', '/my/todos?tab=all')
    const date = screen.getByLabelText('日期')
    expect(date).toBeInTheDocument()
    expect(await screen.findByText('Prepare Sprint 1 acceptance materials')).toBeInTheDocument()
    // 归属规则（§7）：他人待办不入列
    expect(screen.queryByText('Review login API integration results')).not.toBeInTheDocument()
  })

  test('日期范围取值走 URL：待定只列无日期待办', async () => {
    renderPage(<TodoListPage />, '/my/todos', '/my/todos?tab=undated&role=assigned')
    expect(await screen.findByText('History: upgrade build deps')).toBeInTheDocument()
    expect(screen.queryByText('Prepare Sprint 1 acceptance materials')).not.toBeInTheDocument()
  })

  test('行动作由 meta actions.allowedStatus 驱动（doing 行有完成/关闭/指派，无开始/激活）', async () => {
    renderPage(<TodoListPage />, '/my/todos', '/my/todos?tab=all')
    const title = await screen.findByText('Prepare Sprint 1 acceptance materials')
    const row = within(title.closest('tr') as HTMLElement)
    expect(row.getByRole('button', { name: /完\s*成/ })).toBeInTheDocument()
    expect(row.getByRole('button', { name: /关\s*闭/ })).toBeInTheDocument()
    expect(row.getByRole('button', { name: /指\s*派/ })).toBeInTheDocument()
    expect(row.queryByRole('button', { name: /开\s*始/ })).not.toBeInTheDocument()
    expect(row.queryByRole('button', { name: /激\s*活/ })).not.toBeInTheDocument()
  })

  test('无权限码时行动作与建单入口整体隐藏（显隐只认 /me privileges）', async () => {
    renderPage(<TodoListPage />, '/my/todos', '/my/todos?tab=all', ['my-view'])
    await screen.findByText('Prepare Sprint 1 acceptance materials')
    expect(screen.queryByRole('button', { name: /完\s*成/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /指\s*派/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /新\s*建\s*待\s*办/ })).not.toBeInTheDocument()
  })

  test('点「完成」走状态机动作端点', async () => {
    renderPage(<TodoListPage />, '/my/todos', '/my/todos?tab=all')
    const title = await screen.findByText('Prepare Sprint 1 acceptance materials')
    fireEvent.click(within(title.closest('tr') as HTMLElement).getByRole('button', { name: /完\s*成/ }))
    await waitFor(() => expect(db.todos.find((item) => item.id === 1)?.status).toBe('done'))
    expect(db.todos.find((item) => item.id === 1)?.finishedBy).toBe('admin')
  })

  test('指派给本人：42203 错误信息原样呈现', async () => {
    renderPage(<TodoListPage />, '/my/todos', '/my/todos?tab=all')
    const title = await screen.findByText('Prepare Sprint 1 acceptance materials')
    fireEvent.click(within(title.closest('tr') as HTMLElement).getByRole('button', { name: /指\s*派/ }))
    fireEvent.mouseDown(screen.getByLabelText('todo-assign-assignee'))
    fireEvent.click(await screen.findByText('Admin User(admin)'))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /提\s*交/ }))
    expect(await screen.findByText('操作条件不满足，请确认对象状态后重试。')).toBeInTheDocument()
  })
})

describe('待办批量页', () => {
  test('整表提交后逐行回填新建 id', async () => {
    renderPage(<TodoBatchCreatePage />, '/todos/batch-create', '/todos/batch-create')
    fireEvent.change(await screen.findByLabelText('todo-title-1'), { target: { value: '批量一' } })
    fireEvent.change(screen.getByLabelText('todo-title-2'), { target: { value: '批量二' } })
    // 类型选项来自 GET /dicts/todoType（服务端只给值，文案本地映射）
    expect(await screen.findAllByText('自定义')).not.toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /提\s*交/ }))
    expect(await screen.findByText('2/2')).toBeInTheDocument()
    expect(db.todos.filter((item) => item.title.startsWith('批量'))).toHaveLength(2)
  })

  test('批量操作未带 ids 时提示先勾选', async () => {
    renderPage(<TodoBatchEditPage />, '/todos/batch-edit', '/todos/batch-edit')
    expect(await screen.findByText('请先在列表勾选待办。')).toBeInTheDocument()
  })
})

describe('地盘首页', () => {
  test('计数卡按 /my/summary 渲染，点击跳对应 /my/* 列表', async () => {
    renderPage(<MyDashboardPage />, '/my', '/my')
    expect(await screen.findByText('我的待办')).toBeInTheDocument()
    expect(screen.getByText('我的任务')).toBeInTheDocument()
    expect(screen.getByText('我的 Bug')).toBeInTheDocument()
    expect(screen.getByText('我的需求')).toBeInTheDocument()
    // admin 名下 wait/doing 待办 2 条（§3.4 role=assignee 口径）
    const todoCard = screen.getByText('我的待办').closest('.ant-card') as HTMLElement
    expect(within(todoCard).getByText('2')).toBeInTheDocument()
    fireEvent.click(screen.getByText('我的任务'))
    expect(await screen.findByText('my-tasks-stub')).toBeInTheDocument()
  })
})

describe('待办详情动态页签（B-WKS-05：GET /todos/{id}/activities）', () => {
  test('动态页签列出该待办的动态（objectType=todo 游标倒序）', async () => {
    db.activities.push({
      id: 9001,
      objectType: 'todo',
      objectId: 1,
      actor: 'admin',
      action: 'created',
      detail: null,
      remark: null,
      occurredAt: '2026-09-18T01:00:00Z',
    })
    renderPage(<TodoDetailPage />, '/todos/:todoId', '/todos/1')
    expect(await screen.findByText('Prepare Sprint 1 acceptance materials')).toBeInTheDocument()
    // 描述页签为默认；动态页签经 platform ActivityTimeline 渲染动态文案（actor admin 在页头字段区也出现，取全部）
    fireEvent.click(screen.getByRole('tab', { name: /动\s*态/ }))
    expect(await screen.findByText('创建')).toBeInTheDocument()
    expect(screen.getAllByText('admin').length).toBeGreaterThan(0)
  })
})

describe('待办删除入口（V-01 接线）', () => {
  /** 详情页删除成功后 navigate('/my/todos')，需要列表侧路由承接断言。 */
  function renderDetail(privileges: string[]): void {
    render(
      <ConfigProvider theme={createTheme()}>
        <AppProvider>
          <QueryClientProvider client={createQueryClient()}>
            <PermScope privileges={privileges}>
              <MemoryRouter initialEntries={['/todos/1']}>
                <Routes>
                  <Route path="/todos/:todoId" element={<TodoDetailPage />} />
                  <Route path="/my/todos" element={<div>todo-list-stub</div>} />
                </Routes>
              </MemoryRouter>
            </PermScope>
          </QueryClientProvider>
        </AppProvider>
      </ConfigProvider>,
    )
  }

  test('创建人二次确认后软删并回待办列表', async () => {
    renderDetail(TODO_PRIVILEGES)
    expect(await screen.findByText('Prepare Sprint 1 acceptance materials')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('已删除')).toBeInTheDocument()
    await waitFor(() => expect(db.todos.find((item) => item.id === 1)?.deletedAt).not.toBeNull())
    expect(await screen.findByText('todo-list-stub')).toBeInTheDocument()
  })

  test('非创建人/负责人 → 40302 数据权限文案，待办保留', async () => {
    db.currentAccountId = 2 // dev1：非 todo 1 的创建人/负责人且非超管
    grantRolePrivileges(2, ['todo-view', 'todo-delete'])
    renderDetail(['todo-view', 'todo-delete'])
    expect(await screen.findByText('Prepare Sprint 1 acceptance materials')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('没有访问该数据的权限。')).toBeInTheDocument()
    expect(db.todos.find((item) => item.id === 1)?.deletedAt).toBeNull()
  })
})
