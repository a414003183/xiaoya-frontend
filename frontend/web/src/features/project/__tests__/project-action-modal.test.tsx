import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import type { ProjectView } from '@zentao/api-client/generated/model/projectView'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { PROJECT_META } from '../../../mocks/project-handlers'
import { ProjectActionModal } from '../components/project-action-modal'

/**
 * 六动作弹窗（project §4/§6）：按钮 = meta.actions[].allowedStatus × 账号权限码；
 * activate 守卫联动（beginDate ≤ endDate，否则不发请求）。
 */
initI18n()

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

const PRIVILEGES = [
  'project-edit',
  'project-start',
  'project-suspend',
  'project-resume',
  'project-delay',
  'project-close',
  'project-activate',
]

function project(status: string): ProjectView {
  return {
    id: 3,
    type: 'project',
    parentId: 1,
    name: '禅道研发项目',
    model: 'scrum',
    status: status as ProjectView['status'],
    priority: 1,
    beginDate: '2026-01-01',
    endDate: '2026-06-30',
    acl: 'open',
    whitelist: [],
    sort: 0,
    lockVersion: 0,
  }
}

function renderModal(status: string, privileges: string[] = PRIVILEGES): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={privileges}>
            <ProjectActionModal
              objectType="project"
              target={project(status)}
              actions={PROJECT_META.actions}
              onDone={() => undefined}
            />
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('ProjectActionModal 按钮渲染', () => {
  test('wait：只出「开始」（allowedStatus=wait），不出挂起/关闭', () => {
    renderModal('wait')
    expect(screen.getByRole('button', { name: /开\s*始/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /挂\s*起/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /关\s*闭/ })).not.toBeInTheDocument()
  })

  test('doing：出挂起/延期/关闭，不出开始/激活', () => {
    renderModal('doing')
    expect(screen.getByRole('button', { name: /挂\s*起/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /延\s*期/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /关\s*闭/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /开\s*始/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /激\s*活/ })).not.toBeInTheDocument()
  })

  test('closed：只出「激活」；无权限码时一个动作按钮都不渲染', () => {
    renderModal('closed')
    expect(screen.getByRole('button', { name: /激\s*活/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /关\s*闭/ })).not.toBeInTheDocument()
    cleanup()
    renderModal('closed', [])
    expect(screen.queryByRole('button', { name: /激\s*活/ })).not.toBeInTheDocument()
  })
})

describe('ProjectActionModal activate 守卫', () => {
  test('日期必填与先后顺序联动：非法输入不发请求', async () => {
    const user = userEvent.setup()
    const activateSpy = vi.fn()
    server.use(
      http.post('*/api/v1/projects/:projectId/activate', () => {
        activateSpy()
        return HttpResponse.json({ data: project('doing') })
      }),
    )
    renderModal('closed')

    await user.click(screen.getByRole('button', { name: /激\s*活/ }))
    // 表单默认带对象当前日期区间
    expect((screen.getByLabelText('project-action-begin-date') as HTMLInputElement).value).toBe('2026-01-01')

    fireEvent.change(screen.getByLabelText('project-action-begin-date'), { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    expect(await screen.findByText('此项必填')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('project-action-begin-date'), { target: { value: '2026-08-01' } })
    fireEvent.change(screen.getByLabelText('project-action-end-date'), { target: { value: '2026-07-01' } })
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    expect(await screen.findByText('结束日期不能早于开始日期。')).toBeInTheDocument()
    expect(activateSpy).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('project-action-end-date'), { target: { value: '2026-09-30' } })
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      expect(activateSpy).toHaveBeenCalledTimes(1)
    })
  })
})
