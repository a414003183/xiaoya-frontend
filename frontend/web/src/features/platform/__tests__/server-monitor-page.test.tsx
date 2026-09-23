import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { platformHandlers } from '../../../mocks/platform-handlers'
import ServerMonitorPage from '../pages/server-monitor-page.page'

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

function renderPage() {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={['/admin/monitor']}>
            <ServerMonitorPage />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

/**
 * T17：页面把后端的**原始字节数**换算成百分比与可读容量，故断言换算本身——
 * 8GiB/16GiB → 50%、128GiB/512GiB → 25%、cpuLoad 0.42 → 42%，以及「—」哨兵不出现在正常数据上。
 */
describe('ServerMonitorPage（T17 服务监控）', () => {
  test('三块指标与明细：百分比按原始字节数换算，JVM 堆与运行时长在', async () => {
    renderPage()
    expect(await screen.findByText('42%')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('8 核')).toBeInTheDocument()
    expect(screen.getByText('8.0 GiB / 16.0 GiB')).toBeInTheDocument()
    expect(screen.getByText('128.0 GiB / 512.0 GiB')).toBeInTheDocument()
    expect(screen.getByText('512 MiB / 4.0 GiB')).toBeInTheDocument()
    // 90061s = 1 天 1 小时 1 分
    expect(screen.getByText('1 天 1 小时 1 分')).toBeInTheDocument()
    expect(screen.getByText('/srv/zentao')).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })
})
