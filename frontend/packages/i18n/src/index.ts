import i18next, { type i18n as I18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const STORAGE_KEY = 'zentao.language'

/** 启动读回持久化语言（06 A4-1）；读不到/私有模式一律回退 zh-CN。 */
export function persistedLanguage(): SupportedLanguage {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

/** 当前界面语言（与 i18next 同源，非 React 场景取语言的唯一出口，如 shared/format.ts）。 */
export function currentLanguage(): SupportedLanguage {
  return i18next.language === 'en' ? 'en' : 'zh-CN'
}

/** `<html lang>` 随语言联动（FE-06）：所有切换路径（loadLanguage / 覆盖层重设语言）都汇合到 languageChanged。 */
function syncDocumentLang(language: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language
  }
}

// en 语言包走动态导入（P6 T-8 首屏预算）：默认 zh-CN 急切可用，en 在 loadLanguage('en')
// 时才随懒 chunk 加载，不进首屏。切换同时落 localStorage（06 A4-1 持久化）。
export async function loadLanguage(language: SupportedLanguage): Promise<I18n> {
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // 私有模式等场景：切换仍生效，仅不持久化
  }
  if (language === 'en' && !i18next.hasResourceBundle('en', 'translation')) {
    const { default: en } = await import('./locales/en.json')
    i18next.addResourceBundle('en', 'translation', en)
  }
  await i18next.changeLanguage(language)
  return i18next
}

export function initI18n(): I18n {
  if (i18next.isInitialized) {
    return i18next
  }
  // FE-06：`<html lang>` 初始即按当前语言（持久化值），此后随 languageChanged 联动（唯一出口）
  syncDocumentLang(persistedLanguage())
  i18next.on('languageChanged', syncDocumentLang)
  void i18next.use(initReactI18next).init({
    resources: { 'zh-CN': { translation: zhCN } },
    // en 经 loadLanguage 异步装载；init 阶段只有 zh-CN 资源，直接以 en 初始化会渲染裸键
    lng: 'zh-CN',
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false },
  })
  // 之前会话保存过 en：资源装载后 i18next 自动切过去（首轮渲染 zh，装载完成即翻转）
  if (persistedLanguage() === 'en') {
    void loadLanguage('en')
  }
  return i18next
}
