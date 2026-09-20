import type { DragEndEvent } from '@dnd-kit/core'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, destroyStaticMessages, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import type { ReactElement } from 'react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, error, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import ExecutionKanbanPage from '../../project/pages/execution-kanban-page.page'
import StageListPage from '../../project/pages/stage-list-page.page'
import { CardDetailModal } from '../components/card-detail-modal'
import type { BoardState } from '../model'
import BoardPage from '../pages/board-page.page'
import BoardSpaceDetailPage from '../pages/board-space-detail-page.page'
import BoardSpaceListPage from '../pages/board-space-list-page.page'
import { useBoardDnd } from '../use-board-dnd'

/** board 域页面冒烟（T-7）：MSW 下渲染空间列表/详情/整板，并用合成拖拽事件验证 WIP 超限拒绝后的回滚。 */
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
  // antd message 通知挂在独立容器，RTL cleanup 不清；jsdom 无 motion 事件导致 destroy 不摘节点，
  // 残留会串到后续同文案断言（WIP 回滚用例同为 42203 文案）
  destroyStaticMessages()
  for (const node of document.querySelectorAll('.ant-message .ant-message-notice')) {
    node.remove()
  }
  server.resetHandlers()
})
afterAll(() => server.close())

const PRIVILEGES = [
  'board-view',
  'board-space-create',
  'board-space-edit',
  'board-space-close',
  'board-create',
  'board-edit',
  'board-close',
  'board-card-create',
  'board-card-edit',
  'stage-view',
  'stage-manage',
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

describe('看板空间页', () => {
  test('列表渲染空间与状态下拉筛选', async () => {
    renderPage(<BoardSpaceListPage />, '/board-spaces', '/board-spaces')
    expect((await screen.findAllByText('Dev Collaboration Space')).length).toBeGreaterThan(0)
    expect(screen.getByRole('combobox', { name: '状态' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新\s*建\s*看\s*板\s*空\s*间/ })).toBeInTheDocument()
  })

  test('详情渲染空间下看板列表', async () => {
    renderPage(<BoardSpaceDetailPage />, '/board-spaces/:boardSpaceId', '/board-spaces/1')
    expect((await screen.findAllByText('Dev Collaboration Space')).length).toBeGreaterThan(0)
    expect(await screen.findByText('Sprint Board')).toBeInTheDocument()
    expect(screen.getByText('Bug Board')).toBeInTheDocument()
  })
})

describe('删除入口（V-01：DELETE 端点接线 + 二次确认）', () => {
  test('卡片弹窗删除：二次确认后卡片移出看板', async () => {
    renderPage(<BoardPage />, '/boards/:boardId', '/boards/1')
    fireEvent.click(await screen.findByText('API auth review'))
    const del = await screen.findByLabelText('card-delete')
    // 卡片详情加载完成前按钮 disabled（Popconfirm 不触发），等可用再点
    await waitFor(() => expect(del).toBeEnabled())
    fireEvent.click(del)
    // 未确认前不发请求
    expect(db.boardCards.some((card) => card.id === 2)).toBe(true)
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('已删除')).toBeInTheDocument()
    await waitFor(() => expect(db.boardCards.some((card) => card.id === 2)).toBe(false))
    // 看板列上的卡片是 Typography.Link；antd Modal 关闭后隐藏 DOM 保留（jsdom 不触发 motion），
    // 故按 link 角色断言卡片已从看板移除
    await waitFor(() => expect(screen.queryByRole('link', { name: 'API auth review' })).toBeNull())
  })

  test('看板空间删除守卫：空间内仍有看板 → 42203 文案', async () => {
    renderPage(<BoardSpaceListPage />, '/board-spaces', '/board-spaces')
    await screen.findByText('Dev Collaboration Space')
    fireEvent.click(screen.getByLabelText('board-space-delete-1'))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('操作条件不满足，请确认对象状态后重试。')).toBeInTheDocument()
    expect(db.boardSpaces.some((space) => space.id === 1)).toBe(true)
  })

  test('看板删除守卫：看板内仍有卡片 → 42203 文案', async () => {
    renderPage(<BoardSpaceDetailPage />, '/board-spaces/:boardSpaceId', '/board-spaces/1')
    await screen.findByText('Bug Board')
    fireEvent.click(screen.getByLabelText('board-delete-2'))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
    expect(await screen.findByText('操作条件不满足，请确认对象状态后重试。')).toBeInTheDocument()
    expect(db.boards.some((board) => board.id === 2)).toBe(true)
  })
})

describe('整板页', () => {
  test('整板渲染：列、WIP 计数、卡片与行内新建入口，归档卡片不上面板', async () => {
    renderPage(<BoardPage />, '/boards/:boardId', '/boards/1')
    expect(await screen.findByText('To Do')).toBeInTheDocument()
    expect((await screen.findAllByText('In Progress')).length).toBeGreaterThan(0)
    expect(screen.getByText('Board drag-and-drop sorting')).toBeInTheDocument()
    // WIP：待办 2/3、进行中 1/2
    expect(screen.getByLabelText('lane-wip-1')).toHaveTextContent('2/3')
    expect(screen.getByLabelText('lane-wip-2')).toHaveTextContent('1/2')
    expect(screen.getByLabelText('board-add-lane')).toBeInTheDocument()
    expect(screen.getByLabelText('lane-add-card-1')).toBeInTheDocument()
    // 归档卡片（board_cards.archived=true）不渲染
    expect(screen.queryByText('History card (archived)')).not.toBeInTheDocument()
  })
})

describe('执行需求看板页', () => {
  test('按 story 状态分列渲染执行关联需求，空列保留', async () => {
    renderPage(<ExecutionKanbanPage />, '/executions/:executionId/kanban', '/executions/5/kanban')
    expect(await screen.findByText('Support SMS captcha on login page')).toBeInTheDocument()
    expect(screen.getByText('Support WeCom login')).toBeInTheDocument()
    // 空列（评审中/变更中/已变更/已关闭）保留列头
    expect(screen.getByText('评审中')).toBeInTheDocument()
    expect(screen.getByText('已关闭')).toBeInTheDocument()
  })
})

describe('阶段类型页', () => {
  test('行内改 percent 使累计超 100 时服务端 42201 在该行标红', async () => {
    const user = userEvent.setup()
    renderPage(<StageListPage />, '/settings/stages', '/settings/stages')
    // 种子四个阶段占比 20+20+40+20=100，把第一个改成 50 → 累计 130 → 42201 field=percent
    fireEvent.change(await screen.findByLabelText('stage-percent-1'), { target: { value: '50' } })
    await user.click(screen.getByLabelText('stage-save-1'))
    expect(await screen.findByText('同项目流程下阶段占比累计不能超过 100%。')).toBeInTheDocument()
  })
})

describe('卡片取消归档（B-PRJ-13）', () => {
  test('已归档卡片弹窗在归档入口原位展示取消归档，点击恢复卡片', async () => {
    const user = userEvent.setup()
    // 种子卡片 6 为已归档（archived=true），直接渲染弹窗验证
    render(
      <ConfigProvider theme={createTheme()}>
        <AppProvider>
          <QueryClientProvider client={createQueryClient()}>
            <PermScope privileges={PRIVILEGES}>
              <CardDetailModal boardId={1} cardId={6} lanes={[]} open onClose={() => undefined} />
            </PermScope>
          </QueryClientProvider>
        </AppProvider>
      </ConfigProvider>,
    )
    expect(await screen.findByText('History card (archived)')).toBeInTheDocument()
    // 已归档 → 归档按钮原位换成取消归档（i18n 键未落时回退键名，两者都匹配）
    const unarchive = screen.getByLabelText('card-unarchive')
    expect(unarchive).toHaveTextContent(/取消归档|board\.action\.unarchiveCard/)
    expect(screen.queryByRole('button', { name: /归档卡片/ })).not.toBeInTheDocument()
    await user.click(unarchive)
    await waitFor(() => {
      expect(db.boardCards.find((card) => card.id === 6)?.archived).toBe(false)
    })
  })
})

/** 拖拽接线宿主：用合成 DragEndEvent 触发与页面同一套 onDragEnd（jsdom 无法真实指针拖拽）。 */ function DndHarness({
  initial,
}: {
  initial: BoardState
}) {
  const [state, setState] = useState(initial)
  const dnd = useBoardDnd({ boardId: 1, state, onState: setState })
  return (
    <div>
      <span data-testid="card-1-lane">{state.cards.find((card) => card.id === 1)?.laneId ?? 0}</span>
      <button
        type="button"
        aria-label="simulate-drag"
        onClick={() =>
          dnd.onDragEnd({
            active: { id: 'card:1' },
            over: { id: 'card:3' },
          } as unknown as DragEndEvent)
        }
      >
        拖拽卡片 1 到卡片 3 所在列
      </button>
    </div>
  )
}

describe('看板拖拽失败回滚（WIP 超限 42203）', () => {
  test('乐观移入目标列被服务端拒绝后回到原列并提示', async () => {
    const user = userEvent.setup()
    const initial: BoardState = {
      lanes: [
        { id: 1, boardId: 1, name: '待办', wipLimit: 3, archived: false, sort: 0 },
        { id: 2, boardId: 1, name: '进行中', wipLimit: 1, archived: false, sort: 1 },
      ],
      cards: [
        {
          id: 1,
          boardId: 1,
          laneId: 1,
          name: '卡片一',
          status: 'doing',
          priority: 3,
          progress: 0,
          archived: false,
          sort: 0,
          lockVersion: 0,
        },
        {
          id: 3,
          boardId: 1,
          laneId: 2,
          name: '卡片三',
          status: 'doing',
          priority: 3,
          progress: 0,
          archived: false,
          sort: 0,
          lockVersion: 0,
        },
      ],
    }
    server.use(
      http.post('*/api/v1/cards/:cardId/move', () =>
        HttpResponse.json(error(42203, '目标列 WIP 超限，卡片未移动。'), { status: 422 }),
      ),
    )

    render(
      <ConfigProvider theme={createTheme()}>
        <AppProvider>
          <QueryClientProvider client={createQueryClient()}>
            <DndHarness initial={initial} />
          </QueryClientProvider>
        </AppProvider>
      </ConfigProvider>,
    )
    expect(screen.getByTestId('card-1-lane')).toHaveTextContent('1')

    await user.click(screen.getByLabelText('simulate-drag'))
    await waitFor(() => {
      expect(screen.getByTestId('card-1-lane')).toHaveTextContent('1')
    })
    expect(await screen.findByText('操作条件不满足，请确认对象状态后重试。')).toBeInTheDocument()
  })
})
