import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import BoardPage from '../pages/board-page.page'

/**
 * 大车道窗口化（T72 / AUDIT FE-10）：车道体定高滚动、只渲染视口 ±buffer 的卡片；小车道整列直渲（行为冻结）。
 * jsdom 无布局（clientHeight=0），scrollTop 用属性桩模拟滚动位置。
 */
initI18n()

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1
  // lane 1 已有 2 张种子卡（sort 0/1），再叠 40 张 → 42 张（> CARD_RENDER_ALL_BELOW=30）触发窗口化
  for (let i = 0; i < 40; i += 1) {
    db.boardCards.push({
      id: 1000 + i,
      boardId: 1,
      laneId: 1,
      name: `Window Card ${String(i).padStart(2, '0')}`,
      status: 'doing',
      priority: 1,
      progress: 0,
      archived: false,
      sort: 10 + i,
      lockVersion: 0,
    })
  }
})
afterEach(() => {
  server.resetHandlers()
})
afterAll(() => server.close())

function renderBoard(): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={['board-view', 'board-card-create']}>
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

describe('车道卡片窗口化（FE-10）', () => {
  test('大车道定高滚动容器只渲染窗口内卡片；小车道整列直渲不滚动', async () => {
    renderBoard()
    await screen.findByText('SMS captcha login integration')
    const body = screen.getByLabelText('lane-cards-1')
    // 定高滚动容器是窗口化的前提（滚动容器必须定高才能算窗口）
    expect(body).toHaveStyle({ height: '560px', overflowY: 'auto' })
    // 窗口内（近顶）在、窗口外不在：42 张里只渲染一小段
    expect(screen.getByText('Window Card 02')).toBeInTheDocument()
    expect(screen.queryByText('Window Card 10')).not.toBeInTheDocument()
    expect(screen.queryByText('Window Card 30')).not.toBeInTheDocument()
    // 小车道（lane 2 仅 1 张种子卡）不进窗口化：无定高滚动容器
    expect(screen.getByLabelText('lane-cards-2')).not.toHaveStyle({ height: '560px' })
  })

  test('滚动后窗口下移：远端卡片进 DOM、顶端卡片退出', async () => {
    renderBoard()
    await screen.findByText('SMS captcha login integration')
    expect(screen.queryByText('Window Card 20')).not.toBeInTheDocument()
    const body = screen.getByLabelText('lane-cards-1')
    // jsdom 的 scrollTop 只读恒 0：属性桩模拟深滚位置后派发 scroll
    Object.defineProperty(body, 'scrollTop', { value: 2000, configurable: true })
    fireEvent.scroll(body)
    await waitFor(() => {
      expect(screen.getByText('Window Card 20')).toBeInTheDocument()
    })
    expect(screen.queryByText('SMS captcha login integration')).not.toBeInTheDocument()
    expect(screen.queryByText('Window Card 30')).not.toBeInTheDocument()
  })
})
