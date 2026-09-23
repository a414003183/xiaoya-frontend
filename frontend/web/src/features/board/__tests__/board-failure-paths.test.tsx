import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, destroyStaticMessages, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, error, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import BoardPage from '../pages/board-page.page'

/**
 * board 失败路径与缓存失效集（T72 / AUDIT FE-14 口径）：
 * ① 删列成功必须重取 getBoard（缓存失效集），失败不许失效缓存、必须有错误面；
 * ② 整板查询失败的现状特征化（FE-01/02 类回归的看护基线）。
 */
initI18n()

const server = setupServer(...handlers)

/** getBoard 的 GET 计数（路径尾 /boards/1）：缓存失效集的观测探针（同 menu-route-cache 的探针口径）。 */
const boardGets: string[] = []

beforeAll(() => {
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (request.method === 'GET' && /\/boards\/1$/.test(url.pathname)) {
      boardGets.push(url.pathname)
    }
  })
  server.listen({ onUnhandledRequest: 'error' })
})
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1
  boardGets.length = 0
})
afterEach(() => {
  // antd message 挂独立容器，RTL cleanup 不清（同 board-pages 口径）
  destroyStaticMessages()
  for (const node of document.querySelectorAll('.ant-message .ant-message-notice')) {
    node.remove()
  }
  server.resetHandlers()
})
afterAll(() => server.close())

function renderBoard(): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={['board-view', 'board-edit']}>
            <MemoryRouter initialEntries={['/boards/1']}>
              <Routes>
                <Route path="/boards/:boardId" element={<BoardPage />} />
              </Routes>
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

async function confirmLaneDelete(laneId: number): Promise<void> {
  fireEvent.click(await screen.findByLabelText(`lane-delete-${laneId}`))
  fireEvent.click(await screen.findByRole('button', { name: 'OK' }))
}

describe('删列的缓存失效集与失败路径（FE-14）', () => {
  test('成功：提示已删除、列消失且 getBoard 重取（失效集含 getBoard）', async () => {
    // 种子三列都仍有卡（删列守卫会拒）：补一张空列来走成功路径
    db.boardLanes.push({
      id: 99,
      boardId: 1,
      name: 'Scratch Lane',
      color: null,
      wipLimit: -1,
      archived: false,
      sort: 9,
    })
    renderBoard()
    await screen.findByText('Scratch Lane')
    await waitFor(() => expect(boardGets.length).toBe(1))
    await confirmLaneDelete(99)
    expect(await screen.findByText('已删除')).toBeInTheDocument()
    await waitFor(() => expect(boardGets.length).toBe(2))
    // 失效集的可见效果：重取后被删的列从看板消失
    await waitFor(() => expect(screen.queryByText('Scratch Lane')).not.toBeInTheDocument())
  })

  test('失败（42203 守卫）：错误面可见、不失效缓存、数据不动', async () => {
    renderBoard()
    await screen.findByText('To Do')
    await waitFor(() => expect(boardGets.length).toBe(1))
    // lane 1 内仍有卡片 → 删除守卫 42203
    await confirmLaneDelete(1)
    expect(await screen.findByText('操作条件不满足，请确认对象状态后重试。')).toBeInTheDocument()
    // 失败路径不得触发 getBoard 重取（缓存失效集断言；留一拍让「若发生了的失效」落地再数）
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(boardGets.length).toBe(1)
    expect(db.boardLanes.some((lane) => lane.id === 1)).toBe(true)
    expect(await screen.findByText('To Do')).toBeInTheDocument()
  })
})

describe('整板查询失败路径（现状特征化）', () => {
  test('getBoard 4xx：不白屏、不抛错，落「空板」提示（查询失败无专属错误面是现状，见报告遗留）', async () => {
    server.use(
      http.get('*/api/v1/boards/1', () => HttpResponse.json(error(40302, '你看不到这个看板。'), { status: 403 })),
    )
    renderBoard()
    // 现状行为：查询失败与「空看板」同面（无错误文案）——特征化断言，改错误面时本用例应显式更新
    expect(await screen.findByText('看板暂无列，先新建一列。')).toBeInTheDocument()
    expect(screen.queryByLabelText('lane-cards-1')).not.toBeInTheDocument()
    expect(screen.queryByText('To Do')).not.toBeInTheDocument()
  })
})
