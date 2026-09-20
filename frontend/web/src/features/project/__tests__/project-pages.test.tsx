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
import { db, mockId, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import ExecutionDetailPage from '../pages/execution-detail-page.page'
import ExecutionListPage from '../pages/execution-list-page.page'
import ProgramDetailPage from '../pages/program-detail-page.page'
import ProgramListPage from '../pages/program-list-page.page'
import ProjectDetailPage from '../pages/project-detail-page.page'
import ProjectExecutionListPage from '../pages/project-execution-list-page.page'
import ProjectListPage from '../pages/project-list-page.page'
import ProjectMemberPage from '../pages/project-member-page.page'
import ProjectStakeholderPage from '../pages/project-stakeholder-page.page'
import ProjectStoryListPage from '../pages/project-story-list-page.page'
import ProjectWhitelistPage from '../pages/project-whitelist-page.page'

/** project 域页面冒烟（T-3/T-5）：MSW 下渲染三型列表/详情与关联/成员/干系人/白名单页。 */
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
  'program-view',
  'program-create',
  'program-edit',
  'program-start',
  'program-suspend',
  'program-resume',
  'program-delay',
  'program-close',
  'program-activate',
  'program-delete',
  'project-view',
  'project-create',
  'project-edit',
  'project-delete',
  'project-start',
  'project-suspend',
  'project-resume',
  'project-delay',
  'project-close',
  'project-activate',
  'project-link-story',
  'project-manage-members',
  'project-whitelist',
  'execution-view',
  'execution-create',
  'execution-edit',
  'execution-delete',
  'execution-start',
  'execution-suspend',
  'execution-resume',
  'execution-delay',
  'execution-close',
  'execution-activate',
  'execution-manage-members',
  'stakeholder-view',
  'stakeholder-manage',
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
              </Routes>
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('项目集页', () => {
  test('列表按 path 折叠树渲染父与子项目集', async () => {
    renderPage(<ProgramListPage />, '/programs', '/programs')
    expect((await screen.findAllByText('Cloud Product Line')).length).toBeGreaterThan(0)
    expect(screen.getByText('Cloud Platform Sub-Program')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新\s*建\s*项\s*目\s*集/ })).toBeInTheDocument()
  })

  test('详情页头 + 子项目集页签', async () => {
    renderPage(<ProgramDetailPage />, '/programs/:programId', '/programs/1')
    expect((await screen.findAllByText('Cloud Product Line')).length).toBeGreaterThan(0)
    // 种子项目集为 doing：动作区出挂起/延期/关闭
    expect(screen.getByRole('button', { name: /挂\s*起/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '子项目集' })).toBeInTheDocument()
  })
})

describe('项目页', () => {
  test('列表渲染项目与状态下拉筛选', async () => {
    renderPage(<ProjectListPage />, '/projects', '/projects')
    expect((await screen.findAllByText('Demo Dev Project')).length).toBeGreaterThan(0)
    expect(screen.getByRole('combobox', { name: '状态' })).toBeInTheDocument()
  })

  test('详情渲染概况与动态页签', async () => {
    renderPage(<ProjectDetailPage />, '/projects/:projectId', '/projects/3')
    expect((await screen.findAllByText('Demo Dev Project')).length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: '动态' })).toBeInTheDocument()
    expect(await screen.findByText('创建')).toBeInTheDocument()
  })

  test('执行列表渲染项目下执行并可新建', async () => {
    renderPage(<ProjectExecutionListPage />, '/projects/:projectId/executions', '/projects/3/executions')
    expect((await screen.findAllByText('Sprint 1')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /新\s*建\s*执\s*行/ })).toBeInTheDocument()
  })
})

describe('执行页', () => {
  test('执行总列表与执行详情成员页签', async () => {
    renderPage(<ExecutionListPage />, '/executions', '/executions')
    expect((await screen.findAllByText('Sprint 1')).length).toBeGreaterThan(0)

    cleanup()
    renderPage(<ExecutionDetailPage />, '/executions/:executionId', '/executions/5')
    expect((await screen.findAllByText('Sprint 1')).length).toBeGreaterThan(0)
    expect(await screen.findByLabelText('team-account-0')).toBeInTheDocument()
  })

  test('执行详情动态页签（B-PRJ-07）：挂载时间线并渲染执行动态', async () => {
    const user = userEvent.setup()
    db.activities.push({
      id: mockId(),
      objectType: 'execution',
      objectId: 5,
      actor: 'dev1',
      action: 'started',
      detail: null,
      remark: null,
      occurredAt: '2026-02-01T00:00:00Z',
    })
    renderPage(<ExecutionDetailPage />, '/executions/:executionId', '/executions/5')
    await screen.findAllByText('Sprint 1')
    await user.click(screen.getByRole('tab', { name: '动态' }))
    expect(await screen.findByText('开始')).toBeInTheDocument()
    expect(screen.getByText('dev1')).toBeInTheDocument()
  })
})

describe('关联与成员页（T-5）', () => {
  test('关联需求页列出已关联需求与挑选器', async () => {
    renderPage(<ProjectStoryListPage />, '/projects/:projectId/stories', '/projects/3/stories')
    expect(await screen.findByText('Support SMS captcha on login page')).toBeInTheDocument()
    expect(screen.getByLabelText('project-story-picker')).toBeInTheDocument()
  })

  test('行内解除关联（B-PRJ-06）：删 project_story 行并从列表消失', async () => {
    const user = userEvent.setup()
    renderPage(<ProjectStoryListPage />, '/projects/:projectId/stories', '/projects/3/stories')
    await screen.findByText('Support SMS captcha on login page')
    await user.click(screen.getByLabelText('story-unlink-1'))
    await waitFor(() => {
      expect(db.projectStories.some((link) => link.projectId === 3 && link.storyId === 1)).toBe(false)
    })
    await waitFor(() => {
      expect(screen.queryByText('Support SMS captcha on login page')).not.toBeInTheDocument()
    })
    // 需求本身仍在（只删关联行）
    expect(db.stories.some((story) => story.id === 1)).toBe(true)
  })

  test('成员页整表可编辑，保存 = 全量提交并回读', async () => {
    const user = userEvent.setup()
    renderPage(<ProjectMemberPage />, '/projects/:projectId/members', '/projects/3/members')
    const role = await screen.findByLabelText('team-role-0')
    const save = screen.getByRole('button', { name: /保\s*存/ })
    expect(save).toBeDisabled()

    fireEvent.change(role, { target: { value: '技术负责人' } })
    await waitFor(() => {
      expect(save).toBeEnabled()
    })
    await user.click(save)
    await waitFor(() => {
      expect(screen.getByLabelText('team-role-0')).toHaveValue('技术负责人')
    })
    expect(db.teamMembers.find((item) => item.objectId === 3 && item.account === 'admin')?.role).toBe('技术负责人')
  })

  test('干系人页列出行并可添加', async () => {
    renderPage(<ProjectStakeholderPage />, '/projects/:projectId/stakeholders', '/projects/3/stakeholders')
    expect(await screen.findByText('guest')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /添\s*加\s*干\s*系\s*人/ })).toBeInTheDocument()
  })

  test('白名单页多选账号并可保存', async () => {
    renderPage(<ProjectWhitelistPage />, '/projects/:projectId/whitelist', '/projects/3/whitelist')
    expect(await screen.findByLabelText('project-whitelist-accounts')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /保\s*存/ })).toBeInTheDocument()
  })
})

describe('删除入口（V-01：DELETE 端点接线 + 二次确认）', () => {
  test('项目列表行内删除：无执行/关联需求 → 二次确认后删除成功', async () => {
    // 种子项目 3/4 均有下挂对象，补一个无下挂项目验成功路径
    db.projects.push({
      id: 99,
      type: 'project',
      parentId: 1,
      path: ',1,99,',
      grade: 2,
      name: 'Temp Project',
      model: 'scrum',
      status: 'wait',
      priority: 3,
      beginDate: '2026-01-01',
      endDate: '2026-02-01',
      days: 20,
      acl: 'open',
      whitelist: [],
      sort: 9,
      pm: 'admin',
      progress: 0,
      createdBy: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
      lockVersion: 0,
    })
    renderPage(<ProjectListPage />, '/projects', '/projects')
    expect(await screen.findByText('Temp Project')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('project-delete-99'))
    expect(db.projects.some((item) => item.id === 99)).toBe(true)
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('已删除')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Temp Project')).toBeNull())
    expect(db.projects.some((item) => item.id === 99)).toBe(false)
  })

  test('项目删除守卫：存在未删执行/关联需求 → 42203 文案', async () => {
    renderPage(<ProjectListPage />, '/projects', '/projects')
    expect(await screen.findByText('Demo Dev Project')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('project-delete-3'))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('操作条件不满足，请确认对象状态后重试。')).toBeInTheDocument()
    expect(db.projects.some((item) => item.id === 3)).toBe(true)
  })

  test('项目集/执行列表行内删除入口接线', async () => {
    renderPage(<ProgramListPage />, '/programs', '/programs')
    expect(await screen.findByLabelText('program-delete-1')).toBeInTheDocument()
    cleanup()
    renderPage(<ExecutionListPage />, '/executions', '/executions')
    expect(await screen.findByLabelText('execution-delete-5')).toBeInTheDocument()
  })
})
