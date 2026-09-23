import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { type DomainMeta, fetchMeta } from './meta'

/**
 * 列表筛选选项的唯一来源（03 §5）：值域是业务枚举（状态/类型/优先级/严重程度/解决方案/阶段/来源/访问控制/
 * 模型/是否确认/结果/关闭原因/角色…）的筛选项一律走 meta，不在前端写死清单——后端加值前端自动出现。
 *
 * `q`/日期/`departmentId`/`assignee` 这类非枚举筛选项（关键词、区间、字典 id）不走这里；
 * 页面级视图开关（tab/view）也不是业务枚举。
 */

/** 只要能把 key 翻成文案即可（与 api-client 的 Translator 同构，不为类型引依赖）。 */
export type Translate = (key: string) => string

/** 域字段目录（按域缓存一份，多个筛选项共用同一次请求）。 */
export function useDomainMeta(domain: string) {
  return useQuery({ queryKey: ['getMeta', domain], queryFn: () => fetchMeta(domain) })
}

/**
 * 域字段选项 → antd Select options（value 统一成字符串，与 URL 同形）。
 * 未载入/字段缺失/字段无 options 一律返回空数组：筛选条先渲染，选项随后到，不阻塞页面。
 */
export function metaOptions(
  meta: DomainMeta | undefined,
  fieldKey: string,
  t: Translate,
): { value: string; label: string }[] {
  const field = (meta?.fields ?? []).find((item) => item.key === fieldKey)
  return (field?.options ?? []).map((option) => ({
    value: String(option.value),
    label: option.i18n ? t(option.i18n) : String(option.value),
  }))
}

/**
 * 计算字典项（§3.9 `GET /dicts/{name}`）→ antd Select options。
 * 两种条目形都认：代码注册的内置字典给 `{value,i18n}`（i18n 是**翻译键**，
 * 译文在前端解析）；DB 字典（T16）给 `{value,label}`（管理员填的**字面文案**，不是翻译键）。
 * label 优先：它只会出现在 DB 字典上，不会与翻译键混。
 */
export function dictOptions(
  items: readonly { value: string; i18n?: string | undefined; label?: string | undefined }[] | undefined,
  t: Translate,
): { value: string; label: string }[] {
  return (items ?? []).map((item) => ({
    value: item.value,
    label: item.label ?? (item.i18n ? t(item.i18n) : item.value),
  }))
}

/**
 * 数值枚举（severity/priority 等 number 列）→ antd Select options，value 保持 number：
 * 表单提交体与契约同形（`metaOptions` 的字符串值是给 URL filters 用的，两者不可混用）。
 */
export function metaNumberOptions(
  meta: DomainMeta | undefined,
  fieldKey: string,
  t: Translate,
): { value: number; label: string }[] {
  return metaOptions(meta, fieldKey, t).map((option) => ({ value: Number(option.value), label: option.label }))
}

/** 便捷取用：一个域一行拿到「字段 → 选项」函数（筛选字段定义处不再各写 useQuery）。 */
export function useMetaOptions(domain: string): {
  options: (fieldKey: string) => { value: string; label: string }[]
  isLoading: boolean
} {
  const meta = useDomainMeta(domain)
  const { t } = useTranslation()
  return {
    options: (fieldKey: string) => metaOptions(meta.data, fieldKey, t),
    isLoading: meta.isPending,
  }
}
