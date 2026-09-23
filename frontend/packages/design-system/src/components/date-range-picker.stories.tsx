import type { Meta, StoryObj } from '@storybook/react'
import { DateRangePicker } from './date-range-picker'

/**
 * DateRangePicker：全站唯一的日期筛选控件（值形态 = `a..b`，单边留空即开区间）。
 */
const meta: Meta<typeof DateRangePicker> = {
  title: 'design-system/DateRangePicker',
  component: DateRangePicker,
}
export default meta
type Story = StoryObj<typeof DateRangePicker>

export const Empty: Story = { args: {} }

export const ClosedRange: Story = { args: { value: '2026-09-01..2026-09-07' } }

export const OpenStart: Story = { args: { value: '..2026-09-07' } }
