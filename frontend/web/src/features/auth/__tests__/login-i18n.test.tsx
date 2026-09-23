import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n, loadLanguage } from '@zentao/i18n'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, test } from 'vitest'
import LoginPage from '../pages/login-page.page'

/**
 * 登录页双语（T71 联动 / T72 FE-13：auth 域补测）：界面语言切换后标签/按钮文案随之翻转，
 * 且不留裸键（键缺失时 t() 回退键名，en 下出现点分键即红）。
 */
initI18n()

afterEach(async () => {
  await loadLanguage('zh-CN')
  localStorage.removeItem('zentao.language')
})

function renderLogin(): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('LoginPage 双语文案', () => {
  test('zh-CN：账号/密码/登录', () => {
    renderLogin()
    expect(screen.getByLabelText('账号')).toBeInTheDocument()
    expect(screen.getByLabelText('密码')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /登\s*录/ })).toBeInTheDocument()
  })

  test('en：标签与按钮翻英文，无裸键残留', async () => {
    await loadLanguage('en')
    renderLogin()
    expect(screen.getByLabelText('Account')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText('Sign in to ZenTao')).toBeInTheDocument()
    // 裸键看护：页面上不得出现点分 i18n 键名
    expect(screen.queryByText(/^auth\.login\./)).not.toBeInTheDocument()
  })
})
