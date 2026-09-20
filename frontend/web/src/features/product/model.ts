import type { CategoryView } from '@zentao/api-client/generated/model/categoryView'
import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import type { StatusTone } from '@zentao/design-system'

/** product 域纯逻辑（01 §3.2 model.ts）：状态映射 / 看板分列 / 跟踪矩阵 / 分类建树。 */

export const PRODUCT_STATUSES = ['normal', 'closed'] as const
export const PLAN_STATUSES = ['wait', 'doing', 'done', 'closed'] as const
export const PLAN_CLOSE_REASONS = ['done', 'cancel'] as const

const TONE: Record<string, StatusTone> = {
  normal: 'active',
  active: 'active',
  wait: 'pending',
  doing: 'active',
  done: 'closed',
  closed: 'closed',
  terminated: 'error',
}

export function statusTone(status: string): StatusTone {
  return TONE[status] ?? 'neutral'
}

/** 看板分列（K 范式只读）：按给定状态序分列，列内保持入参顺序。 */
export function groupByStatus<T extends { status: string }>(
  items: readonly T[],
  statuses: readonly string[],
): { status: string; items: T[] }[] {
  return statuses.map((status) => ({ status, items: items.filter((item) => item.status === status) }))
}

/** 跟踪矩阵（product §6 track）：行 = 需求，列 = 发布，cell = 该发布是否关联该需求。 */
export type TrackRow = { storyId: number; title: string; cells: boolean[] }

export function buildTrackMatrix(
  stories: readonly StoryView[],
  releases: readonly { id: number; storyIds?: number[] }[],
): { releaseIds: number[]; rows: TrackRow[] } {
  const linked = releases.map((release) => new Set(release.storyIds ?? []))
  return {
    releaseIds: releases.map((release) => release.id),
    rows: stories.map((story) => ({
      storyId: story.id,
      title: story.title,
      cells: linked.map((ids) => ids.has(story.id)),
    })),
  }
}

/** 父计划候选（plan §3.4 父子仅两级）：同产品一级计划，排除自身与已关闭计划。 */
export function parentPlanOptions<T extends { id: number; parentId?: number; status?: string }>(
  plans: readonly T[],
  currentPlanId?: number,
): T[] {
  return plans.filter((plan) => (plan.parentId ?? 0) === 0 && plan.id !== currentPlanId && plan.status !== 'closed')
}

/** 发布创建抽屉：buildId 选择器按 branchId 联动（T-10）。 */
export function buildsOfBranch<T extends { branchId?: number }>(builds: readonly T[], branchId: number): T[] {
  return builds.filter((build) => (build.branchId ?? 0) === branchId)
}

/** 分类树组装（product §3.3：小集合内存建树，parentId=0 为根，同级按 sort/id 排）。 */
export type CategoryNode = CategoryView & { children: CategoryNode[] }

export function buildCategoryTree(nodes: readonly CategoryView[], parentId = 0): CategoryNode[] {
  return nodes
    .filter((node) => (node.parentId ?? 0) === parentId)
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
    .map((node) => ({ ...node, children: buildCategoryTree(nodes, node.id) }))
}

/**
 * 批量编辑（B 范式）：只挑出与原始值不同的字段，未变化的行返回空对象不提交。
 */
export function pickChangedFields<T extends object>(
  original: T,
  edited: Partial<T>,
  keys: readonly (keyof T)[],
): Partial<T> {
  const patch: Partial<T> = {}
  for (const key of keys) {
    if (key in edited && edited[key] !== original[key]) {
      patch[key] = edited[key]
    }
  }
  return patch
}

/** 逗号 IN 过滤值拼装（列表页页签 → filters[x]）。 */
export function commaFilter(values: readonly string[]): string {
  return values.join(',')
}
