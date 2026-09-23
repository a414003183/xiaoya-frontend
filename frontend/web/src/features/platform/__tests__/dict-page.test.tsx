import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { platformHandlers } from '../../../mocks/platform-handlers'
import DictTypeListPage from '../pages/dict-type-list-page.page'

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
          <MemoryRouter initialEntries={['/admin/dicts']}>
            <PermScope privileges={['setting-manage']}>
              <DictTypeListPage />
            </PermScope>
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

const SUBMIT = /提\s*交/
const CONFIRM = /^(OK|确定)$/

/** 打开某类型的抽屉（类型 code 是抽屉入口）。 */
async function openDrawer(user: ReturnType<typeof userEvent.setup>, code: string): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: code }))
  const drawer = await screen.findByRole('dialog')
  return drawer
}

describe('DictTypeListPage（T16 字典管理）', () => {
  test('列出 DB 字典类型；抽屉里按 sortNo 出数据项（停用的也在，因为这是管理面）', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('button', { name: 'demo-level' })).toBeInTheDocument()
    const drawer = await openDrawer(user, 'demo-level')
    expect(within(drawer).getByText('中')).toBeInTheDocument()
    expect(within(drawer).getByText('低（停用）')).toBeInTheDocument()
  })

  test('新建数据项：入库后抽屉里出现该行，GET /dicts 回落也读得到（启用项才出）', async () => {
    const user = userEvent.setup()
    renderPage()
    const drawer = await openDrawer(user, 'demo-level')
    await user.click(within(drawer).getByRole('button', { name: /新建数据项/ }))
    // 抽屉本身也是 role=dialog，故用「输入框的 aria-label」定位弹窗而不是按 dialog 名（唯一且稳）
    const modal = ((await screen.findByLabelText('dict-item-label')).closest('.ant-modal') ??
      document.body) as HTMLElement
    await user.type(within(modal).getByLabelText('dict-item-label'), '极高')
    await user.type(within(modal).getByLabelText('dict-item-value'), 'urgent')
    await user.click(within(modal).getByRole('button', { name: SUBMIT }))

    // 先看数据到了没有（失败时能分清是请求没到还是列表没刷）
    await waitFor(() =>
      expect(db.dictData.some((row) => row.itemValue === 'urgent' && row.typeCode === 'demo-level')).toBe(true),
    )
    await waitFor(() => expect(within(drawer).getByRole('table').textContent).toContain('urgent'))
  })

  test('停用数据项：读取侧（下拉数据源）不再出这条，管理列表仍在', async () => {
    const user = userEvent.setup()
    renderPage()
    const drawer = await openDrawer(user, 'demo-level')
    const row = within(drawer).getByText('medium').closest('tr')
    expect(row).not.toBeNull()
    await user.click(within(row as HTMLElement).getByRole('button', { name: /停\s*用/ }))

    await waitFor(() => expect(db.dictData.find((item) => item.itemValue === 'medium')?.status).toBe('disabled'))
    // 管理列表里那行还在（状态变了）
    expect(within(drawer).getByText('medium')).toBeInTheDocument()
  })

  test('删除字典：二次确认后连带数据项一起没了', async () => {
    const user = userEvent.setup()
    renderPage()
    const row = (await screen.findByRole('button', { name: 'demo-level' })).closest('tr')
    expect(row).not.toBeNull()
    await user.click(within(row as HTMLElement).getByRole('button', { name: /删\s*除/ }))
    await user.click(await screen.findByRole('button', { name: CONFIRM }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'demo-level' })).not.toBeInTheDocument())
    expect(db.dictTypes).toHaveLength(0)
    expect(db.dictData.filter((item) => item.typeCode === 'demo-level')).toHaveLength(0)
  })

  test('新建字典：撞内置字典名被服务端拒（422），列表不新增', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /新建字典/ }))
    const modal = await screen.findByRole('dialog', { name: /新建字典/ })
    await user.type(within(modal).getByLabelText('dict-code'), 'timezones')
    await user.type(within(modal).getByLabelText('dict-name'), '撞名')
    await user.click(within(modal).getByRole('button', { name: SUBMIT }))

    await waitFor(() => expect(db.dictTypes.some((row) => row.code === 'timezones')).toBe(false))
  })
})
