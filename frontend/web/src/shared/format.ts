/**
 * 时间戳本地化展示（STATE 待裁决 ㉓：详情页时间戳不做本地化已裁决为补共享 util）。
 * zh-CN 风格 yyyy-MM-dd HH:mm，秒以下截断（不展示秒/毫秒）；空值与非法值回落空串，占位由调用方决定。
 */
const formatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const parts = formatter.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`
}
