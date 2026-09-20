import { useQuery } from '@tanstack/react-query'
import { ok } from '@zentao/api-client'
import { listLangOverrides } from '@zentao/api-client/generated'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * 文案覆盖层运行时合并（platform 卡 §3.12）——上传到 lang_item 的覆盖文案在这里真正生效。
 *
 * 背景：lang_item 只是服务端覆盖层，i18next 只认语言包资源；本模块把 GET /lang-items/overrides
 * 的全量覆盖（flat 全点分键）展开成嵌套对象后 `addResourceBundle(..., deep, overwrite)` 合并进
 * 当前语言，覆盖包（打包好的语言包）优先级低于它——已加载与懒加载（en）两种情形都覆盖得到。
 *
 * 边界：仅在登录态区域内挂载（app-router 的会话门内），登录页不发该请求；失败静默降级为语言包默认
 * （覆盖层是增强，不该在界面上弹错）；切语言时 queryKey 变化重新拉取并合并新语言。
 */

/** 界面语言码 → 覆盖层语言码（i18next 用 zh-CN/en，lang_item 存 zh-cn/en）。 */
export function overrideLang(language: string): string {
  return language === 'en' ? 'en' : 'zh-cn'
}

/** flat 全点分键 → 嵌套对象（i18next addResourceBundle 的资源形状）。纯函数，单测覆盖。 */
export function expandOverrides(items: { key: string; value: string }[]): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const item of items) {
    const segments = item.key.split('.')
    let node = root
    for (const segment of segments.slice(0, -1)) {
      const next = node[segment]
      if (typeof next === 'object' && next !== null) {
        node = next as Record<string, unknown>
        continue
      }
      const created: Record<string, unknown> = {}
      node[segment] = created
      node = created
    }
    node[segments[segments.length - 1] as string] = item.value
  }
  return root
}

/** 覆盖层装载器：渲染 null，只负责取数与合并（挂载点见 app/app-router.tsx）。 */
export function LangOverrides(): null {
  const { i18n } = useTranslation()
  const lang = overrideLang(i18n.language)
  const overrides = useQuery({
    queryKey: ['listLangOverrides', lang],
    queryFn: async () => ok(await listLangOverrides({ lang })).data.items,
  })

  useEffect(() => {
    const items = overrides.data
    if (items === undefined || items.length === 0) {
      return
    }
    i18n.addResourceBundle(i18n.language, 'translation', expandOverrides(items), true, true)
    // 资源包变更本身不发事件：重设同语言以触发 languageChanged → react-i18next 重渲染取到新文案
    void i18n.changeLanguage(i18n.language)
  }, [overrides.data, i18n, i18n.language])

  return null
}
