import type { Meta, StoryObj } from '@storybook/react'
import { ConfirmAction } from './confirm-action'
import { Button } from './ui'

/** ConfirmAction：操作列危险动作的二次确认（Popconfirm 统一包装）。 */
const meta: Meta<typeof ConfirmAction> = {
  title: 'design-system/ConfirmAction',
  component: ConfirmAction,
  args: {
    title: 'Delete this item?',
    description: 'This cannot be undone',
    onConfirm: () => {},
    children: (
      <Button type="link" size="small">
        Delete
      </Button>
    ),
  },
}
export default meta
type Story = StoryObj<typeof ConfirmAction>

export const WithDescription: Story = {}

export const TitleOnly: Story = {
  args: { description: undefined },
}
