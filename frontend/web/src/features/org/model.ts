import type { DepartmentNode } from '@zentao/api-client/generated/model/departmentNode'

/** org 域纯逻辑（01 §3.2 model.ts）：人员管理两页共用的部门树映射与工作量区间计算。 */

/** antd Tree 节点（key 前缀消歧，避免与业务 id 混淆）。 */
export type DepartmentTreeNode = { key: string; title: string; children: DepartmentTreeNode[] }

export function departmentTreeData(nodes: readonly DepartmentNode[]): DepartmentTreeNode[] {
  return nodes.map((node) => ({
    key: `department-${node.id}`,
    title: node.name,
    children: departmentTreeData(node.children),
  }))
}

/** Tree 选中 key → 部门 id（非本域 key 返回 null）。 */
export function departmentKeyId(key: string): number | null {
  if (!key.startsWith('department-')) {
    return null
  }
  const id = Number(key.slice('department-'.length))
  return Number.isFinite(id) ? id : null
}

export type DepartmentOption = { value: number; label: string }

/** 部门树 → 扁平选项（Select 用；层级以全角空格缩进表达）。 */
export function departmentOptions(nodes: readonly DepartmentNode[], depth = 0): DepartmentOption[] {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${'　'.repeat(depth)}${node.name}` },
    ...departmentOptions(node.children, depth + 1),
  ])
}

/** 部门 id → 名称（成员列表列展示用）。 */
export function departmentNames(nodes: readonly DepartmentNode[]): Map<number, string> {
  const map = new Map<number, string>()
  for (const node of nodes) {
    map.set(node.id, node.name)
    for (const [id, name] of departmentNames(node.children)) {
      map.set(id, name)
    }
  }
  return map
}

/** 当前自然月区间（工作量 filters[date] 缺省值；to = 当月最后一天）。 */
export function monthRange(today: string): { from: string; to: string } {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return { from: `${today.slice(0, 7)}-01`, to: lastDay }
}

// ── 账号表单共用（org §3.1 枚举与密码口径） ──
// 账号 role 的选项不在这里：角色集是数据（GET /roles 字典），见 ../role-options.ts——前端禁止内置角色清单。

/** gender 枚举（§3.1：m|f）。 */
export const ACCOUNT_GENDERS = ['m', 'f'] as const

type Translate = (key: string) => string

export function accountGenderOptions(t: Translate) {
  return ACCOUNT_GENDERS.map((value) => ({ value, label: t(`org.account.gender.${value}`) }))
}

/** 随机密码（B-WKS-03 批量页/重置弹窗共用）：crypto 随机 12 位，字符集去掉易混 0O1lIi。 */
export function randomPassword(length = 12): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => charset[byte % charset.length]).join('')
}
