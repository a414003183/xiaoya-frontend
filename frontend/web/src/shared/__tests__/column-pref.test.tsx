import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { ColumnPrefContext, ConfigProvider, createTheme, ListCard } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { columnPrefHandlers } from '../../mocks/column-pref-handlers'
import { db } from '../../mocks/db'
import { resetMockData } from '../../mocks/handlers'
import { useColumnPrefStore } from '../column-pref'

/**
 * 列设置服务端持久化（04 §列设置改造）：design-system 只认 `ColumnPrefStore` 接口，
 * 本用例走**真 store**（react-query + 生成客户端 + MSW 三端点）钉死接线——
 * 本地 localStorage 旧实现已删除，偏好的唯一真源是服务端的 `user_column_pref`。
 */
initI18n()

const server = setupServer(...columnPrefHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 2
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

const columns = [
  { title: '编号', dataIndex: 'id', key: 'id' },
  { title: '名称', dataIndex: 'name' },
  { title: '状态', dataIndex: 'status' },
]

/** 宿主 = 真 provider 组合（app-providers 同款）：store 经 ColumnPrefContext 注入 ListCard。 */
function Host() {
  const store = useColumnPrefStore()
  return (
    <ColumnPrefContext.Provider value={store}>
      <ListCard
        columns={columns}
        columnSettingKey="test-list"
        rowKey="id"
        dataSource={[{ id: 1, name: '甲', status: 'doing' }]}
      />
    </ColumnPrefContext.Provider>
  )
}

function renderHost() {
  return render(
    <ConfigProvider theme={createTheme()}>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <Host />
        </MemoryRouter>
      </QueryClientProvider>
    </ConfigProvider>,
  )
}

const headers = () =>
  within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent ?? '')

describe('列设置的服务端持久化', () => {
  test('未设置时用页面默认列；弹窗保存后写服务端并即时生效', async () => {
    const user = userEvent.setup()
    renderHost()
    expect(headers()).toEqual(['编号', '名称', '状态'])

    await user.click(screen.getByRole('button', { name: '列设置' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox', { name: '状态' }))
    /* antd 在两个汉字之间插空格（「保 存」），按注释的惯例用正则容错 */
    await user.click(within(dialog).getByRole('button', { name: /保\s*存/ }))

    await waitFor(() => {
      expect(db.columnPrefs.get('2:test-list')).toEqual([
        { key: 'id', visible: true, fixed: null },
        { key: 'name', visible: true, fixed: null },
        { key: 'status', visible: false, fixed: null },
      ])
    })
    await waitFor(() => expect(headers()).toEqual(['编号', '名称']))
  })

  test('已保存的偏好随读取生效；「重置」删服务端行并回默认列', async () => {
    db.columnPrefs.set('2:test-list', [
      { key: 'status', visible: true, fixed: 'left' },
      { key: 'id', visible: false, fixed: null },
      { key: 'name', visible: true, fixed: null },
    ])
    const user = userEvent.setup()
    renderHost()
    await waitFor(() => expect(headers()).toEqual(['状态', '名称']))

    await user.click(screen.getByRole('button', { name: '列设置' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /重\s*置/ }))

    await waitFor(() => expect(db.columnPrefs.has('2:test-list')).toBe(false))
    await waitFor(() => expect(headers()).toEqual(['编号', '名称', '状态']))
  })

  test('个人级：偏好按账号隔离（他人账号的行读不到）', async () => {
    db.columnPrefs.set('2:test-list', [{ key: 'id', visible: false, fixed: null }])
    db.currentAccountId = 1 // 换账号（同一浏览器，不再是同一份偏好）
    renderHost()
    expect(headers()).toEqual(['编号', '名称', '状态'])
  })
})
