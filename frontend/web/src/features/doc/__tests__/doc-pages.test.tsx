import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import DocDetailPage from '../pages/doc-detail-page.page'
import DocDiffPage from '../pages/doc-diff-page.page'
import DocEditPage from '../pages/doc-edit-page.page'
import DocMyPage from '../pages/doc-my-page.page'
import DocSpacePage from '../pages/doc-space-page.page'
import DocVersionsPage from '../pages/doc-versions-page.page'

/**
 * doc 域页面冒烟（T-4/T-5）：MSW 下渲染我的空间 / 库内文档 / 详情动作区（meta×权限码）/
 * 编辑页对只读者的 40302 呈现 / 版本列表与 ?from=&to= 双栏比对。
 */
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
  'doc-view',
  'doc-create',
  'doc-edit',
  'doc-delete',
  'doc-space-view',
  'doc-space-create',
  'doc-space-edit',
  'doc-space-delete',
  // T02：附件上传控件（FileUploadField）按 file-upload 码显隐
  'file-upload',
]

/** 编辑页用 useBlocker（离开未存提示），须走 data router（生产同 createBrowserRouter）。 */
function renderPage(page: ReactElement, path: string, entry: string, privileges: string[] = PRIVILEGES): void {
  const router = createMemoryRouter([{ path, element: page }], { initialEntries: [entry] })
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={privileges}>
            <RouterProvider router={router} />
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('文档详情（§6 D 范式 / §4 动作区）', () => {
  test('渲染 Markdown 正文、草稿徽标与 meta 动作按钮', async () => {
    renderPage(<DocDetailPage />, '/docs/:docId', '/docs/1')
    // v0 工作副本正文（可编辑者看到未发布内容）经 marked 渲染为标题
    expect(await screen.findByRole('heading', { level: 1, name: 'Sprint 1 API Guide' })).toBeInTheDocument()
    expect(screen.getByText('已发布')).toBeInTheDocument()
    expect(screen.getByText('有未发布修改')).toBeInTheDocument()
    // 动作区来自 /meta/doc（publish/move/delete）+ 显式编辑入口
    expect(screen.getByRole('button', { name: /发\s*布/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /移\s*动/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /删\s*除/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /编\s*辑/ })).toBeInTheDocument()
  })

  test('只读账号（无 doc-edit 码）不见编辑与动作按钮', async () => {
    renderPage(<DocDetailPage />, '/docs/:docId', '/docs/4', ['doc-view'])
    expect(await screen.findByRole('heading', { level: 1, name: 'Product Manual' })).toBeInTheDocument()
    // 只读者看到的是最新发布快照（v0 与快照一致），且无编辑/发布/移动/删除入口
    expect(screen.queryByRole('button', { name: /编\s*辑/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /发\s*布/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /删\s*除/ })).toBeNull()
  })
})

describe('编辑页（§4 versions/0 与 40302 呈现）', () => {
  test('可编辑者载入 v0 工作副本并可存草稿', async () => {
    renderPage(<DocEditPage />, '/docs/:docId/edit', '/docs/1/edit')
    expect(await screen.findByLabelText('doc-edit-title')).toHaveValue('Sprint 1 API Guide')
    expect((screen.getByLabelText('doc-edit-content') as HTMLTextAreaElement).value).toContain('Add error codes.')
    expect(screen.getByLabelText('doc-save-draft')).toHaveTextContent('存草稿')
    expect(screen.getByLabelText('doc-publish')).toHaveTextContent(/发\s*布/)
  })

  test('只读者（ACL readers）请求 versions/0 → 40302 呈现为不可编辑页', async () => {
    // dev1 具备 doc-edit 功能码，但文档 3 是 private：readers 命中 → 服务端 40302（§7 双层 ACL）
    for (const code of PRIVILEGES) {
      db.rolePrivs.push({ roleId: 2, code })
    }
    db.currentAccountId = 2
    renderPage(<DocEditPage />, '/docs/:docId/edit', '/docs/3/edit')
    expect(await screen.findByText('无权编辑该文档。')).toBeInTheDocument()
  })
})

describe('列表与版本页（§6 L 范式）', () => {
  test('我的空间默认页签 = 我创建的（createdBy=@me）', async () => {
    renderPage(<DocMyPage />, '/doc/my', '/doc/my')
    expect(await screen.findByText('Sprint 1 API Guide')).toBeInTheDocument()
    // dev1 的文档不在 admin 的「我创建的」结果里（DataScope + filters[createdBy]=@me）
    expect(screen.queryByText("dev1's Scratch Notes")).toBeNull()
  })

  test('库内文档页渲染目录树与章节列表', async () => {
    renderPage(<DocSpacePage />, '/doc/spaces/:docSpaceId', '/doc/spaces/1')
    expect((await screen.findAllByText(/全部文档/)).length).toBeGreaterThan(0)
    expect(await screen.findByText('Sprint 1 API Guide')).toBeInTheDocument()
    // 章节树：子文档挂在父章节下（parentId=1）
    expect(screen.getByText('Appendix: Error Codes')).toBeInTheDocument()
  })

  test('版本页列出 v≥1 快照，diff 页按 ?from=&to= 双栏渲染行级差异', async () => {
    renderPage(<DocVersionsPage />, '/docs/:docId/versions', '/docs/1/versions')
    expect(await screen.findByText('v1')).toBeInTheDocument()
    expect(screen.getByText('v2')).toBeInTheDocument()
    cleanup()
    renderPage(<DocDiffPage />, '/docs/:docId/diff', '/docs/1/diff?from=1&to=2')
    expect(await screen.findByText('Add refresh API.')).toBeInTheDocument()
    expect(screen.getAllByText('Login API returns a token.').length).toBeGreaterThan(0)
  })
})

describe('目录管理弹窗（B-DOC-01：categories 四端点）', () => {
  test('新增目录提交后树内可见，改名走 PATCH', async () => {
    renderPage(<DocSpacePage />, '/doc/spaces/:docSpaceId', '/doc/spaces/1')
    expect(await screen.findByText('Sprint 1 API Guide')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'doc-manage-categories' }))
    // 新增：填名提交 → POST /doc-spaces/1/categories → 失效重取后弹窗树与左树都出现新目录
    fireEvent.change(await screen.findByLabelText('doc-category-name'), { target: { value: '发布流程' } })
    fireEvent.click(screen.getByRole('button', { name: 'doc-category-submit' }))
    expect(await screen.findByText('发布流程')).toBeInTheDocument()
    // 改名：点树内「编辑」载入表单 → PATCH（同表单提交按钮）
    fireEvent.click(screen.getByRole('button', { name: 'doc-category-edit-1' }))
    expect(screen.getByLabelText('doc-category-name')).toHaveValue('Design Docs')
    fireEvent.change(screen.getByLabelText('doc-category-name'), { target: { value: '设计规范' } })
    fireEvent.click(screen.getByRole('button', { name: 'doc-category-submit' }))
    expect(await screen.findByText('设计规范')).toBeInTheDocument()
    expect(screen.queryByText('Design Docs')).toBeNull()
  })

  test('删除被引用目录 → 42203 服务端文案 toast', async () => {
    renderPage(<DocSpacePage />, '/doc/spaces/:docSpaceId', '/doc/spaces/1')
    await screen.findByText('Sprint 1 API Guide')
    fireEvent.click(screen.getByRole('button', { name: 'doc-manage-categories' }))
    // 目录 1 有子目录（2）且被文档引用 → 42203（§3 doc_category）
    fireEvent.click(await screen.findByRole('button', { name: 'doc-category-delete-1' }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('操作条件不满足，请确认对象状态后重试。')).toBeInTheDocument()
  })
})

describe('基本信息弹窗与详情页补口（B-DOC-02/05/09/03/10）', () => {
  test('编辑信息：keywords 提交 PATCH 后详情刷新', async () => {
    renderPage(<DocDetailPage />, '/docs/:docId', '/docs/1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sprint 1 API Guide' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'doc-edit-info' }))
    const keywords = await screen.findByLabelText('doc-basic-info-keywords')
    expect(keywords).toHaveValue('api login')
    fireEvent.change(keywords, { target: { value: '接口 登录 鉴权' } })
    fireEvent.click(screen.getByRole('button', { name: 'doc-basic-info-submit' }))
    expect(await screen.findByText('接口 登录 鉴权')).toBeInTheDocument()
  })

  test('动态/评论页签：评论面板挂载并发表（objectType=doc）', async () => {
    renderPage(<DocDetailPage />, '/docs/:docId', '/docs/1')
    await screen.findByRole('heading', { level: 1, name: 'Sprint 1 API Guide' })
    // 附件区（B-DOC-03）：platform FileUploadField 挂载
    expect(screen.getByRole('button', { name: /上传附件/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /评\s*论/ }))
    expect(await screen.findByText('暂无评论')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('写下你的评论…'), { target: { value: '示例文档，值得参考。' } })
    fireEvent.click(screen.getByRole('button', { name: /发\s*表/ }))
    expect(await screen.findByText('示例文档，值得参考。')).toBeInTheDocument()
  })
})
