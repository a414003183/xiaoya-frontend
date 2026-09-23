// @vitest-environment jsdom
import dayjs from 'dayjs'
import { afterEach, describe, expect, test } from 'vitest'
import { antdLocaleZhCN, dayjsLocaleFor, loadAntdLocale } from './locale'

/**
 * dayjs 全局 locale 与 antd locale 同出口联动（T71 / AUDIT FE-07）：
 * DatePicker 面板月份/星期名取自 dayjs locale，只接 antd locale 时面板仍英文。
 */
afterEach(async () => {
  await loadAntdLocale('zh-CN')
})

describe('loadAntdLocale（FE-07）', () => {
  test('切 en：dayjs 月份/星期变英文，返回 antd en_US', async () => {
    const locale = await loadAntdLocale('en')
    expect(locale).not.toBe(antdLocaleZhCN)
    expect(dayjs('2026-09-22').format('MMM')).toBe('Sep')
    expect(dayjs('2026-09-22').format('ddd')).toBe('Tue')
  })

  test('切 zh-CN：dayjs 月份/星期变中文，返回急切的 zh_CN', async () => {
    const locale = await loadAntdLocale('zh-CN')
    expect(locale).toBe(antdLocaleZhCN)
    expect(dayjs('2026-09-22').format('MMM')).toBe('9月')
    expect(dayjs('2026-09-22').format('ddd')).toBe('周二')
  })

  test('dayjsLocaleFor：i18n 码（zh-CN/en）→ dayjs 码（zh-cn/en），未知回落 zh-cn', () => {
    expect(dayjsLocaleFor('en')).toBe('en')
    expect(dayjsLocaleFor('zh-CN')).toBe('zh-cn')
    expect(dayjsLocaleFor('fr')).toBe('zh-cn')
  })
})
