import { ok } from '@zentao/api-client'
import {
  activateBranch,
  activatePlan,
  activateProduct,
  batchProducts,
  closeBranch,
  closePlan,
  closeProduct,
  createBranch,
  createBuild,
  createCategory,
  createPlan,
  createProduct,
  createRelease,
  deleteBranch,
  deleteBuild,
  deleteCategory,
  deletePlan,
  deleteProduct,
  deleteRelease,
  finishPlan,
  getBuild,
  getDict,
  getPlan,
  getProduct,
  getRelease,
  linkBuild,
  linkPlan,
  linkRelease,
  listBranches,
  listBuildActivities,
  listBuildBugs,
  listBuildStories,
  listBuilds,
  listCategories,
  listPlanActivities,
  listPlanBugs,
  listPlanStories,
  listPlans,
  listProductActivities,
  listProducts,
  listReleaseActivities,
  listReleaseBugs,
  listReleaseStories,
  listReleases,
  listStories,
  setDefaultBranch,
  startPlan,
  terminateRelease,
  unlinkBuild,
  unlinkPlan,
  unlinkRelease,
  updateBranch,
  updateBuild,
  updateCategory,
  updatePlan,
  updateProduct,
  updateRelease,
} from '@zentao/api-client/generated'
import type { ActivityView } from '@zentao/api-client/generated/model/activityView'
import type { BranchView } from '@zentao/api-client/generated/model/branchView'
import type { BugView } from '@zentao/api-client/generated/model/bugView'
import type { BuildView } from '@zentao/api-client/generated/model/buildView'
import type { CategoryView } from '@zentao/api-client/generated/model/categoryView'
import type { ListBranchesParams } from '@zentao/api-client/generated/model/listBranchesParams'
import type { ListBuildBugsParams } from '@zentao/api-client/generated/model/listBuildBugsParams'
import type { ListBuildStoriesParams } from '@zentao/api-client/generated/model/listBuildStoriesParams'
import type { ListBuildsParams } from '@zentao/api-client/generated/model/listBuildsParams'
import type { ListPlanBugsParams } from '@zentao/api-client/generated/model/listPlanBugsParams'
import type { ListPlanStoriesParams } from '@zentao/api-client/generated/model/listPlanStoriesParams'
import type { ListPlansParams } from '@zentao/api-client/generated/model/listPlansParams'
import type { ListProductsParams } from '@zentao/api-client/generated/model/listProductsParams'
import type { ListReleaseBugsParams } from '@zentao/api-client/generated/model/listReleaseBugsParams'
import type { ListReleaseStoriesParams } from '@zentao/api-client/generated/model/listReleaseStoriesParams'
import type { ListReleasesParams } from '@zentao/api-client/generated/model/listReleasesParams'
import type { ListStoriesParams } from '@zentao/api-client/generated/model/listStoriesParams'
import type { PlanView } from '@zentao/api-client/generated/model/planView'
import type { ProductView } from '@zentao/api-client/generated/model/productView'
import type { ReleaseView } from '@zentao/api-client/generated/model/releaseView'
import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import { buildListParams, type ListDsl } from '../../../shared/list-dsl'
import { type DomainMeta, fetchMeta } from '../../../shared/meta'

/** product 域数据入口（01 §3.2：域内唯一数据入口，orval 封装 + qk 工厂）。 */

export type { ActivityView, BranchView, BuildView, CategoryView, PlanView, ProductView, ReleaseView, StoryView }

export type ActivityPage = { items: ActivityView[]; hasMore: boolean }
export type ListResult<T> = { items: T[]; total: number }
export type BatchResultItem = { id: number; ok: boolean; error?: string | null }
export type BatchActionBody = { ids: number[]; action: string; params?: Record<string, unknown> }

// ── 产品 ──

export async function fetchProducts(dsl: ListDsl<ListProductsParams> = {}): Promise<ListResult<ProductView>> {
  return ok(await listProducts(buildListParams<ListProductsParams>(dsl))).data
}

export async function fetchProduct(productId: number): Promise<ProductView> {
  return ok(await getProduct(productId)).data
}

export async function submitProduct(body: Record<string, unknown>): Promise<ProductView> {
  return ok(await createProduct(body as never)).data
}

export async function patchProduct(productId: number, body: Record<string, unknown>): Promise<ProductView> {
  return ok(await updateProduct(productId, body as never)).data
}

export async function closeProductAction(productId: number, comment?: string): Promise<ProductView> {
  return ok(await closeProduct(productId, { comment: comment ?? null })).data
}

export async function activateProductAction(productId: number, comment?: string): Promise<ProductView> {
  return ok(await activateProduct(productId, { comment: comment ?? null })).data
}

/** 软删产品（守卫：存在未删的 story/branch/plan/release/build → 42203）。 */
export async function deleteProductAction(productId: number): Promise<null> {
  return ok(await deleteProduct(productId)).data
}

export async function submitBatchProducts(body: BatchActionBody): Promise<{ results: BatchResultItem[] }> {
  return ok(await batchProducts(body as never)).data
}

export async function fetchProductActivities(productId: number, beforeId?: number): Promise<ActivityPage> {
  const params = beforeId === undefined ? { limit: 50 } : { limit: 50, beforeId }
  return ok(await listProductActivities(productId, params)).data
}

export const fetchProductMeta = (): Promise<DomainMeta> => fetchMeta('product')

// ── 分支 ──

export async function fetchBranches(
  productId: number,
  dsl: ListDsl<ListBranchesParams> = {},
): Promise<ListResult<BranchView>> {
  return ok(await listBranches(productId, buildListParams<ListBranchesParams>(dsl))).data
}

export async function submitBranch(productId: number, body: Record<string, unknown>): Promise<BranchView> {
  return ok(await createBranch(productId, body as never)).data
}

export async function patchBranch(branchId: number, body: Record<string, unknown>): Promise<BranchView> {
  return ok(await updateBranch(branchId, body as never)).data
}

export async function closeBranchAction(branchId: number): Promise<BranchView> {
  return ok(await closeBranch(branchId, { comment: null })).data
}

export async function activateBranchAction(branchId: number): Promise<BranchView> {
  return ok(await activateBranch(branchId, { comment: null })).data
}

export async function setDefaultBranchAction(branchId: number): Promise<BranchView> {
  return ok(await setDefaultBranch(branchId)).data
}

/** 软删分支（守卫：该分支存在未删需求 → 42203）。 */
export async function deleteBranchAction(branchId: number): Promise<null> {
  return ok(await deleteBranch(branchId)).data
}

export const fetchBranchMeta = (): Promise<DomainMeta> => fetchMeta('branch')

// ── 分类 ──

export async function fetchCategories(
  productId: number,
  type: string,
  branchId?: number,
): Promise<ListResult<CategoryView>> {
  const params =
    branchId === undefined
      ? { 'filters[type]': type }
      : { 'filters[type]': type, 'filters[branchId]': String(branchId) }
  return ok(await listCategories(productId, params)).data
}

export async function submitCategory(productId: number, body: Record<string, unknown>): Promise<CategoryView> {
  return ok(await createCategory(productId, body as never)).data
}

export async function patchCategory(categoryId: number, body: Record<string, unknown>): Promise<CategoryView> {
  return ok(await updateCategory(categoryId, body as never)).data
}

export async function removeCategory(categoryId: number): Promise<null> {
  return ok(await deleteCategory(categoryId)).data
}

export const fetchCategoryMeta = (): Promise<DomainMeta> => fetchMeta('category')

// ── 计划 ──

export async function fetchPlans(productId: number, dsl: ListDsl<ListPlansParams> = {}): Promise<ListResult<PlanView>> {
  return ok(await listPlans(productId, buildListParams<ListPlansParams>(dsl))).data
}

export async function fetchPlan(planId: number): Promise<PlanView> {
  return ok(await getPlan(planId)).data
}

export async function submitPlan(productId: number, body: Record<string, unknown>): Promise<PlanView> {
  return ok(await createPlan(productId, body as never)).data
}

export async function patchPlan(planId: number, body: Record<string, unknown>): Promise<PlanView> {
  return ok(await updatePlan(planId, body as never)).data
}

export async function startPlanAction(planId: number): Promise<PlanView> {
  return ok(await startPlan(planId)).data
}

export async function finishPlanAction(planId: number, comment?: string): Promise<PlanView> {
  return ok(await finishPlan(planId, { comment: comment ?? null })).data
}

export async function closePlanAction(
  planId: number,
  closedReason: 'done' | 'cancel',
  comment?: string,
): Promise<PlanView> {
  return ok(await closePlan(planId, { closedReason, comment: comment ?? null })).data
}

export async function activatePlanAction(planId: number, comment?: string): Promise<PlanView> {
  return ok(await activatePlan(planId, { comment: comment ?? null })).data
}

/** 软删计划（守卫：存在未删需求 planId 指向本计划 → 42203）。 */
export async function deletePlanAction(planId: number): Promise<null> {
  return ok(await deletePlan(planId)).data
}

export async function fetchPlanStories(
  planId: number,
  dsl: ListDsl<ListPlanStoriesParams> = {},
): Promise<ListResult<StoryView>> {
  return ok(await listPlanStories(planId, buildListParams<ListPlanStoriesParams>(dsl))).data
}

export async function fetchPlanBugs(
  planId: number,
  dsl: ListDsl<ListPlanBugsParams> = {},
): Promise<ListResult<BugView>> {
  return ok(await listPlanBugs(planId, buildListParams<ListPlanBugsParams>(dsl))).data
}

export async function linkPlanAction(planId: number, objectType: 'story' | 'bug', ids: number[]): Promise<PlanView> {
  return ok(await linkPlan(planId, { objectType, ids })).data
}

export async function unlinkPlanAction(planId: number, objectType: 'story' | 'bug', ids: number[]): Promise<PlanView> {
  return ok(await unlinkPlan(planId, { objectType, ids })).data
}

export async function fetchPlanActivities(planId: number, beforeId?: number): Promise<ActivityPage> {
  const params = beforeId === undefined ? { limit: 50 } : { limit: 50, beforeId }
  return ok(await listPlanActivities(planId, params)).data
}

export const fetchPlanMeta = (): Promise<DomainMeta> => fetchMeta('plan')

// ── 发布 ──

export async function fetchReleases(
  productId: number,
  dsl: ListDsl<ListReleasesParams> = {},
): Promise<ListResult<ReleaseView>> {
  return ok(await listReleases(productId, buildListParams<ListReleasesParams>(dsl))).data
}

export async function fetchRelease(releaseId: number): Promise<ReleaseView> {
  return ok(await getRelease(releaseId)).data
}

export async function submitRelease(productId: number, body: Record<string, unknown>): Promise<ReleaseView> {
  return ok(await createRelease(productId, body as never)).data
}

export async function patchRelease(releaseId: number, body: Record<string, unknown>): Promise<ReleaseView> {
  return ok(await updateRelease(releaseId, body as never)).data
}

export async function terminateReleaseAction(releaseId: number, comment?: string): Promise<ReleaseView> {
  return ok(await terminateRelease(releaseId, { comment: comment ?? null })).data
}

/** 软删发布（叶子对象，关联数组随之失效）。 */
export async function deleteReleaseAction(releaseId: number): Promise<null> {
  return ok(await deleteRelease(releaseId)).data
}

export async function fetchReleaseStories(
  releaseId: number,
  dsl: ListDsl<ListReleaseStoriesParams> = {},
): Promise<ListResult<StoryView>> {
  return ok(await listReleaseStories(releaseId, buildListParams<ListReleaseStoriesParams>(dsl))).data
}

export async function fetchReleaseBugs(
  releaseId: number,
  dsl: ListDsl<ListReleaseBugsParams> = {},
): Promise<ListResult<BugView>> {
  return ok(await listReleaseBugs(releaseId, buildListParams<ListReleaseBugsParams>(dsl))).data
}

export async function linkReleaseAction(
  releaseId: number,
  objectType: 'story' | 'bug',
  ids: number[],
): Promise<ReleaseView> {
  return ok(await linkRelease(releaseId, { objectType, ids })).data
}

export async function unlinkReleaseAction(
  releaseId: number,
  objectType: 'story' | 'bug',
  ids: number[],
): Promise<ReleaseView> {
  return ok(await unlinkRelease(releaseId, { objectType, ids })).data
}

export async function fetchReleaseActivities(releaseId: number, beforeId?: number): Promise<ActivityPage> {
  const params = beforeId === undefined ? { limit: 50 } : { limit: 50, beforeId }
  return ok(await listReleaseActivities(releaseId, params)).data
}

export const fetchReleaseMeta = (): Promise<DomainMeta> => fetchMeta('release')

// ── 构建 ──

export async function fetchBuilds(
  productId: number,
  dsl: ListDsl<ListBuildsParams> = {},
): Promise<ListResult<BuildView>> {
  return ok(await listBuilds(productId, buildListParams<ListBuildsParams>(dsl))).data
}

export async function fetchBuild(buildId: number): Promise<BuildView> {
  return ok(await getBuild(buildId)).data
}

export async function submitBuild(productId: number, body: Record<string, unknown>): Promise<BuildView> {
  return ok(await createBuild(productId, body as never)).data
}

export async function patchBuild(buildId: number, body: Record<string, unknown>): Promise<BuildView> {
  return ok(await updateBuild(buildId, body as never)).data
}

export async function removeBuild(buildId: number): Promise<null> {
  return ok(await deleteBuild(buildId)).data
}

export async function fetchBuildStories(
  buildId: number,
  dsl: ListDsl<ListBuildStoriesParams> = {},
): Promise<ListResult<StoryView>> {
  return ok(await listBuildStories(buildId, buildListParams<ListBuildStoriesParams>(dsl))).data
}

export async function fetchBuildBugs(
  buildId: number,
  dsl: ListDsl<ListBuildBugsParams> = {},
): Promise<ListResult<BugView>> {
  return ok(await listBuildBugs(buildId, buildListParams<ListBuildBugsParams>(dsl))).data
}

export async function linkBuildAction(buildId: number, objectType: 'story' | 'bug', ids: number[]): Promise<BuildView> {
  return ok(await linkBuild(buildId, { objectType, ids })).data
}

export async function unlinkBuildAction(
  buildId: number,
  objectType: 'story' | 'bug',
  ids: number[],
): Promise<BuildView> {
  return ok(await unlinkBuild(buildId, { objectType, ids })).data
}

export async function fetchBuildActivities(buildId: number, beforeId?: number): Promise<ActivityPage> {
  const params = beforeId === undefined ? { limit: 50 } : { limit: 50, beforeId }
  return ok(await listBuildActivities(buildId, params)).data
}

export const fetchBuildMeta = (): Promise<DomainMeta> => fetchMeta('build')

// ── 跨域只读：同产品需求候选（track 矩阵 / link 选择器） ──

export async function fetchProductStories(
  productId: number,
  dsl: ListDsl<ListStoriesParams> = {},
): Promise<ListResult<StoryView>> {
  return ok(await listStories(productId, buildListParams<ListStoriesParams>(dsl))).data
}

// ── 字典（账号选择器：po/qd/rd/whitelist/notify） ──

export type AccountOption = { account: string; realName: string }

export async function fetchAccountOptions(): Promise<AccountOption[]> {
  const data = ok(await getDict('accounts')).data
  return data.items.map((item) => ({
    account: String(item.account ?? ''),
    realName: String(item.realName ?? item.account ?? ''),
  }))
}

// ── CSV 导出资源路径（03 §3 format=csv；不含 API 基址，由 shared/use-csv-export 补基址） ──

export const PRODUCTS_CSV_PATH = '/products'

// ── query key 工厂（02 §4） ──

export const qk = {
  product: {
    list: (params: unknown) => ['listProducts', params] as const,
    detail: (productId: number) => ['getProduct', productId] as const,
    activities: (productId: number) => ['listProductActivities', productId] as const,
    meta: () => ['meta', 'product'] as const,
  },
  branch: {
    list: (productId: number) => ['listBranches', productId] as const,
  },
  category: {
    list: (productId: number, type: string) => ['listCategories', productId, type] as const,
  },
  plan: {
    list: (productId: number) => ['listPlans', productId] as const,
    detail: (planId: number) => ['getPlan', planId] as const,
    stories: (planId: number) => ['listPlanStories', planId] as const,
    activities: (planId: number) => ['listPlanActivities', planId] as const,
    meta: () => ['meta', 'plan'] as const,
  },
  release: {
    list: (productId: number) => ['listReleases', productId] as const,
    detail: (releaseId: number) => ['getRelease', releaseId] as const,
    stories: (releaseId: number) => ['listReleaseStories', releaseId] as const,
    activities: (releaseId: number) => ['listReleaseActivities', releaseId] as const,
    meta: () => ['meta', 'release'] as const,
  },
  build: {
    list: (productId: number) => ['listBuilds', productId] as const,
    detail: (buildId: number) => ['getBuild', buildId] as const,
    stories: (buildId: number) => ['listBuildStories', buildId] as const,
    activities: (buildId: number) => ['listBuildActivities', buildId] as const,
    meta: () => ['meta', 'build'] as const,
  },
} as const
