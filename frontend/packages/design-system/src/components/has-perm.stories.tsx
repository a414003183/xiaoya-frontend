import type { Meta, StoryObj } from '@storybook/react'
import { HasPerm, PermScope } from './has-perm'

/**
 * HasPerm / PermScope：前端显隐只认 privileges（真鉴权永远在后端）。
 * 渲染需要 PermScope 提供权限集，故用 render 形态。
 */
const meta: Meta<typeof HasPerm> = {
  title: 'design-system/HasPerm',
  component: HasPerm,
}
export default meta
type Story = StoryObj<typeof HasPerm>

export const Granted: Story = {
  render: () => (
    <PermScope privileges={['demo-view']}>
      <HasPerm perm="demo-view">
        <span>Visible with permission</span>
      </HasPerm>
    </PermScope>
  ),
}

export const MissingWithFallback: Story = {
  render: () => (
    <PermScope privileges={[]}>
      <HasPerm perm="demo-view" fallback={<span>Fallback shown</span>}>
        <span>Hidden</span>
      </HasPerm>
    </PermScope>
  ),
}
