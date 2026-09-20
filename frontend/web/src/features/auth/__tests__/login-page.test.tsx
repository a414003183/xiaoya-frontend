import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { authHandlers, resetMockSession } from '../../../mocks/auth-handlers'
import { safeRedirect } from '../model'
import LoginPage from '../pages/login-page.page'

initI18n()

const server = setupServer(...authHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  resetMockSession()
})
afterAll(() => server.close())

// 06 A1-4：登录成功默认落 /my（脚手架首页已删）；/my 用桩路由承载跳转断言
// 08 B1-4：initialEntry 可带 ?redirect=，用于回跳白名单用例
function renderLogin(initialEntry = '/login') {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/my" element={<div>my-dashboard-stub</div>} />
              <Route path="/products/:id" element={<div>product-detail-stub</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('LoginPage', () => {
  test('空提交显示必填校验且不发起请求', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.click(screen.getByRole('button', { name: /登\s*录/ }))
    expect(await screen.findByText('请输入账号')).toBeInTheDocument()
    expect(screen.getByText('请输入密码')).toBeInTheDocument()
  })

  test('登录成功后跳转 /my 仪表盘', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText('账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'admin123')
    await user.click(screen.getByRole('button', { name: /登\s*录/ }))
    expect(await screen.findByText('my-dashboard-stub')).toBeInTheDocument()
  })

  test('密码错误提示 40101 文案且停留在登录页', async () => {
    server.use(
      http.post('*/api/v1/session', async () =>
        HttpResponse.json({ error: { code: 40101, message: '账号或密码错误。', traceId: 'test' } }, { status: 401 }),
      ),
    )
    const user = userEvent.setup()
    renderLogin()
    await user.type(screen.getByLabelText('账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'wrong')
    await user.click(screen.getByRole('button', { name: /登\s*录/ }))
    expect(await screen.findByText('账号或密码错误。')).toBeInTheDocument()
    expect(screen.getByLabelText('账号')).toBeInTheDocument()
  })
})

// 08 B1-4 / 07-P3-42：`?redirect=` 是用户可编辑的，必须白名单化（开放重定向面）
describe('safeRedirect（回跳白名单）', () => {
  test.each([
    ['/products/3', '/products/3'],
    ['/products/3?status=all', '/products/3?status=all'],
    ['/', '/'],
    // 站外与协议相对：一律回落
    ['https://evil.example', '/my'],
    ['//evil.example', '/my'],
    ['javascript:alert(1)', '/my'],
    // 浏览器会把 `\` 归一为 `/`、把 tab/换行剥掉 → 这两类等价于 `//evil.example`
    ['/\\evil.example', '/my'],
    ['/\t//evil.example', '/my'],
    ['/\n//evil.example', '/my'],
    ['', '/my'],
    [null, '/my'],
    [undefined, '/my'],
  ])('safeRedirect(%j) → %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected)
  })
})

describe('LoginPage 回跳接线（08 B1-4）', () => {
  async function login() {
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'admin123')
    await user.click(screen.getByRole('button', { name: /登\s*录/ }))
  }

  test('带合法 redirect：登录后回跳目标页（含筛选参数）', async () => {
    renderLogin('/login?redirect=%2Fproducts%2F3%3Fstatus%3Dall')
    await login()
    expect(await screen.findByText('product-detail-stub')).toBeInTheDocument()
  })

  test('带站外 redirect：登录后回落 /my，不跳站外', async () => {
    renderLogin('/login?redirect=%2F%2Fevil.example')
    await login()
    expect(await screen.findByText('my-dashboard-stub')).toBeInTheDocument()
  })
})
