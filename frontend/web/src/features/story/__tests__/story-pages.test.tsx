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
import StoryBatchCreatePage from '../pages/story-batch-create-page.page'
import StoryBatchEditPage from '../pages/story-batch-edit-page.page'
import StoryDetailPage from '../pages/story-detail-page.page'
import StoryListPage from '../pages/story-list-page.page'

/** requirement 域页面冒烟：列表/详情/两个批量页在 MSW 下渲染（T-5）。 */
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

function renderPage(page: ReactElement, path: string, entry: string, privileges: string[] = []): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={privileges}>
            <MemoryRouter initialEntries={[entry]}>
              <Routes>
                <Route path={path} element={page} />
                <Route path="/products/:productId/stories" element={<div>story-list-stub</div>} />
              </Routes>
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('需求列表页', () => {
  test('类型页签与行数据渲染', async () => {
    renderPage(<StoryListPage />, '/products/:productId/stories', '/products/1/stories')
    expect((await screen.findAllByText('Support SMS captcha on login page')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '提需求' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '批量创建' })).toBeInTheDocument()
  })

  test('标题即详情入口：名称是真链接，操作列（原「详情」列）已移除', async () => {
    renderPage(<StoryListPage />, '/products/:productId/stories', '/products/1/stories')
    // 用户要求 2026-09-20：列表点名称进详情；需求列唯一的操作按钮就是「详情」，随列一并删除
    const links = await screen.findAllByRole('link', { name: 'Support SMS captcha on login page' })
    expect(links[0]).toHaveAttribute('href', '/stories/1')
    expect(screen.queryByRole('button', { name: /详\s*情/ })).not.toBeInTheDocument()
  })
})

describe('需求详情页', () => {
  test('页头动作区由 meta actions 驱动（active → 发起变更/关闭/指派）', async () => {
    renderPage(<StoryDetailPage />, '/stories/:storyId', '/stories/1')
    expect((await screen.findAllByText('Support SMS captcha on login page')).length).toBeGreaterThan(0)
    expect(await screen.findByRole('button', { name: '发起变更' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /指\s*派/ })).toBeInTheDocument()
  })

  test('draft 需求展示提交评审动作', async () => {
    renderPage(<StoryDetailPage />, '/stories/:storyId', '/stories/2')
    expect(await screen.findByRole('button', { name: '提交评审' })).toBeInTheDocument()
  })

  test('附件页签按 objectType=story 接线（A-02：列表 + 上传入口）', async () => {
    db.files.push({
      id: 501,
      title: '需求附件说明.txt',
      extension: 'txt',
      size: 12,
      objectType: 'story',
      objectId: 1,
      downloads: 0,
      createdBy: 'admin',
      createdAt: '2026-09-19T00:00:00Z',
      deletedAt: null,
    })
    const user = userEvent.setup()
    // T02：上传入口按 file-upload 码显隐，夹具须持码
    renderPage(<StoryDetailPage />, '/stories/:storyId', '/stories/1', ['story-view', 'file-upload'])
    expect((await screen.findAllByText('Support SMS captcha on login page')).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('tab', { name: /附\s*件/ }))
    expect(await screen.findByText('需求附件说明.txt')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上传附件' })).toBeInTheDocument()
  })
})

describe('需求批量页', () => {
  test('批量创建整表可编辑', async () => {
    renderPage(<StoryBatchCreatePage />, '/products/:productId/stories/batch', '/products/1/stories/batch')
    expect(await screen.findByLabelText('story-title-1')).toBeInTheDocument()
  })

  test('批量编辑按 ids 载入行并可提交', async () => {
    renderPage(<StoryBatchEditPage />, '/stories/batch-edit', '/stories/batch-edit?productId=1&ids=1,2')
    expect(await screen.findByLabelText('story-title-1')).toBeInTheDocument()
    expect(screen.getByLabelText('story-title-2')).toBeInTheDocument()
  })
})

describe('需求删除入口（V-01 接线）', () => {
  const PRIVILEGES = ['story-view', 'story-delete']

  test('存在未删任务引用 → 42203 守卫文案，需求保留', async () => {
    renderPage(<StoryDetailPage />, '/stories/:storyId', '/stories/1', PRIVILEGES)
    expect((await screen.findAllByText('Support SMS captcha on login page')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('操作条件不满足，请确认对象状态后重试。')).toBeInTheDocument()
    expect(db.stories.some((item) => item.id === 1)).toBe(true)
  })

  test('无引用需求二次确认后删除并回需求列表', async () => {
    renderPage(<StoryDetailPage />, '/stories/:storyId', '/stories/3', PRIVILEGES)
    expect((await screen.findAllByText('Export order list')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('已删除')).toBeInTheDocument()
    await waitFor(() => expect(db.stories.some((item) => item.id === 3)).toBe(false))
    expect(await screen.findByText('story-list-stub')).toBeInTheDocument()
  })
})
