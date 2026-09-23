import type { Meta, StoryObj } from '@storybook/react'
import { Fragment } from 'react'
import { MENU_ICONS, MenuIcon } from './menu-icon'

/**
 * MenuIcon：菜单图标名字表（MENU_ICONS）的渲染口——名字为空/未登记返回 null，不报错。
 */
const meta: Meta<typeof MenuIcon> = {
  title: 'design-system/MenuIcon',
  component: MenuIcon,
}
export default meta
type Story = StoryObj<typeof MenuIcon>

export const Named: Story = { args: { name: 'UserOutlined' } }

export const Unregistered: Story = { args: { name: 'NoSuchIcon' } }

/** 全名字表（图标选择器的选项面）。 */
export const Gallery: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {Object.keys(MENU_ICONS).map((name) => (
        <Fragment key={name}>
          <MenuIcon name={name} />
        </Fragment>
      ))}
    </div>
  ),
}
