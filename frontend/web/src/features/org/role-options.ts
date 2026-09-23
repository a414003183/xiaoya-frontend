import { useQuery } from '@tanstack/react-query'
import { fetchRoles, type RoleView } from './api/org.api'

/**
 * 角色的选项真源（T23 统一实体：`GET /roles` 返回全部角色，含权限码数与成员数）。
 *
 * 角色集是**数据**不是枚举——管理端可增删改。所有角色下拉/筛选/单元格渲染一律走本文件，
 * 前端不留任何角色清单；角色名是管理员填的字面文案（不再是「按语言取 labels」）。
 */

export const ROLES_QUERY_KEY = ['listRoles'] as const

/** 角色列表（配置级小列表，全局共享一份缓存）。 */
export function useRoles() {
  return useQuery({ queryKey: ROLES_QUERY_KEY, queryFn: fetchRoles })
}

/** 角色下拉选项：value 是角色 id（账号与角色是成员关系，按 id 关联）。 */
export function useRoleOptions(): { value: number; label: string }[] {
  const roles = useRoles()
  return (roles.data?.items ?? []).map((role) => ({ value: role.id, label: role.name }))
}

/** 角色 id → 名字（表格列/详情渲染用）：列表未载入或未知 id 回落到 `#id`，空值显示 `-`。 */
export function useRoleLabel(): (roleId: number | null | undefined) => string {
  const roles = useRoles()
  const byId = new Map((roles.data?.items ?? []).map((role) => [role.id, role.name]))
  return (roleId) => {
    if (roleId === null || roleId === undefined) {
      return '-'
    }
    return byId.get(roleId) ?? `#${roleId}`
  }
}

/** 角色 id 集 → 名字串（账号列表的「角色」列：一个账号可能有多个角色）。 */
export function useRoleLabels(): (roleIds: readonly number[] | undefined) => string {
  const label = useRoleLabel()
  return (roleIds) => {
    const names = (roleIds ?? []).map((id) => label(id)).filter((name) => name !== '-')
    return names.length === 0 ? '-' : names.join('、')
  }
}

/** 角色名（详情/标题用）。 */
export function roleLabel(role: RoleView): string {
  return role.name
}
