// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TableColumnsType } from 'antd'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { Modal } from './app-modal'
import { applyColumnPref, type ColumnPref, ColumnPrefContext, type ColumnPrefStore } from './column-setting'
import { ListCard } from './list-card'

/**
 * 列表卡与列设置（2026-09-20 二次修订）：功能按钮与表格同卡、列设置改为**模态弹窗**、
 * 偏好存服务端（`ColumnPrefContext` 注入的能力，本地不再持久化）。
 * jsdom 缺 ResizeObserver/matchMedia（antd 依赖）；antd 弹层残留需显式 cleanup。
 */
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
})

afterEach(() => {
  cleanup()
})

type Row = { id: number; name: string; status: string; owner: string }

const columns: TableColumnsType<Row> = [
  { title: '编号', dataIndex: 'id', key: 'id' },
  { title: '名称', dataIndex: 'name' },
  { title: '状态', dataIndex: 'status' },
  { title: '负责人', dataIndex: 'owner' },
]

/** 桩 store：`pref` 假装是服务端读回的值，save/reset 记账（design-system 只认接口，不认后端）。 */
function stubStore(pref: ColumnPref | null): {
  store: ColumnPrefStore
  save: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
} {
  const save = vi.fn(() => Promise.resolve(pref))
  const reset = vi.fn(() => Promise.resolve(null))
  const store: ColumnPrefStore = { usePref: () => ({ pref, loading: false }), save, reset }
  return { store, save, reset }
}

function renderList(store?: ColumnPrefStore) {
  const card = (
    <MemoryRouter>
      <ListCard
        columns={columns}
        columnSettingKey="test-list"
        actions={<button type="button">新建</button>}
        toolbar={<span>共 3 条</span>}
        rowKey="id"
        dataSource={[{ id: 1, name: '甲', status: 'doing', owner: 'admin' }]}
      />
    </MemoryRouter>
  )
  return render(
    store === undefined ? card : <ColumnPrefContext.Provider value={store}>{card}</ColumnPrefContext.Provider>,
  )
}

/** 表头顺序（列设置的断言一律看表头，不看 dataIndex）。 */
function headers(): string[] {
  return within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent ?? '')
}

async function openSetting(): Promise<HTMLElement> {
  await userEvent.setup().click(screen.getByRole('button', { name: 'common.action.columnSetting' }))
  return screen.findByRole('dialog')
}

/** 选一档固定方向：分段是 label 包 input，input 自身 pointer-events:none，故点它的 label（无障碍名定位）。 */
async function clickFix(
  user: ReturnType<typeof userEvent.setup>,
  group: HTMLElement,
  key: 'fixLeft' | 'fixNone' | 'fixRight',
): Promise<void> {
  const input = within(group).getByRole('radio', { name: `common.columnPref.${key}` })
  await user.click(input.closest('label') as HTMLElement)
}

describe('ListCard（功能按钮与表格同卡）', () => {
  test('功能按钮、工具栏、表格同处一张卡片；列设置恒在最右', () => {
    const { container } = renderList()
    const card = container.querySelector('.ant-card')
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByRole('button', { name: '新建' })).toBeInTheDocument()
    expect(within(card as HTMLElement).getByText('共 3 条')).toBeInTheDocument()
    expect(within(card as HTMLElement).getByRole('table')).toBeInTheDocument()
    expect(within(card as HTMLElement).getByRole('button', { name: 'common.action.columnSetting' })).toBeInTheDocument()
  })

  test('表格数据与表头渲染（列定义由 ListCard 交给 Table）', () => {
    renderList()
    expect(screen.getByText('甲')).toBeInTheDocument()
    expect(screen.getByText('状态')).toBeInTheDocument()
  })

  test('无 Provider 时按页面默认列渲染（不请求、不报错）', () => {
    renderList()
    expect(headers()).toEqual(['编号', '名称', '状态', '负责人'])
  })
})

describe('列设置（服务端偏好经 ColumnPrefContext 注入）', () => {
  const pref: ColumnPref = [
    { key: 'status', visible: true, fixed: 'left' },
    { key: 'id', visible: false, fixed: null },
    { key: 'name', visible: true, fixed: 'right' },
  ]

  test('按偏好排序、过滤、设固定位；偏好不认识的列补在末尾且可见', () => {
    const { store } = stubStore(pref)
    renderList(store)
    expect(headers()).toEqual(['状态', '名称', '负责人'])
    const table = screen.getByRole('table')
    /* antd 6 的固定列类名是 fix-start / fix-end（旧名 fix-left / fix-right 已废弃） */
    expect(within(table).getAllByRole('columnheader')[0]).toHaveClass('ant-table-cell-fix-start')
    expect(within(table).getAllByRole('columnheader')[1]).toHaveClass('ant-table-cell-fix-end')
    expect(within(table).getAllByRole('columnheader')[2]).not.toHaveClass('ant-table-cell-fix-start')
  })

  test('偏好为空/全隐藏时不产出空表（至少留一列）', () => {
    const { store } = stubStore([
      { key: 'id', visible: false, fixed: null },
      { key: 'name', visible: false, fixed: null },
      { key: 'status', visible: false, fixed: null },
      { key: 'owner', visible: false, fixed: null },
    ])
    renderList(store)
    expect(headers()).toEqual(['编号', '名称', '状态', '负责人'])
  })

  test('applyColumnPref：pref 缺省原样返回（请求在途不闪列）', () => {
    expect(applyColumnPref(columns, undefined)).toBe(columns)
    expect(applyColumnPref(columns, [])).toBe(columns)
  })
})

describe('列设置弹窗（拖拽排序 + 显隐 + 固定三态）', () => {
  test('齿轮打开弹窗，勾选列可见性并保存 → 调 save 带整表载荷', async () => {
    const { store, save } = stubStore(null)
    renderList(store)
    const dialog = await openSetting()
    expect(within(dialog).getByText('common.columnPref.title')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(within(dialog).getByRole('checkbox', { name: '状态' }))
    await user.click(within(dialog).getByRole('button', { name: 'common.columnPref.save' }))

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith('test-list', [
        { key: 'id', visible: true, fixed: null },
        { key: 'name', visible: true, fixed: null },
        { key: 'status', visible: false, fixed: null },
        { key: 'owner', visible: true, fixed: null },
      ]),
    )
  })

  test('固定方向三态落进载荷（左固定 / 右固定 / 不固定）', async () => {
    const { store, save } = stubStore(null)
    renderList(store)
    const dialog = await openSetting()
    const user = userEvent.setup()

    await clickFix(user, within(dialog).getByRole('radiogroup', { name: '名称' }), 'fixRight')
    const statusRow = within(dialog).getByRole('radiogroup', { name: '状态' })
    await clickFix(user, statusRow, 'fixLeft')
    await clickFix(user, statusRow, 'fixNone')
    await user.click(within(dialog).getByRole('button', { name: 'common.columnPref.save' }))

    await waitFor(() => {
      const payload = save.mock.calls[0]?.[1] as { key: string; fixed: string | null }[]
      expect(payload.find((item) => item.key === 'name')?.fixed).toBe('right')
      expect(payload.find((item) => item.key === 'status')?.fixed).toBeNull()
    })
  })

  // 用户要求「左固定/不固定那块占据的位置太大，可以用 icon 代替」：三段从 208px 文字段收成图标，
  // 但三态的无障碍名与 Tooltip 文案仍是原 i18n 键（读屏与测试照旧按名定位）。
  test('固定方向控件是图标段（窄、无文字标签、无固定宽），三态各有无障碍名', async () => {
    const { store } = stubStore(null)
    renderList(store)
    const dialog = await openSetting()
    const group = within(dialog).getByRole('radiogroup', { name: '状态' })

    // 三态齐备，且名字就是原 i18n 键（图标即名字载体）
    expect(within(group).getAllByRole('radio')).toHaveLength(3)
    for (const key of ['fixLeft', 'fixNone', 'fixRight']) {
      expect(within(group).getByRole('radio', { name: `common.columnPref.${key}` })).toBeInTheDocument()
    }
    // 收窄：不再 block、不再钉死 208px 宽
    expect(group).not.toHaveClass('ant-segmented-block')
    expect(group.style.width).toBe('')
    // 画的是图标而不是文字：每段的可见内容只有图标，文案不再是可见文本
    for (const item of Array.from(group.querySelectorAll('.ant-segmented-item-label'))) {
      expect(item.querySelector('.ant-segmented-item-icon .anticon')).not.toBeNull()
      expect(item.textContent).toBe('')
    }
  })

  test('无改动时保存不可点；「取消」丢弃草稿（重开回到服务端偏好）', async () => {
    const { store, save } = stubStore([{ key: 'id', visible: true, fixed: null }])
    renderList(store)
    const user = userEvent.setup()
    const dialog = await openSetting()
    expect(within(dialog).getByRole('button', { name: 'common.columnPref.save' })).toBeDisabled()

    await user.click(within(dialog).getByRole('checkbox', { name: '状态' }))
    expect(within(dialog).getByRole('button', { name: 'common.columnPref.save' })).toBeEnabled()
    await user.click(within(dialog).getByRole('button', { name: 'common.action.cancel' }))
    expect(save).not.toHaveBeenCalled()

    // 重开弹窗：草稿未留痕（状态回到勾选态）
    await user.click(screen.getByRole('button', { name: 'common.action.columnSetting' }))
    const reopened = await screen.findByRole('dialog')
    expect(within(reopened).getByRole('checkbox', { name: '状态' })).toBeChecked()
  })

  test('「重置」调 reset（删服务端偏好回页面默认）', async () => {
    const { store, reset } = stubStore([{ key: 'id', visible: false, fixed: null }])
    renderList(store)
    expect(headers()).toEqual(['名称', '状态', '负责人'])
    const dialog = await openSetting()
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'common.columnPref.reset' }))
    await waitFor(() => expect(reset).toHaveBeenCalledWith('test-list'))
  })

  test('至少保留一列不可隐藏（最后一列的勾选框禁用）', async () => {
    const { store } = stubStore([
      { key: 'id', visible: false, fixed: null },
      { key: 'name', visible: false, fixed: null },
      { key: 'status', visible: true, fixed: null },
      { key: 'owner', visible: false, fixed: null },
    ])
    renderList(store)
    expect(headers()).toEqual(['状态'])
    const dialog = await openSetting()
    expect(within(dialog).getByRole('checkbox', { name: '状态' })).toBeDisabled()
  })
})

describe('Modal（用户裁决 2026-09-20：弹窗高度统一、超长在弹窗内滚动）', () => {
  test('弹窗体恒定最大高 + 内部滚动（标题与底部按钮不被顶出视口）', () => {
    render(
      <Modal open title="长表单" footer={<button type="button">确定</button>}>
        <div>内容</div>
      </Modal>,
    )
    const body = document.querySelector('.ant-modal-body') as HTMLElement
    expect(body.style.maxHeight).toBe('calc(100vh - 220px)')
    expect(body.style.overflowY).toBe('auto')
    // 用户要求「滑条离输入框远一点」：滚动体自身内衬（antd 的内衬挂在 .ant-modal-container 上）
    expect(body.style.paddingInlineEnd).toBe('12px')
  })

  test('缺省宽收窄到 480（用户要求「所有的弹窗小一点，不用小太多」）', () => {
    render(
      <Modal open title="缺省宽">
        <div>内容</div>
      </Modal>,
    )
    expect((screen.getByRole('dialog') as HTMLElement).style.width).toBe('480px')
  })

  test('显式 width 照旧覆盖缺省宽（页面自有宽度的弹窗不受影响）', () => {
    render(
      <Modal open width={560} title="定制宽">
        <div>内容</div>
      </Modal>,
    )
    expect((screen.getByRole('dialog') as HTMLElement).style.width).toBe('560px')
  })

  test('调用方传 styles.body 可覆盖缺省（不吞页面样式）', () => {
    render(
      <Modal open title="定制" styles={{ body: { maxHeight: '200px' } }}>
        <div>内容</div>
      </Modal>,
    )
    const body = document.querySelector('.ant-modal-body') as HTMLElement
    expect(body.style.maxHeight).toBe('200px')
  })
})
