import { initI18n, loadLanguage } from '@zentao/i18n'
import { beforeEach, describe, expect, test } from 'vitest'
import { formatDateTime } from '../format'

initI18n()

/** formatDateTime（STATE 待裁决 ㉓）：zh-CN 风格 yyyy-MM-dd HH:mm，秒以下截断；空/非法值回落空串。 */
describe('formatDateTime', () => {
  // FE-08 后格式随界面语言：本组断言的是 zh-CN 口径，显式钉住 locale（断言本身不变）
  beforeEach(async () => {
    await loadLanguage('zh-CN')
  })

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

/** FE-08 对照用例：en 界面走 en-US 惯例（MM/DD/YYYY, h:mm AM/PM）。 */
describe('formatDateTime（en 对照）', () => {
  beforeEach(async () => {
    await loadLanguage('en')
  })

  test('en 输出 en-US 惯例日期时间（含 AM/PM），不再硬编码 zh-CN 形', async () => {
    expect(formatDateTime('2026-09-18T11:59:02.870847Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2} [AP]M$/)
    // 同一分钟内截断口径与 zh 一致
    expect(formatDateTime('2026-09-18T11:59:02Z')).toBe(formatDateTime('2026-09-18T11:59:58Z'))
    // 形与 zh-CN 不同（zh 恒 yyyy-MM-dd HH:mm，不可能出现斜杠+AM/PM）
    expect(formatDateTime('2026-09-18T11:59:02Z')).not.toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  test('en 下空值与非法值仍回落空串', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime('not-a-date')).toBe('')
  })
})
