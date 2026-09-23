import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { initI18n, loadLanguage } from '@zentao/i18n'
import { afterEach, describe, expect, test } from 'vitest'

/**
 * `<html lang>` 随语言联动（T71 / AUDIT FE-06）：初始按持久化语言（index.html 内联引导 + initI18n），
 * 切换统一走 i18next `languageChanged` 唯一出口（loadLanguage 与覆盖层重设语言都汇合到它）。
 */
initI18n()

afterEach(async () => {
  await loadLanguage('zh-CN')
  localStorage.removeItem('zentao.language')
})

describe('html lang 联动（FE-06）', () => {
  test('loadLanguage 切 EN/ZH 同步 documentElement.lang', async () => {
    await loadLanguage('en')
    expect(document.documentElement.lang).toBe('en')
    await loadLanguage('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  test('不经 loadLanguage 的 changeLanguage（覆盖层重设语言路径）同样联动', async () => {
    const i18n = await loadLanguage('en')
    await i18n.changeLanguage('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
  })

  test('index.html 带初始 lang 引导（首帧即按持久化语言，不等 JS 应用启动）', () => {
    // jsdom 环境下 import.meta.url 被改写成 http 基址，按 cwd（= web 包根，pnpm test 的运行目录）取文件
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
    expect(html).toContain('document.documentElement.lang')
    expect(html).toContain("localStorage.getItem('zentao.language')")
  })
})
