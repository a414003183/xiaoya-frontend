import type { Meta, StoryObj } from '@storybook/react'
import { PageLoading } from './page-loading'

/** PageLoading：页面级加载态。 */
const meta: Meta<typeof PageLoading> = {
  title: 'design-system/PageLoading',
  component: PageLoading,
}
export default meta
type Story = StoryObj<typeof PageLoading>

export const Default: Story = { args: {} }

export const WithTip: Story = { args: { tip: 'Loading users' } }
