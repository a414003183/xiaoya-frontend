import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import type { TaskView } from '@zentao/api-client/generated/model/taskView'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { TaskFinishModal } from '../components/task-finish-modal'

/** finish 弹窗守卫（task §4/§5）：累计为 0 时本次消耗必填（否则 42203），> 0 时可直接提交。 */
initI18n()

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

function task(status: string, consumedHours: number): TaskView {
  return {
    id: 1,
    executionId: 5,
    projectId: 3,
    storyId: 0,
    parentId: 0,
    categoryId: 0,
    title: '登录页接口联调',
    type: 'devel',
    priority: 1,
    status: status as TaskView['status'],
    consumedHours,
    isParent: false,
    notifyAccounts: [],
    createdBy: 'admin',
    createdAt: '2026-02-01T00:00:00Z',
    lockVersion: 0,
  }
}

function renderModal(current: TaskView): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <TaskFinishModal task={current} open onClose={() => undefined} />
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

function spyOnFinish(): ReturnType<typeof vi.fn> {
  const spy = vi.fn()
  server.use(
    http.post('*/api/v1/tasks/:taskId/finish', () => {
      spy()
      return HttpResponse.json({ data: task('done', 3) })
    }),
  )
  return spy
}

describe('TaskFinishModal 守卫联动', () => {
  test('累计为 0：本次消耗必填，未填不发请求', async () => {
    const user = userEvent.setup()
    const finishSpy = spyOnFinish()
    renderModal(task('doing', 0))

    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    expect(await screen.findByText('累计消耗为 0 时必须填写本次消耗。')).toBeInTheDocument()
    expect(finishSpy).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('task-finish-consumed'), { target: { value: '3' } })
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      expect(finishSpy).toHaveBeenCalledTimes(1)
    })
  })

  test('累计消耗 > 0：本次消耗可省，直接提交', async () => {
    const user = userEvent.setup()
    const finishSpy = spyOnFinish()
    renderModal(task('doing', 4))

    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      expect(finishSpy).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText('累计消耗为 0 时必须填写本次消耗。')).not.toBeInTheDocument()
  })
})
