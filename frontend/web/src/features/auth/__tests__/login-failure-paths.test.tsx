import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, destroyStaticMessages } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { authHandlers, resetMockSession } from '../../../mocks/auth-handlers'
import LoginPage from '../pages/login-page.page'

/**
 * 登录失败路径（T72 / AUDIT FE-13/14：auth 域失败路径断言）。
 * 现状特征化：onError 只对 40101 出文案——42901（限流）/50001 静默（遗留见任务卡「顺手发现」，
 * 口径归 T69 错误面扩展）；本测冻结「不卡 loading、不误报成功、留在登录页」的下限行为。
 */
initI18n()

const server = setupServer(...authHandlers)

let sessionPosts = 0

beforeAll(() => {
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && /\/session$/.test(new URL(request.url).pathname)) {
      sessionPosts += 1
    }
  })
  server.listen({ onUnhandledRequest: 'error' })
})
afterEach(() => {
  destroyStaticMessages()
  for (const node of document.querySelectorAll('.ant-message .ant-message-notice')) {
    node.remove()
  }
  server.resetHandlers()
  resetMockSession()
  sessionPosts = 0
})
afterAll(() => server.close())

function renderLogin(): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/my" element={<div>my-dashboard-stub</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

async function submitLogin(): Promise<void> {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('账号'), 'admin')
  await user.type(screen.getByLabelText('密码'), 'admin123')
  await user.click(screen.getByRole('button', { name: /登\s*录/ }))
}

describe('登录失败路径（FE-14）', () => {
  test('42901 限流：请求已发出、按钮复位、留在登录页且不误报成功', async () => {
    server.use(
      http.post('*/api/v1/session', () =>
        HttpResponse.json({ error: { code: 42901, message: '尝试过于频繁。', traceId: 't' } }, { status: 429 }),
      ),
    )
    renderLogin()
    await submitLogin()
    await waitFor(() => expect(sessionPosts).toBe(1))
    // 不卡 loading（按钮复位）；留在登录页（未跳 /my）
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /登\s*录/ })).toBeEnabled()
    })
    expect(screen.getByLabelText('账号')).toBeInTheDocument()
    expect(screen.queryByText('my-dashboard-stub')).not.toBeInTheDocument()
    // 现状特征化：40101 之外的码不出提示（也无成功提示）——补错误面时本断言随实现显式更新
    expect(screen.queryByText(/欢迎回来/)).not.toBeInTheDocument()
  })

  test('50001 内部错误：按钮复位、留在登录页、输入保留可重试', async () => {
    server.use(
      http.post('*/api/v1/session', () =>
        HttpResponse.json({ error: { code: 50001, message: 'boom', traceId: 't' } }, { status: 500 }),
      ),
    )
    renderLogin()
    await submitLogin()
    await waitFor(() => expect(sessionPosts).toBe(1))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /登\s*录/ })).toBeEnabled()
    })
    // 保留输入 = 可直接重试（失败不清空口令）
    expect(screen.getByLabelText('账号')).toHaveValue('admin')
    expect(screen.getByLabelText('密码')).toHaveValue('admin123')
  })
})
