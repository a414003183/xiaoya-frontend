import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import { BUG_META } from '../../../mocks/quality-handlers'
import { BugCreateModal } from '../forms/bug-create-modal'

/**
 * 表单枚举选项真源核验（03 §5）：Bug 创建弹窗的严重程度/优先级/类型下拉一律取自 `GET /meta/bug`，
 * os/browser 取自 `GET /dicts/bug-os|bug-browser`——取值与文案都来自后端，前端不留常量清单。
 * 断言用**语言包与前端常量里都不存在的取值**回放接口：下拉里出现什么，就只能是接口给的。
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

function renderModal(): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter>
            <BugCreateModal productId={1} open onClose={() => {}} />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

/** 用自定义 options 替换某字段的 meta（其余字段照旧，取 mock 的 BUG_META 作底）。 */
function stubBugMetaField(fieldKey: string, options: { value: string | number; i18n: string }[]): void {
  const fields = BUG_META.fields.map((field) => (field.key === fieldKey ? { ...field, options } : field))
  server.use(
    http.get('*/api/v1/meta/:domain', ({ params }) =>
      params.domain === 'bug' ? HttpResponse.json({ data: { ...BUG_META, fields } }) : undefined,
    ),
  )
}

/**
 * 展开某下拉，返回选项的「取值 + 标签」。rc-select 的 option 元素文本就是下发的 value、
 * aria-label 是 t(option.i18n) 的标签——两者一起证明「取值 + 文案」都来自接口（同 list-filter 测试）。
 */
async function openSelect(ariaLabel: string): Promise<{ value: string; label: string }[]> {
  const user = userEvent.setup()
  await user.click(await screen.findByLabelText(ariaLabel))
  return (await screen.findAllByRole('option')).map((option) => ({
    value: option.textContent ?? '',
    label: option.getAttribute('aria-label') ?? '',
  }))
}

describe('BugFormModal 枚举选项', () => {
  test('严重程度下拉取自 GET /meta/bug：取值与标签都在接口里', async () => {
    // i18n 键故意在语言包里不存在：t() 回退键名本身，正好证明标签也取自接口的 i18n 字段。
    stubBugMetaField('severity', [{ value: 9, i18n: 'bug.severity.custom9' }])
    renderModal()

    expect(await openSelect('bug-severity')).toEqual([{ value: '9', label: 'bug.severity.custom9' }])
    // 前端旧常量 BUG_SEVERITIES 的 1–4 一个都不在——选项只认接口，不与本地清单合并。
    for (const value of ['1', '2', '3', '4']) {
      expect(screen.queryByRole('option', { name: value })).not.toBeInTheDocument()
    }
  })

  test('类型下拉同样按 meta 取值/取文案（不同字段同一条通路）', async () => {
    stubBugMetaField('type', [{ value: 'regression', i18n: 'bug.type.codeerror' }])
    renderModal()

    expect(await openSelect('bug-type')).toEqual([{ value: 'regression', label: '代码错误' }])
  })

  test('os 下拉取自 GET /dicts（meta 只声明 source），前端不留清单', async () => {
    server.use(
      http.get('*/api/v1/dicts/:name', ({ params }) =>
        params.name === 'bug-os'
          ? HttpResponse.json({ data: { name: 'bug-os', items: [{ value: 'harmony', i18n: 'bug.os.harmony' }] } })
          : undefined,
      ),
    )
    renderModal()

    expect(await openSelect('bug-os')).toEqual([{ value: 'harmony', label: 'bug.os.harmony' }])
    expect(screen.queryByRole('option', { name: 'windows' })).not.toBeInTheDocument()
  })
})
