import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db } from '../../../mocks/db'
import { resetMockData } from '../../../mocks/handlers'
import { platformHandlers } from '../../../mocks/platform-handlers'
import NotificationListPage from '../pages/notification-list-page.page'

initI18n()

const server = setupServer(...platformHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 2 // dev1：种子含 1 未读 + 1 已读
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

function renderPage(initialEntry = '/notifications') {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <NotificationListPage />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('NotificationListPage', () => {
  test('全部页签显示本人通知（含已读）', async () => {
    renderPage()
    expect(await screen.findByText('New story pending')).toBeInTheDocument()
    expect(await screen.findByText('Your password was reset by admin')).toBeInTheDocument()
  })

  test('未读页签经 filters[readAt]=@null 过滤，标记已读后从未读消失', async () => {
    const user = userEvent.setup()
    renderPage('/notifications?readAt=unread')
    expect(await screen.findByText('Your password was reset by admin')).toBeInTheDocument()
    expect(screen.queryByText('New story pending')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /标\s*记\s*已\s*读/ }))
    await waitFor(() => {
      expect(screen.getByText('暂无通知')).toBeInTheDocument()
    })
  })
})
