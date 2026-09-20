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
import { STORY_META } from '../../../mocks/story-handlers'
import StoryListPage from '../pages/story-list-page.page'

/**
 * 筛选项真源核验（03 §5）：需求列表的类型/状态/优先级/所处阶段/来源五个下拉一律来自
 * `GET /meta/story` 的 `options`（取值 + i18n 标签），前端不留常量清单。
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
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

function stubMetaAndList(fieldKey: string, options: { value: string; i18n: string }[]): { url: () => URL | undefined } {
  let captured: URL | undefined
  server.use(
    http.get('*/api/v1/meta/story', () =>
      HttpResponse.json({
        data: {
          ...STORY_META,
          fields: STORY_META.fields.map((field) => (field.key === fieldKey ? { ...field, options } : field)),
        },
      }),
    ),
    http.get('*/api/v1/products/:productId/stories', ({ request }) => {
      captured = new URL(request.url)
      return HttpResponse.json({ data: { items: [], total: 0 } })
    }),
  )
  return { url: () => captured }
}

function renderPage(entry = '/products/1/stories') {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/products/:productId/stories" element={<StoryListPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('StoryListPage 筛选下拉', () => {
  test('所处阶段选项取自 GET /meta/story：自定义取值 + i18n 标签都来自接口', async () => {
    stubMetaAndList('stage', [{ value: 'archived', i18n: 'story.stage.archived' }])
    renderPage()

    const user = userEvent.setup()
    await user.click(await screen.findByRole('combobox', { name: '所处阶段' }))
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('archived')
    expect(options[0]).toHaveAccessibleName('story.stage.archived')
    // 前端旧常量 STORY_STAGES 的四个阶段一个都不在。
    for (const label of ['未开始', '研发中', '测试中', '已发布']) {
      expect(screen.queryByRole('option', { name: label })).not.toBeInTheDocument()
    }
  })

  test('筛选值原样下发：URL 上的取值不被前端清单改写', async () => {
    const list = stubMetaAndList('stage', [])
    renderPage('/products/1/stories?stage=archived')

    await waitFor(() => {
      expect(list.url()?.searchParams.get('filters[stage]')).toBe('archived')
    })
  })
})
