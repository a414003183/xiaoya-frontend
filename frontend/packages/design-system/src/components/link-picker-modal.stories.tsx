import type { Meta, StoryObj } from '@storybook/react'
import type { LinkPickerModalProps } from './link-picker-modal'
import { LinkPickerModal } from './link-picker-modal'
import type { TableColumnsType } from './ui'

type Row = { id: number; name: string }

const rows: Row[] = [
  { id: 1, name: 'Story A' },
  { id: 2, name: 'Story B' },
]

const columns: TableColumnsType<Row> = [{ dataIndex: 'name', title: 'Name' }]

/**
 * LinkPickerModal（T72 / FE-11 单源）：关联对象选择器三形态 select / table / empty。
 * 受控组件：选中/加载/错误/pending 全由站点持有，本件只做呈现与事件转发。
 */
const meta: Meta<LinkPickerModalProps<Row>> = {
  title: 'design-system/LinkPickerModal',
  component: LinkPickerModal,
}
export default meta
type Story = StoryObj<LinkPickerModalProps<Row>>

export const SelectForm: Story = {
  args: {
    open: true,
    title: 'Link stories',
    onCancel: () => {},
    picker: {
      kind: 'select',
      rows,
      labelOf: (row) => row.name,
      placeholder: 'Pick stories',
      ariaLabel: 'Story picker',
      actionLabel: 'Link',
      selectedIds: [],
      onSelectionChange: () => {},
      onAction: () => {},
      pending: false,
    },
  },
}

export const TableForm: Story = {
  args: {
    open: true,
    title: 'Link cases',
    onCancel: () => {},
    picker: {
      kind: 'table',
      rows,
      columns,
      emptyLabel: 'No cases',
      selectedIds: [],
      onSelectionChange: () => {},
      confirm: {
        cancelLabel: 'Cancel',
        confirmLabel: 'Link',
        onConfirm: () => {},
        pending: false,
        onEmptySelection: 'disable',
      },
    },
  },
}

export const EmptyForm: Story = {
  args: {
    open: true,
    title: 'Bugs',
    onCancel: () => {},
    picker: { kind: 'empty', description: 'No bugs to link yet' },
  },
}
