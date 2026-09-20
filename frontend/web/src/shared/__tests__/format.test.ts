import { describe, expect, test } from 'vitest'
import { formatDateTime } from '../format'

/** formatDateTime（STATE 待裁决 ㉓）：zh-CN 风格 yyyy-MM-dd HH:mm，秒以下截断；空/非法值回落空串。 */
describe('formatDateTime', () => {
  test('输出 yyyy-MM-dd HH:mm（不含秒），小时数随本地时区但不破形', () => {
    expect(formatDateTime('2026-09-18T11:59:02.870847Z')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    // 同一分钟内的秒/毫秒差异不影响输出（截断）
    expect(formatDateTime('2026-09-18T11:59:02Z')).toBe(formatDateTime('2026-09-18T11:59:58Z'))
  })

  test('空值与非法值回落空串（占位由调用方决定）', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime(undefined)).toBe('')
    expect(formatDateTime('')).toBe('')
    expect(formatDateTime('not-a-date')).toBe('')
  })
})
