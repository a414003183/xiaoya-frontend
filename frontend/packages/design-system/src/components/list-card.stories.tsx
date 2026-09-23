import type { Meta, StoryObj } from '@storybook/react'
import type { ListCardHeaderProps } from './list-card'
import { ListCard, ListCardHeader } from './list-card'
import { Button, type TableColumnsType } from './ui'

type Row = { id: number; name: string }

const rows: Row[] = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
]

const columns: TableColumnsType<Row> = [
  { dataIndex: 'id', title: 'ID' },
  { dataIndex: 'name', title: 'Name' },
]

/**
 * ListCard / ListCardHeader（CONVENTIONS §3.2 唯一列表载体）：功能按钮 + 表格 + 列设置一卡收齐，
 * 列设置齿轮恒在表卡右上角。ListCardHeader 是卡头标准件（T72 / FE-12），同文件登记。
 */
const meta: Meta<typeof ListCard<Row>> = {
  title: 'design-system/ListCard',
  component: ListCard,
}
export default meta
type Story = StoryObj<typeof ListCard<Row>>

export const WithActionsAndToolbar: Story = {
  args: {
    columns,
    dataSource: rows,
    columnSettingKey: 'demo-rows',
    actions: <Button type="primary">Create</Button>,
    toolbar: <Button>Board</Button>,
  },
}

export const TitledWithoutPagination: Story = {
  args: { columns, dataSource: rows, title: 'Members', pagination: false },
}

type HeaderStory = StoryObj<ListCardHeaderProps>

/** ListCardHeader：左功能按钮 / 右工具栏一行（非表格页的手写卡头同走它）。 */
export const HeaderFull: HeaderStory = {
  render: (args) => <ListCardHeader {...args} />,
  args: {
    title: 'Card title',
    actions: <Button type="primary">Create</Button>,
    toolbar: <Button>View</Button>,
    extra: <Button>Gear</Button>,
  },
}

/** 左组为空时右组仍贴右（auto 外边距，不依赖兄弟项）。 */
export const HeaderToolbarOnly: HeaderStory = {
  render: (args) => <ListCardHeader {...args} />,
  args: { toolbar: <Button>View</Button> },
}
