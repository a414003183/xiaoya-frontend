import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { platformHandlers } from '../../../mocks/platform-handlers'
import ParamListPage from '../pages/param-list-page.page'

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
          <MemoryRouter initialEntries={['/admin/params']}>
            <ParamListPage />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

/** 表内某键所在的行（键是这一行的身份，也是编辑入口）。 */
function rowOf(key: string): HTMLElement {
  const cell = screen.getByRole('button', { name: key }).closest('tr')
  expect(cell).not.toBeNull()
  return cell as HTMLElement
}

const SUBMIT = /提\s*交/
const CONFIRM = /^(OK|确定)$/

describe('ParamListPage（T15 参数管理）', () => {
  test('列出系统参数（个人偏好键不进这个列表）', async () => {
    renderPage()
    expect(await screen.findByRole('button', { name: 'common.timezone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.workhours' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^notify\./ })).not.toBeInTheDocument()
    // 值按 JSON 文本呈现：字符串带引号，数字不带
    expect(within(rowOf('common.timezone')).getByText('"Asia/Shanghai"')).toBeInTheDocument()
    expect(within(rowOf('common.workhours')).getByText('8')).toBeInTheDocument()
  })

  test('编辑值：键只读、提交后列表显示新值', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'common.timezone' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('param-key')).toBeDisabled()

    const value = within(dialog).getByLabelText('param-value')
    await user.clear(value)
    await user.type(value, '"UTC"')
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }))

    await waitFor(() => expect(within(rowOf('common.timezone')).getByText('"UTC"')).toBeInTheDocument())
    expect(db.settings.get('common.timezone')).toBe('UTC')
  })

  test('新建：填键与值即入库并出现在列表', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /新建参数/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('param-key'), 'common.pageSize')
    await user.type(within(dialog).getByLabelText('param-value'), '50')
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'common.pageSize' })).toBeInTheDocument())
    expect(db.settings.get('common.pageSize')).toBe(50)
  })

  test('删除：二次确认后从列表消失', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: 'common.timezone' })
    await user.click(within(rowOf('common.timezone')).getByRole('button', { name: /删\s*除/ }))
    await user.click(await screen.findByRole('button', { name: CONFIRM }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'common.timezone' })).not.toBeInTheDocument())
    expect(db.settings.has('common.timezone')).toBe(false)
  })

  test('非法 JSON：服务端 422，弹窗给提示且不关', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'common.timezone' }))
    const dialog = await screen.findByRole('dialog')
    const value = within(dialog).getByLabelText('param-value')
    await user.clear(value)
    await user.type(value, 'Asia/Shanghai')
    await user.click(within(dialog).getByRole('button', { name: SUBMIT }))

    await waitFor(() => expect(screen.getAllByRole('dialog').length).toBeGreaterThan(0))
    expect(db.settings.get('common.timezone')).toBe('Asia/Shanghai')
  })
})
