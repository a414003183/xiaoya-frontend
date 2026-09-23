import { ok } from '@zentao/api-client'
import {
  activateStory,
  assignStory,
  batchCreateStories,
  batchStories,
  changeDoneStory,
  changeStory,
  closeStory,
  createStory,
  deleteStory,
  getDict,
  getStory,
  listStories,
  listStoryActivities,
  passStory,
  rejectStory,
  submitStoryReview,
  updateStory,
} from '@zentao/api-client/generated'
import type { ActivityView } from '@zentao/api-client/generated/model/activityView'
import type { BatchActionRequest } from '@zentao/api-client/generated/model/batchActionRequest'
import type { ListStoriesParams } from '@zentao/api-client/generated/model/listStoriesParams'
import type { StoryCloseRequest } from '@zentao/api-client/generated/model/storyCloseRequest'
import type { StoryUpdateRequest } from '@zentao/api-client/generated/model/storyUpdateRequest'
import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import { buildListParams, type ListDsl } from '../../../shared/list-dsl'
import { type DomainMeta, fetchMeta } from '../../../shared/meta'
import {
  type BranchView,
  type CategoryView,
  fetchBranches,
  fetchCategories,
  fetchPlans,
  type PlanView,
} from '../../product'

/** requirement 域数据入口（01 §3.2：域内唯一数据入口，orval 封装 + qk 工厂）。 */

export type { ActivityView, BranchView, CategoryView, PlanView, StoryView }

export type ActivityPage = { items: ActivityView[]; hasMore: boolean }
export type ListResult<T> = { items: T[]; total: number }
export type BatchResultItem = { id: number; ok: boolean; error?: string | null }
export type BatchCreateResultItem = { index: number; ok: boolean; id?: number | null; error?: string | null }
export type AccountOption = { account: string; realName: string }

// ── 需求 ──

export async function fetchStories(
  productId: number,
  dsl: ListDsl<ListStoriesParams> = {},
): Promise<ListResult<StoryView>> {
  return ok(await listStories(productId, buildListParams<ListStoriesParams>(dsl))).data
}

export async function fetchStory(storyId: number): Promise<StoryView> {
  return ok(await getStory(storyId)).data
}

/** 建需求（表单自由串在 api 边界收窄——doc.api.ts 的 submitDoc 同款形态）。 */
export async function submitStory(productId: number, body: Record<string, unknown>): Promise<StoryView> {
  return ok(await createStory(productId, body as never)).data
}

export async function patchStory(storyId: number, body: StoryUpdateRequest): Promise<StoryView> {
  return ok(await updateStory(storyId, body)).data
}

/** 软删需求（守卫：存在未删任务引用 / 被未删子需求引用 → 42203；requirement §5）。 */
export async function deleteStoryAction(storyId: number): Promise<null> {
  return ok(await deleteStory(storyId)).data
}

export async function submitBatchCreateStories(
  productId: number,
  items: Record<string, unknown>[],
): Promise<{ results: BatchCreateResultItem[] }> {
  return ok(await batchCreateStories(productId, { items } as never)).data
}

export async function submitBatchStories(body: BatchActionRequest): Promise<{ results: BatchResultItem[] }> {
  return ok(await batchStories(body)).data
}

// ── 9 动作（requirement §4；状态迁移守卫在后端 workflow YAML） ──

export async function submitReviewAction(
  storyId: number,
  body: { reviewers?: string[] | null; comment?: string | null },
): Promise<StoryView> {
  return ok(await submitStoryReview(storyId, body)).data
}

export async function passStoryAction(storyId: number, comment?: string): Promise<StoryView> {
  return ok(await passStory(storyId, { comment: comment ?? null })).data
}

export async function rejectStoryAction(storyId: number, comment: string): Promise<StoryView> {
  return ok(await rejectStory(storyId, { comment })).data
}

export async function changeStoryAction(storyId: number): Promise<StoryView> {
  return ok(await changeStory(storyId)).data
}

export async function changeDoneStoryAction(storyId: number, body: StoryUpdateRequest): Promise<StoryView> {
  return ok(await changeDoneStory(storyId, body)).data
}

export async function closeStoryAction(storyId: number, body: StoryCloseRequest): Promise<StoryView> {
  return ok(await closeStory(storyId, body)).data
}

export async function activateStoryAction(storyId: number, comment?: string): Promise<StoryView> {
  return ok(await activateStory(storyId, { comment: comment ?? null })).data
}

export async function assignStoryAction(
  storyId: number,
  body: { assignee: string; comment?: string | null },
): Promise<StoryView> {
  return ok(await assignStory(storyId, body)).data
}

export async function fetchStoryActivities(storyId: number, beforeId?: number): Promise<ActivityPage> {
  const params = beforeId === undefined ? { limit: 50 } : { limit: 50, beforeId }
  return ok(await listStoryActivities(storyId, params)).data
}

export const fetchStoryMeta = (): Promise<DomainMeta> => fetchMeta('story')

// ── 表单选项（跨域只读：分支/分类/计划经 product 域出口，账号经 dicts） ──

export { fetchBranches, fetchCategories, fetchPlans }

export async function fetchStoryCategories(productId: number): Promise<ListResult<CategoryView>> {
  return fetchCategories(productId, 'story')
}

export async function fetchAccountOptions(): Promise<AccountOption[]> {
  const data = ok(await getDict('accounts')).data
  return data.items.map((item) => ({
    account: String(item.account ?? ''),
    realName: String(item.realName ?? item.account ?? ''),
  }))
}

// ── CSV 导出资源路径（03 §3 format=csv；不含 API 基址，由 shared/use-csv-export 补基址） ──

export const storiesCsvPath = (productId: number): string => `/products/${productId}/stories`

// ── query key 工厂（02 §4） ──

export const qk = {
  story: {
    list: (productId: number, params: unknown) => ['listStories', productId, params] as const,
    detail: (storyId: number) => ['getStory', storyId] as const,
    activities: (storyId: number) => ['listStoryActivities', storyId] as const,
    meta: () => ['meta', 'story'] as const,
  },
} as const
