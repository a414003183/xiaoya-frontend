import type { ProjectView } from '@zentao/api-client/generated/model/projectView'
import type { TeamMemberInput } from '@zentao/api-client/generated/model/teamMemberInput'
import type { TeamMemberView } from '@zentao/api-client/generated/model/teamMemberView'
import type { StatusTone } from '@zentao/design-system'

/** project 域纯逻辑（01 §3.2 model.ts）：状态映射 / 平铺+path 建树 / 成员表 diff / 列表页签 → filters。 */

export const EXECUTION_TYPES = ['sprint', 'stage', 'kanban'] as const
/** 三型共用的六动作（project §4）。 */
export const PROJECT_ACTION_NAMES = ['start', 'suspend', 'resume', 'delay', 'close', 'activate'] as const

const TONE: Record<string, StatusTone> = {
  wait: 'pending',
  doing: 'active',
  suspended: 'pending',
  delay: 'error',
  closed: 'closed',
}

export function statusTone(status: string): StatusTone {
  return TONE[status] ?? 'neutral'
}

/** 平铺 + path → 树（project §2：path=,id,id, 物化路径；父不可见时提升为根，树由前端组装）。 */
export type ProjectNode = ProjectView & { children: ProjectNode[] }

/**
 * 建树（programs 列表页折叠树 / 子项目集页签复用）：
 * 父级取 path 倒数第二段（path 缺失或父不在当前可见集时回退 parentId），同级按 sort、id 排。
 */
export function buildProjectTree(items: readonly ProjectView[]): ProjectNode[] {
  const nodes = new Map<number, ProjectNode>(items.map((item) => [item.id, { ...item, children: [] }]))
  const roots: ProjectNode[] = []
  for (const node of nodes.values()) {
    const parentId = parentIdOf(node, nodes)
    const parent = parentId === 0 ? undefined : nodes.get(parentId)
    if (parent && parent.id !== node.id) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  sortTree(roots)
  return roots
}

/** 物化路径 `,1,3,` 的倒数第二段 = 直接父级；父不在可见集则回退 parentId。 */
function parentIdOf(node: ProjectView, nodes: Map<number, ProjectNode>): number {
  const segments = (node.path ?? '').split(',').filter((segment) => segment.length > 0)
  const fromPath = segments.length > 1 ? Number(segments[segments.length - 2]) : 0
  if (fromPath > 0 && nodes.has(fromPath)) {
    return fromPath
  }
  return node.parentId
}

function sortTree(nodes: ProjectNode[]): void {
  nodes.sort((a, b) => a.sort - b.sort || a.id - b.id)
  for (const node of nodes) {
    sortTree(node.children)
  }
}

/** 团队成员编辑行（整表可编辑：account 之外的列全部可改）。 */
export type MemberRow = {
  account: string
  role: string | null
  joinDate: string
  days: number
  hours: number
  sort: number
}

export type MembersDiff = {
  added: string[]
  removed: string[]
  updated: string[]
  /** POST /…/members 的全量提交体（members 按 sort、account 稳定排序，同输入恒同输出 = 幂等）。 */
  members: TeamMemberInput[]
}

const MEMBER_FIELDS = ['role', 'joinDate', 'days', 'hours', 'sort'] as const

/**
 * 成员表 diff（project §3.7 / §5 members 全量提交）：增/删/改只是展示口径，
 * 提交体恒为整表（后端 diff 落库），因此重复提交同表不产生变更。
 */
export function membersDiff(originals: readonly TeamMemberView[], rows: readonly MemberRow[]): MembersDiff {
  const originalByAccount = new Map(originals.map((member) => [member.account, member]))
  const draftAccounts = new Set(rows.map((row) => row.account))
  const added: string[] = []
  const updated: string[] = []
  for (const row of rows) {
    const original = originalByAccount.get(row.account)
    if (!original) {
      added.push(row.account)
      continue
    }
    if (MEMBER_FIELDS.some((field) => (original[field] ?? null) !== (row[field] ?? null))) {
      updated.push(row.account)
    }
  }
  const removed = originals.filter((member) => !draftAccounts.has(member.account)).map((member) => member.account)
  const members = [...rows]
    .sort((a, b) => a.sort - b.sort || a.account.localeCompare(b.account))
    .map((row) => ({
      account: row.account,
      role: row.role,
      joinDate: row.joinDate,
      days: row.days,
      hours: row.hours,
      sort: row.sort,
    }))
  return { added, removed, updated, members }
}
