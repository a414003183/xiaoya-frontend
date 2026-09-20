import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { db } from '../../../mocks/db'
import { resetMockData } from '../../../mocks/handlers'
import { platformHandlers } from '../../../mocks/platform-handlers'
import { eventSourceFactory, NotificationBell } from '../components/notification-bell'

initI18n()

const server = setupServer(...platformHandlers)

type Listener = (event: { data: string }) => void

/** EventSource 替身：测试手动派发 notification.created。 */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  listeners = new Map<string, Listener[]>()
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener])
  }
  close(): void {}
  emit(name: string, data: string): void {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data })
    }
  }
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 2
  FakeEventSource.instances = []
  vi.spyOn(eventSourceFactory, 'create').mockImplementation((url) => new FakeEventSource(url) as unknown as EventSource)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  server.resetHandlers()
})
afterAll(() => server.close())

function renderBell() {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter>
            <NotificationBell />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('NotificationBell', () => {
  // 08 B1-5：SSE 地址来自 platform api 的 NOTIFICATION_STREAM_URL（页面/组件不再手拼 /api/v1/...）
  test('SSE 连到 NOTIFICATION_STREAM_URL', async () => {
    renderBell()
    await waitFor(() => {
      expect(FakeEventSource.instances.map((source) => source.url)).toContain('/api/v1/notifications/stream')
    })
  })

  test('初始未读角标数来自 unread-count', async () => {
    renderBell()
    // dev1 种子 1 条未读
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '通知铃铛' }).textContent).toContain('1')
    })
  })

  test('SSE 收到 notification.created 后角标 +1', async () => {
    renderBell()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '通知铃铛' }).textContent).toContain('1')
    })
    // 模拟服务端推送新通知（先落库再触发前端刷新）
    db.notifications.push({
      id: 99,
      recipient: 'dev1',
      type: 'story-created',
      objectType: 'story',
      objectId: 1,
      activityId: null,
      title: 'SSE 推送通知',
      content: null,
      readAt: null,
      createdBy: 'admin',
      createdAt: new Date().toISOString(),
    })
    FakeEventSource.instances[0]?.emit('notification.created', JSON.stringify({ id: 99 }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '通知铃铛' }).textContent).toContain('2')
    })
  })
})
