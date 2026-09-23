import type { Meta, StoryObj } from '@storybook/react'
import { StatusTag } from './status-tag'

/** StatusTag：状态标签（tone → 色调令牌，业务代码不裸上色）。 */
const meta: Meta<typeof StatusTag> = {
  title: 'design-system/StatusTag',
  component: StatusTag,
}
export default meta
type Story = StoryObj<typeof StatusTag>

export const Active: Story = { args: { tone: 'active', children: 'Active' } }

export const Pending: Story = { args: { tone: 'pending', children: 'Pending' } }

export const Warning: Story = { args: { tone: 'warning', children: 'Warning' } }

export const ErrorTone: Story = { args: { tone: 'error', children: 'Error' } }

export const Closed: Story = { args: { tone: 'closed', children: 'Closed' } }

export const Neutral: Story = { args: { tone: 'neutral', children: 'Neutral' } }
