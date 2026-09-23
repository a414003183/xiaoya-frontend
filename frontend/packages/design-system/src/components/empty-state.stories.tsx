import type { Meta, StoryObj } from '@storybook/react'
import { EmptyState } from './empty-state'

/** EmptyState：列表/区块空态。 */
const meta: Meta<typeof EmptyState> = {
  title: 'design-system/EmptyState',
  component: EmptyState,
  args: { description: 'No data yet' },
}
export default meta
type Story = StoryObj<typeof EmptyState>

export const Basic: Story = {}
