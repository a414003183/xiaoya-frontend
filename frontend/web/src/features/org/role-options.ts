import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchRoles, type RoleView } from './api/org.api'

/**
 * 账号角色字典的选项真源（org 卡 §3.4：`GET /roles`）。
 *
 * 角色集是**数据**不是枚举——旧禅道「后台→自定义→用户→角色列表」的那张表就在后端，前端只做
 * 「按当前语言取名字」一件事：labels 是「语言码 → 角色名」，服务端不枚举语言，缺当前语言时回退
 * 任一非空值，全缺才退到 code。所有角色下拉/筛选/单元格渲染一律走本文件，前端不再有任何角色清单。
 */

export const ROLES_QUERY_KEY = 'listRoles'

/** 角色字典（字典级小列表，全局共享一份缓存）。 */
export function useRoles() {
  return useQuery({ queryKey: [ROLES_QUERY_KEY], queryFn: fetchRoles })
}

/** i18next 语言码 → 字典语言码（字典键就是 i18n 语言码 zh-CN/en；未知语言原样返回 → 走回退链）。 */
function roleLanguage(language: string): string {
  if (language.startsWith('zh')) {
    return 'zh-CN'
  }
  if (language.startsWith('en')) {
    return 'en'
  }
  return language
}

/** 角色名：当前语言 → 任一非空语言 → 角色码（字典是唯一真源，前端不留兜底清单）。 */
export function roleLabel(role: RoleView, language: string): string {
  const labels = role.labels ?? {}
  const current = labels[roleLanguage(language)]
  if (current) {
    return current
  }
  return Object.values(labels).find((label) => label !== '') ?? role.code
}

/** 角色下拉选项（antd Select/筛选用），label 按当前语言取。 */
export function useRoleOptions(): { value: string; label: string }[] {
  const { i18n } = useTranslation()
  const roles = useRoles()
  return (roles.data?.items ?? []).map((role) => ({ value: role.code, label: roleLabel(role, i18n.language) }))
}

/**
 * 角色码 → 角色名（表格列/详情字段渲染用）。三位一体：字典到载前或未知码回落到 code 本身，
 * 空值显示 `-`——账号上的 role 为 null 是合法状态（未设置），不是缺数据。
 */
export function useRoleLabel(): (code: string | null | undefined) => string {
  const { i18n } = useTranslation()
  const roles = useRoles()
  const byCode = new Map((roles.data?.items ?? []).map((role) => [role.code, roleLabel(role, i18n.language)]))
  return (code) => (code === null || code === undefined || code === '' ? '-' : (byCode.get(code) ?? code))
}
