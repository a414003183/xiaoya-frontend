import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import TaskBatchCreatePage from '../pages/task-batch-create-page.page'
import TaskBatchEditPage from '../pages/task-batch-edit-page.page'
import TaskDetailPage from '../pages/task-detail-page.page'
import TaskListPage from '../pages/task-list-page.page'

/** task 域页面冒烟（T-10/T-11）：MSW 下渲染列表（树状/平铺）/详情动作区/两个批量页。 */
initI18n()

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1 // admin：超管组，全权限码
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

const PRIVILEGES = [
  'task-view',
  'task-create',
  'task-edit',
  'task-start',
  'task-finish',
  'task-pause',
  'task-resume',
  'task-cancel',
  'task-close',
  'task-activate',
  'task-assign',
  'task-effort',
  'task-effort-edit',
  'task-effort-delete',
  'task-delete',
]

function renderPage(page: ReactElement, path: string, entry: string): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={PRIVILEGES}>
            <MemoryRouter initialEntries={[entry]}>
              <Routes>
                <Route path={path} element={page} />
                <Route path="/executions/:executionId/tasks" element={<div>task-list-stub</div>} />
              </Routes>
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('任务列表页', () => {
  test('树状视图按 parentId 折叠展示子任务并可新建', async () => {
    renderPage(<TaskListPage />, '/executions/:executionId/tasks', '/executions/5/tasks')
    expect((await screen.findAllByText('Login API integration')).length).toBeGreaterThan(0)
    expect(screen.getByText('Captcha API implementation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新\s*建\s*任\s*务/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /批\s*量\s*创\s*建/ })).toBeInTheDocument()
  })

  test('平铺视图保留行并可切换到批量操作入口', async () => {
    const user = userEvent.setup()
    renderPage(<TaskListPage />, '/executions/:executionId/tasks', '/executions/5/tasks')
    expect((await screen.findAllByText('WeCom login research')).length).toBeGreaterThan(0)

    await user.click(screen.getByText('平铺'))
    expect((await screen.findAllByText('Login API integration')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /批\s*量\s*操\s*作/ })).toBeDisabled()
  })
})

describe('任务详情页', () => {
  test('页头动作区按 meta allowedStatus 渲染，页签含子任务/工时/动态', async () => {
    const user = userEvent.setup()
    renderPage(<TaskDetailPage />, '/tasks/:taskId', '/tasks/1')
    expect((await screen.findAllByText('Login API integration')).length).toBeGreaterThan(0)
    // doing 的父任务：可暂停/取消/关闭/指派，不可开始/完成
    expect(screen.getByRole('button', { name: /暂\s*停/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /关\s*闭/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /开\s*始/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /完\s*成/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '子任务' }))
    expect(await screen.findByText('Captcha API implementation')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '工时' }))
    expect(await screen.findByText('API review')).toBeInTheDocument()
  })

  test('wait 的普通任务出「开始」而不出关闭/激活', async () => {
    renderPage(<TaskDetailPage />, '/tasks/:taskId', '/tasks/2')
    expect(await screen.findByRole('button', { name: /开\s*始/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /关\s*闭/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /激\s*活/ })).not.toBeInTheDocument()
  })

  test('附件页签按 objectType=task 接线（A-02：列表 + 上传入口）', async () => {
    db.files.push({
      id: 601,
      title: '任务附件说明.txt',
      extension: 'txt',
      size: 12,
      objectType: 'task',
      objectId: 1,
      downloads: 0,
      createdBy: 'admin',
      createdAt: '2026-09-19T00:00:00Z',
      deletedAt: null,
    })
    const user = userEvent.setup()
    renderPage(<TaskDetailPage />, '/tasks/:taskId', '/tasks/1')
    expect((await screen.findAllByText('Login API integration')).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('tab', { name: /附\s*件/ }))
    expect(await screen.findByText('任务附件说明.txt')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上传附件' })).toBeInTheDocument()
  })
})

describe('任务删除入口（V-01 接线）', () => {
  test('父任务有未删子任务 → 42203 守卫文案，任务保留', async () => {
    renderPage(<TaskDetailPage />, '/tasks/:taskId', '/tasks/1')
    expect((await screen.findAllByText('Login API integration')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('操作条件不满足，请确认对象状态后重试。')).toBeInTheDocument()
    expect(db.tasks.some((item) => item.id === 1)).toBe(true)
  })

  test('删完子任务后父任务 isParent 复位，并回任务列表', async () => {
    renderPage(<TaskDetailPage />, '/tasks/:taskId', '/tasks/3')
    expect((await screen.findAllByText('Captcha API implementation')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('已删除')).toBeInTheDocument()
    await waitFor(() => expect(db.tasks.some((item) => item.id === 3)).toBe(false))
    expect(await screen.findByText('task-list-stub')).toBeInTheDocument()
    // 父任务仍有另一未删子任务（4）→ isParent 不复位
    expect(db.tasks.find((item) => item.id === 1)?.isParent).toBe(true)

    cleanup()
    renderPage(<TaskDetailPage />, '/tasks/:taskId', '/tasks/4')
    expect((await screen.findAllByText('Login page visual review')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    await waitFor(() => expect(db.tasks.some((item) => item.id === 4)).toBe(false))
    // 子任务全删 → 父 isParent 复位（task §5 DELETE 副作用）
    expect(db.tasks.find((item) => item.id === 1)?.isParent).toBe(false)
  })
})

describe('任务批量页', () => {
  test('批量创建整表可编辑，子任务勾选随上一行联动', async () => {
    const user = userEvent.setup()
    renderPage(
      <TaskBatchCreatePage />,
      '/executions/:executionId/tasks/batch-create',
      '/executions/5/tasks/batch-create',
    )
    const title = await screen.findByLabelText('task-title-1')
    expect(screen.getByLabelText('task-child-1')).toBeDisabled()
    expect(screen.getByLabelText('task-child-2')).toBeDisabled()

    await user.type(title, '新建顶层任务')
    expect(screen.getByLabelText('task-child-2')).toBeEnabled()
  })

  test('批量编辑按 ids 载入行并展示批量动作', async () => {
    renderPage(<TaskBatchEditPage />, '/tasks/batch-edit', '/tasks/batch-edit?executionId=5&ids=1,2')
    expect((await screen.findAllByText('Login API integration')).length).toBeGreaterThan(0)
    expect(screen.getByText('WeCom login research')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /指\s*派/ })).toBeInTheDocument()
    expect(screen.getByLabelText('batch-closed-reason')).toBeInTheDocument()
  })
})
