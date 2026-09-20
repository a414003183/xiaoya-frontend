import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db } from '../../../mocks/db'
import { resetMockData } from '../../../mocks/handlers'
import { platformHandlers } from '../../../mocks/platform-handlers'
import { CommentPanel } from '../components/comment-panel'

initI18n()

const server = setupServer(...platformHandlers)

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

function renderPanel() {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <CommentPanel objectType="account" objectId={2} />
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('CommentPanel', () => {
  test('展示对象已有评论', async () => {
    renderPanel()
    expect(await screen.findByText('Welcome')).toBeInTheDocument()
  })

  test('输入并提交后新评论出现在列表', async () => {
    const user = userEvent.setup()
    renderPanel()
    const input = await screen.findByLabelText('写下你的评论…')
    await user.type(input, '新一条评论')
    await user.click(await screen.findByRole('button', { name: /发\s*表/ }))
    await waitFor(
      () => {
        const items = screen.getAllByRole('listitem')
        expect(items.some((item) => item.textContent?.includes('新一条评论'))).toBe(true)
      },
      { timeout: 3000 },
    )
  })

  test('无评论显示空态', async () => {
    render(
      <ConfigProvider theme={createTheme()}>
        <AppProvider>
          <QueryClientProvider client={createQueryClient()}>
            <CommentPanel objectType="story" objectId={999} />
          </QueryClientProvider>
        </AppProvider>
      </ConfigProvider>,
    )
    expect(await screen.findByText('暂无评论')).toBeInTheDocument()
  })
})
