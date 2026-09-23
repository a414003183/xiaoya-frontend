import type { Meta, StoryObj } from '@storybook/react'
import { PageHeader } from './page-header'
import { Button } from './ui'

/**
 * PageHeader：标题 + 返回钮（仅上下文页）+ 右侧操作区槽。渲染返回钮需要 Router 上下文，
 * 运行器接入时由 storybook 装饰器补（见 quality-gate.md §Storybook）。
 */
const meta: Meta<typeof PageHeader> = {
  title: 'design-system/PageHeader',
  component: PageHeader,
}
export default meta
type Story = StoryObj<typeof PageHeader>

export const ListPage: Story = {
  args: { title: 'Users', extra: <Button type="primary">Create</Button> },
}

export const DetailWithBack: Story = {
  args: { title: 'User detail', subtitle: 'admin', backTo: '/users', children: 'First-fold detail' },
}
