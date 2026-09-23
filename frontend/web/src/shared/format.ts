import { currentLanguage } from '@zentao/i18n'

/**
 * 时间戳本地化展示（STATE 待裁决 ㉓：详情页时间戳不做本地化已裁决为补共享 util）。
 * 格式随界面语言（FE-08，与 i18n 同源）：zh-CN 风格 yyyy-MM-dd HH:mm（秒以下截断）；
 * en 走 en-US 惯例 MM/DD/YYYY, h:mm AM/PM。空值与非法值回落空串，占位由调用方决定。
 */

const PART_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}

/** zh-CN 走 formatToParts 手工拼装（Intl 的 zh-CN 日期是斜杠形，yyyy-MM-dd 是产品口径）。 */
const zhFormatter = new Intl.DateTimeFormat('zh-CN', { ...PART_OPTIONS, hour12: false })

/** en 走 en-US 自然输出（`09/18/2026, 11:59 AM`）；显式组件选项保证各 ICU 版本同形。 */
const enFormatter = new Intl.DateTimeFormat('en-US', { ...PART_OPTIONS, hour12: true })

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  if (currentLanguage() === 'en') {
    return enFormatter.format(date)
  }
  const parts = zhFormatter.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`
}
