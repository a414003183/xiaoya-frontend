import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, destroyStaticMessages, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, error, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import ProductBatchEditPage from '../pages/product-batch-edit-page.page'

/**
 * 产品批量编辑页（T72 / AUDIT FE-13/14：0 覆盖页面补渲染 + 交互 + 失败路径断言）。
 */
initI18n()

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1
})
afterEach(() => {
  destroyStaticMessages()
  for (const node of document.querySelectorAll('.ant-message .ant-message-notice')) {
    node.remove()
  }
  server.resetHandlers()
})
afterAll(() => server.close())

function renderPage(entry: string): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={['product-edit']}>
            <MemoryRouter initialEntries={[entry]}>
              <Routes>
                <Route path="/products/batch-edit" element={<ProductBatchEditPage />} />
              </Routes>
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('产品批量编辑页（FE-13/14）', () => {
  test('ids 行内可编辑：仅改动行提交，逐行出 ok 结果', async () => {
    const user = userEvent.setup()
    renderPage('/products/batch-edit?ids=1,2')
    // 提示与两行可编辑输入
    expect(await screen.findByText('批量编辑仅提交修改过的字段；名称必填。')).toBeInTheDocument()
    const name1 = await screen.findByLabelText('name-1')
    const name2 = screen.getByLabelText('name-2')
    fireEvent.change(name1, { target: { value: 'Demo Product Renamed' } })
    fireEvent.change(name2, { target: { value: 'Cloud Platform Renamed' } })
    await user.click(screen.getByRole('button', { name: /^提\s*交$/ }))
    // 批量结果列逐行落 ok
    expect((await screen.findAllByText('ok')).length).toBe(2)
    await waitFor(() => {
      expect(db.products.find((item) => item.id === 1)?.name).toBe('Demo Product Renamed')
      expect(db.products.find((item) => item.id === 2)?.name).toBe('Cloud Platform Renamed')
    })
  })

  test('失败路径：批量端点 500 → 错误面可见（服务异常文案），页面不崩', async () => {
    server.use(http.post('*/api/v1/products/batch', () => HttpResponse.json(error(50001, 'boom'), { status: 500 })))
    renderPage('/products/batch-edit?ids=1')
    await screen.findByLabelText('name-1')
    fireEvent.change(screen.getByLabelText('name-1'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: /^提\s*交$/ }))
    expect(await screen.findByText('服务异常，请稍后重试或联系管理员。')).toBeInTheDocument()
    // 失败后输入行仍在（未清态、未白屏）
    expect(screen.getByLabelText('name-1')).toBeInTheDocument()
    expect(db.products.find((item) => item.id === 1)?.name).not.toBe('X')
  })
})
