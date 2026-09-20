import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { platformHandlers } from '../../../mocks/platform-handlers'
import LangItemPage from '../pages/lang-item-page.page'
import SettingPage from '../pages/setting-page.page'

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

function renderPage(page: React.ReactElement) {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter>{page}</MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('SettingPage', () => {
  test('分区表单渲染并可提交', async () => {
    const user = userEvent.setup()
    renderPage(<SettingPage />)
    expect(await screen.findByLabelText('默认时区')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /提\s*交/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /提\s*交/ })).not.toBeDisabled()
    })
  })
})

describe('LangItemPage', () => {
  test('域树动态来自 /dicts/privileges（不再硬编码），默认域回退目录首域', async () => {
    renderPage(<LangItemPage />)
    // mock 目录按 domain 去重后排序，首域 account 默认展开（field/action 子节点）
    expect(await screen.findByText('account')).toBeInTheDocument()
    expect(screen.getByText('field')).toBeInTheDocument()
    expect(screen.getByText('action')).toBeInTheDocument()
    // 旧硬编码的 common 域不在目录中，不得出现
    expect(screen.queryByText('common')).not.toBeInTheDocument()
    expect(screen.getByLabelText('新键名')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /恢\s*复\s*默\s*认/ })).toBeInTheDocument()
  })

  test('语言切换带 lang 参数重新读取（B-PLT-12）', async () => {
    server.use(
      http.get('*/api/v1/lang-items/:domain/:field', ({ request }) => {
        const url = new URL(request.url)
        return HttpResponse.json({
          data: { items: { lang: url.searchParams.get('lang') ?? 'none' }, overridden: false },
        })
      }),
    )
    const user = userEvent.setup()
    renderPage(<LangItemPage />)
    // 缺省 zh-cn
    expect(await screen.findByDisplayValue('zh-cn')).toBeInTheDocument()
    // 切到 en：重新请求时 lang=en 生效
    await user.click(await screen.findByText('English'))
    expect(await screen.findByDisplayValue('en')).toBeInTheDocument()
  })
})
