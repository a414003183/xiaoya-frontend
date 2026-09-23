import type { Meta, StoryObj } from '@storybook/react'
import { PageContainer } from './page-container'

/** PageContainer：页面内容容器（宽/窄两态）。 */
const meta: Meta<typeof PageContainer> = {
  title: 'design-system/PageContainer',
  component: PageContainer,
}
export default meta
type Story = StoryObj<typeof PageContainer>

export const Wide: Story = { args: { variant: 'wide', children: 'Wide page content' } }

export const Narrow: Story = { args: { variant: 'narrow', children: 'Narrow page content' } }
