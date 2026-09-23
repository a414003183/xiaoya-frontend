import type { Meta, StoryObj } from '@storybook/react'
import { Modal } from './app-modal'

/**
 * Modal（app-modal）：全站弹窗共用高度/宽度口径的包装。story 只登记形态；运行器接入见
 * docs/plan/governance/quality-gate.md §Storybook（暂由 tsc 保证可编译）。
 */
const meta: Meta<typeof Modal> = {
  title: 'design-system/Modal',
  component: Modal,
}
export default meta
type Story = StoryObj<typeof Modal>

export const Basic: Story = {
  args: { open: true, title: 'Modal title', children: 'Body scrolls when it outgrows the viewport' },
}

export const CustomWidth: Story = {
  args: { open: true, title: 'Wide modal', width: 720, children: 'Pages pass width explicitly for wide forms' },
}
