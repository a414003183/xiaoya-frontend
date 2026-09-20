import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db } from '../../../mocks/db'
import { handlers, resetMockData } from '../../../mocks/handlers'
import { BUG_META } from '../../../mocks/quality-handlers'
import BugListPage from '../pages/bug-list-page.page'

/**
 * 筛选项真源核验（03 §5）：Bug 列表的状态/严重程度/优先级/类型/解决方案/是否确认六个下拉
 * 一律来自 `GET /meta/bug` 的 `options`——取值与标签都取自接口，前端不留常量清单。
 * 断言用**语言包与前端常量里都不存在的取值**回放 meta：下拉里出现什么，就只能是接口给的。
 */
initI18n()

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1 // admin：超管组，全权限码
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

/** 用自定义 options 替换某字段的 meta，并录下列表请求（返回空页，断言只看请求参数）。 */
function stubMetaAndList(fieldKey: string, options: { value: string; i18n: string }[]): { url: () => URL | undefined } {
  let captured: URL | undefined
  server.use(
    http.get('*/api/v1/meta/bug', () =>
      HttpResponse.json({
        data: {
          ...BUG_META,
          fields: BUG_META.fields.map((field) => (field.key === fieldKey ? { ...field, options } : field)),
        },
      }),
    ),
    http.get('*/api/v1/products/:productId/bugs', ({ request }) => {
      captured = new URL(request.url)
      return HttpResponse.json({ data: { items: [], total: 0 } })
    }),
  )
  return { url: () => captured }
}

function renderPage(entry = '/products/1/bugs') {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/products/:productId/bugs" element={<BugListPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

/**
 * 展开某筛选下拉，返回其中的选项。rc-select 的 option 元素文本就是下发的 value、
 * aria-label 是 t(option.i18n) 的标签——两者一起证明「取值 + 文案」都来自 meta。
 */
async function openFilter(fieldLabel: string): Promise<HTMLElement[]> {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: fieldLabel }))
  return screen.findAllByRole('option')
}

describe('BugListPage 筛选下拉', () => {
  test('状态选项取自 GET /meta/bug：自定义取值 + i18n 标签都来自接口', async () => {
    // i18n 键故意在语言包里不存在：t() 回退键名本身，正好证明标签也取自接口的 i18n 字段。
    stubMetaAndList('status', [{ value: 'reopened', i18n: 'bug.status.reopened' }])
    renderPage()

    const options = await openFilter('状态')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('reopened')
    expect(options[0]).toHaveAccessibleName('bug.status.reopened')
    // 前端旧常量 BUG_STATUSES 的三个取值一个都不在——选项只认接口，不与本地清单合并。
    for (const label of ['激活', '已解决', '已关闭']) {
      expect(screen.queryByRole('option', { name: label })).not.toBeInTheDocument()
    }
  })

  test('解决方案选项同样按 meta 取值（不同字段同一条通路）', async () => {
    stubMetaAndList('resolution', [
      { value: 'wontdo', i18n: 'bug.resolution.bydesign' },
      { value: 'later', i18n: 'bug.resolution.postponed' },
    ])
    renderPage()

    const options = await openFilter('解决方案')
    expect(options.map((option) => option.textContent)).toEqual(['wontdo', 'later'])
    expect(options.map((option) => option.getAttribute('aria-label'))).toEqual(['设计如此', '延期处理'])
  })

  test('筛选值原样下发：URL 上的取值不被前端清单改写', async () => {
    const list = stubMetaAndList('status', [])
    renderPage('/products/1/bugs?status=reopened')

    await waitFor(() => {
      expect(list.url()?.searchParams.get('filters[status]')).toBe('reopened')
    })
  })

  test('meta 不可用时筛选条照常渲染（选项为空，不阻塞页面）', async () => {
    server.use(http.get('*/api/v1/meta/bug', () => HttpResponse.json({ error: { code: 40401 } }, { status: 404 })))
    renderPage()

    expect(await screen.findByRole('combobox', { name: '状态' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /搜\s*索/ })).toBeInTheDocument()
  })
})
