import type { Meta, StoryObj } from '@storybook/react'
import { FilterForm } from './filter-form'
import { Input } from './ui'

/**
 * FilterForm：列表筛选区标准件（查询/重置恒定右下，草稿态提交才生效）。
 */
const meta: Meta<typeof FilterForm> = {
  title: 'design-system/FilterForm',
  component: FilterForm,
  args: {
    fields: [
      { name: 'q', label: 'Keyword', control: <Input placeholder="Search" /> },
      { name: 'assignee', label: 'Assignee', control: <Input /> },
    ],
    values: {},
    onSearch: () => {},
    onReset: () => {},
  },
}
export default meta
type Story = StoryObj<typeof FilterForm>

export const TwoFields: Story = {}

export const WithCommittedValues: Story = {
  args: { values: { q: 'login', assignee: 'alice' } },
}
