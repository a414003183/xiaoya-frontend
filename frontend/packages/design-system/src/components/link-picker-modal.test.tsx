// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TableColumnsType } from 'antd'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { LinkPickerModal } from './link-picker-modal'
import { AppProvider } from './ui'

/**
 * 关联对象选择器标准件（T72 / AUDIT FE-11）：三种形态的差异参数化与事件转发。
 * 三站点（plan-link / suite-link-case / test-run-link-case）的等价接线见各自域内测试。
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

type Row = { id: number; title: string }

const linkedColumns: TableColumnsType<Row> = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '标题', dataIndex: 'title' },
]

function renderPicker(node: ReactNode): void {
  render(<AppProvider>{node}</AppProvider>)
}

describe('LinkPickerModal · 形态 select（plan 族）', () => {
  test('多选下拉 + 体内关联按钮 + 提示 + 已关联表（逐行取消关联转发）', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const onUnlink = vi.fn()
    renderPicker(
      <LinkPickerModal<Row>
        open
        title="关联对象"
        onCancel={() => {}}
        picker={{
          kind: 'select',
          rows: [{ id: 1, title: '候选甲' }],
          labelOf: (row) => `#${row.id} ${row.title}`,
          placeholder: '关联',
          ariaLabel: 'pick-objects',
          actionLabel: '关联',
          hint: '仅可关联同产品且未关闭的对象。',
          selectedIds: [],
          onSelectionChange: () => {},
          onAction,
          pending: false,
        }}
        linked={{
          rows: [{ id: 2, title: '已关联乙' }],
          columns: linkedColumns,
          emptyLabel: '暂无数据',
          manageLabel: '操作',
          unlinkLabel: '移除关联',
          onUnlink,
          pending: false,
        }}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'pick-objects' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^关\s*联$/ }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.getByText('仅可关联同产品且未关闭的对象。')).toBeInTheDocument()
    expect(screen.getByText('已关联乙')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '移除关联' }))
    expect(onUnlink).toHaveBeenCalledWith(2)
    // 无底栏（footer=null 形态）
    expect(screen.queryByRole('button', { name: /^取\s*消$/ })).not.toBeInTheDocument()
  })

  test('已关联为空 → 空态文案', () => {
    renderPicker(
      <LinkPickerModal<Row>
        open
        title="关联对象"
        onCancel={() => {}}
        picker={{
          kind: 'select',
          rows: [],
          labelOf: (row) => `#${row.id}`,
          placeholder: '关联',
          ariaLabel: 'pick-objects',
          actionLabel: '关联',
          selectedIds: [],
          onSelectionChange: () => {},
          onAction: () => {},
          pending: false,
        }}
        linked={{
          rows: [],
          columns: linkedColumns,
          emptyLabel: '暂无数据',
          manageLabel: '操作',
          unlinkLabel: '移除关联',
          onUnlink: () => {},
          pending: false,
        }}
      />,
    )
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
  })
})

describe('LinkPickerModal · 形态 empty（plan 族 Bug 页签）', () => {
  test('只出空态与页签插槽，无关联按钮', () => {
    renderPicker(
      <LinkPickerModal<Row>
        open
        title="关联对象"
        onCancel={() => {}}
        toolbar={<span>需求列表</span>}
        picker={{ kind: 'empty', description: 'Bug 关联在 quality 域接通前暂不可用。' }}
      />,
    )
    expect(screen.getByText('需求列表')).toBeInTheDocument()
    expect(screen.getByText('Bug 关联在 quality 域接通前暂不可用。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^关\s*联$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^取\s*消$/ })).not.toBeInTheDocument()
  })
})

describe('LinkPickerModal · 形态 table（case 族）', () => {
  const columns: TableColumnsType<Row> = [
    { title: 'ID', dataIndex: 'id' },
    { title: '标题', dataIndex: 'title' },
  ]

  test('空选口径 disable：按钮禁用；勾选行上报选中；有选中可提交', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onSelectionChange = vi.fn()
    renderPicker(
      <LinkPickerModal<Row>
        open
        title="关联用例"
        onCancel={() => {}}
        picker={{
          kind: 'table',
          rows: [
            { id: 1, title: 'Case A' },
            { id: 2, title: 'Case B' },
          ],
          columns,
          loading: false,
          emptyLabel: '暂无数据',
          selectedIds: [],
          onSelectionChange,
          confirm: {
            cancelLabel: '取消',
            confirmLabel: '关联',
            onConfirm,
            pending: false,
            onEmptySelection: 'disable',
          },
        }}
      />,
    )
    expect(screen.getByRole('button', { name: /^关\s*联$/ })).toBeDisabled()
    // 勾选行 → 选中上报（受控）
    const rowB = screen.getByText('Case B').closest('tr')
    expect(rowB).not.toBeNull()
    await user.click(within(rowB as HTMLElement).getByRole('checkbox'))
    expect(onSelectionChange).toHaveBeenCalledWith([2])
  })

  test('空选口径 warn：按钮不禁用，空选点击弹提示不提交；有选中才提交', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onSelectionChange = vi.fn()
    renderPicker(
      <LinkPickerModal<Row>
        open
        title="关联用例"
        onCancel={() => {}}
        picker={{
          kind: 'table',
          rows: [{ id: 1, title: 'Case A' }],
          columns,
          loading: false,
          emptyLabel: '暂无数据',
          selectedIds: [],
          onSelectionChange,
          confirm: {
            cancelLabel: '取消',
            confirmLabel: '关联',
            onConfirm,
            pending: false,
            onEmptySelection: 'warn',
            emptyWarnLabel: '请先勾选用例。',
          },
        }}
      />,
    )
    const confirm = screen.getByRole('button', { name: /^关\s*联$/ })
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(await screen.findByText('请先勾选用例。')).toBeInTheDocument()
  })

  test('warn 口径有选中 → 提交；错误文案落体尾', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    renderPicker(
      <LinkPickerModal<Row>
        open
        title="关联用例"
        onCancel={() => {}}
        error="保存失败"
        picker={{
          kind: 'table',
          rows: [{ id: 1, title: 'Case A' }],
          columns,
          loading: false,
          emptyLabel: '暂无数据',
          selectedIds: [1],
          onSelectionChange: () => {},
          confirm: {
            cancelLabel: '取消',
            confirmLabel: '关联',
            onConfirm,
            pending: false,
            onEmptySelection: 'warn',
            emptyWarnLabel: '请先勾选用例。',
          },
        }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^关\s*联$/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByText('保存失败')).toBeInTheDocument()
  })
})
