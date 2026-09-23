import type { Meta, StoryObj } from '@storybook/react'
import type { ColumnMeta, ColumnPrefStore } from './column-setting'
import { ColumnSettingModal } from './column-setting'

/** 不落任何地方的存储桩（与无 Provider 同语义：保存/重置只关弹窗）。 */
const noopStore: ColumnPrefStore = {
  usePref: () => ({ pref: null, loading: false }),
  save: async () => undefined,
  reset: async () => undefined,
}

const metas: ColumnMeta[] = [
  { id: 'id', title: 'ID' },
  { id: 'name', title: 'Name' },
  { id: 'status', title: 'Status' },
]

/**
 * ColumnSettingModal（列设置齿轮的落点）：拖拽排序 + 显隐 + 左/中/右固定三态。
 */
const meta: Meta<typeof ColumnSettingModal> = {
  title: 'design-system/ColumnSettingModal',
  component: ColumnSettingModal,
  args: { open: true, metas, pref: null, resource: 'demo-rows', store: noopStore, onClose: () => {} },
}
export default meta
type Story = StoryObj<typeof ColumnSettingModal>

export const Open: Story = {}

export const WithExistingPref: Story = {
  args: {
    pref: [
      { key: 'id', visible: true, fixed: 'left' },
      { key: 'name', visible: true, fixed: null },
      { key: 'status', visible: false, fixed: null },
    ],
  },
}
