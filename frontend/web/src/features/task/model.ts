import type { TaskView } from '@zentao/api-client/generated/model/taskView'
import type { StatusTone } from '@zentao/design-system'
import type { MetaAction } from '../../shared/meta'
import type { BatchCreateResultItem } from './api/task.api'

/** task 域纯逻辑（01 §3.2 model.ts）：状态/类型映射、parentId 树装配、进度/逾期派生、批量创建行装配。 */

export const TASK_STATUSES = ['wait', 'doing', 'done', 'pause', 'cancel', 'closed'] as const
export const TASK_TYPES = ['design', 'devel', 'request', 'test', 'study', 'discuss', 'ui', 'affair', 'misc'] as const

const TONE: Record<string, StatusTone> = {
  wait: 'pending',
  doing: 'active',
  done: 'closed',
  pause: 'warning',
  cancel: 'neutral',
  closed: 'closed',
}

export function statusTone(status: string): StatusTone {
  return TONE[status] ?? 'neutral'
}

/** 逾期判定口径（§3 派生展示）：deadline < 今天 且 status ∈ wait/doing/pause。 */
const OVERDUE_STATUSES: readonly string[] = ['wait', 'doing', 'pause']

export function isOverdue(task: Pick<TaskView, 'deadline' | 'status'>, today: string): boolean {
  if (!task.deadline || !OVERDUE_STATUSES.includes(task.status)) {
    return false
  }
  return task.deadline < today
}

/** 进度 = consumedHours ÷ (consumedHours + leftHours)，无工时口径时为 0。 */
export function taskProgress(task: Pick<TaskView, 'consumedHours' | 'leftHours'>): number {
  const consumed = task.consumedHours ?? 0
  const left = task.leftHours ?? 0
  const total = consumed + left
  if (total <= 0) {
    return 0
  }
  return Math.min(Math.round((consumed / total) * 100), 100)
}

/** 平铺列表 + parentId → 一层父子树（父不在当前可见集时提升为根；同级按 id）。 */
export type TaskNode = TaskView & { children: TaskNode[] }

export function buildTaskTree(items: readonly TaskView[]): TaskNode[] {
  const nodes = new Map<number, TaskNode>(items.map((item) => [item.id, { ...item, children: [] }]))
  const roots: TaskNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId > 0 ? nodes.get(node.parentId) : undefined
    if (parent && parent.id !== node.id) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  sortTree(roots)
  return roots
}

function sortTree(nodes: TaskNode[]): void {
  nodes.sort((a, b) => a.id - b.id)
  for (const node of nodes) {
    sortTree(node.children)
  }
}

/**
 * 动作区可见性：meta allowedStatus × 当前状态，叠加父任务专属规则（§4）——
 * 父任务只允许 assign/pause/resume/cancel/close/activate，start/finish 隐藏；
 * close 的 wait/doing/pause 来源仅父任务可用。
 */
export function visibleTaskActions(
  actions: readonly MetaAction[] | undefined,
  status: string | undefined,
  isParent: boolean,
): MetaAction[] {
  return (actions ?? []).filter((action) => {
    const allowed = action.allowedStatus
    if (isParent && (action.action === 'start' || action.action === 'finish')) {
      return false
    }
    if (action.action === 'close' && !isParent && status !== 'done' && status !== 'cancel') {
      return false
    }
    if (!allowed || allowed.length === 0) {
      return true
    }
    return status !== undefined && allowed.includes(status)
  })
}

/** close 守卫：非 done/cancel 来源时 closedReason 必填（§4）。 */
export function closeReasonRequired(status: string | undefined): boolean {
  return status !== 'done' && status !== 'cancel'
}

// ── 批量创建（§3 创建约束 / §5 逐项结果） ──

/** 批量创建行（整表可编辑；child=true 表示上一行为其父任务 → 提交时转 parentIndex）。 */
export type BatchCreateRow = {
  key: number
  title: string
  type: string
  priority: number
  estimateHours: number | null
  assignee: string | null
  deadline: string
  child: boolean
}

export type BatchCreateItem = {
  title: string
  type: string
  priority: number
  estimateHours?: number | null
  assignee?: string | null
  deadline?: string | null
  parentIndex?: number
}

export const BATCH_CREATE_MAX_ROWS = 50

/** 行 → 请求体：仅提交已填名称的行；child 行的 parentIndex = 上方最近一条已提交行的下标。 */
export function batchCreateItems(rows: readonly BatchCreateRow[]): { items: BatchCreateItem[]; keys: number[] } {
  const items: BatchCreateItem[] = []
  const keys: number[] = []
  for (const row of rows) {
    const title = row.title.trim()
    if (title.length === 0) {
      continue
    }
    const index = items.length
    const item: BatchCreateItem = {
      title,
      type: row.type,
      priority: row.priority,
      estimateHours: row.estimateHours,
      assignee: row.assignee,
      deadline: row.deadline === '' ? null : row.deadline,
    }
    // 父行未提交（名称为空）时退化为顶层任务，避免悬挂占位
    const parentIndex = index - 1
    if (row.child && parentIndex >= 0) {
      item.parentIndex = parentIndex
    }
    items.push(item)
    keys.push(row.key)
  }
  return { items, keys }
}

/** 逐项结果 → 行结果：父行失败时子行连带提示（前端派生，不再发第二条请求）。 */
export type BatchCreateOutcome = { ok: boolean; id: number | null; error: string | null }

export function batchCreateOutcomes(
  rows: readonly BatchCreateRow[],
  results: readonly BatchCreateResultItem[],
): Map<number, BatchCreateOutcome> {
  const { items, keys } = batchCreateItems(rows)
  const outcomes = new Map<number, BatchCreateOutcome>()
  items.forEach((item, index) => {
    const key = keys[index]
    if (key === undefined) {
      return
    }
    const result = results.find((entry) => entry.index === index)
    const own: BatchCreateOutcome = {
      ok: result?.ok ?? false,
      id: result?.id ?? null,
      error: result?.ok ? null : (result?.error ?? 'task.message.batchFailed'),
    }
    const parentOutcome = item.parentIndex === undefined ? undefined : outcomes.get(keys[item.parentIndex] ?? -1)
    if (!own.ok && parentOutcome && !parentOutcome.ok) {
      outcomes.set(key, { ok: false, id: null, error: 'task.message.parentFailed' })
      return
    }
    outcomes.set(key, own)
  })
  return outcomes
}
