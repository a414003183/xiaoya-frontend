import { ok } from '@zentao/api-client'
import {
  batchDocs,
  createDoc,
  createDocCategory,
  createDocSpace,
  deleteDoc,
  deleteDocCategory,
  deleteDocSpace,
  getDoc,
  getDocSpace,
  getDocVersion,
  listDocActivities,
  listDocCategories,
  listDocSpaces,
  listDocs,
  listDocVersions,
  listFiles,
  listRoles,
  listSpaceDocs,
  moveDoc,
  publishDoc,
  saveDocDraft,
  updateDoc,
  updateDocCategory,
  updateDocSpace,
} from '@zentao/api-client/generated'
import type { ActivityView } from '@zentao/api-client/generated/model/activityView'
import type { DocCategoryNode } from '@zentao/api-client/generated/model/docCategoryNode'
import type { DocCategoryView } from '@zentao/api-client/generated/model/docCategoryView'
import type { DocSpaceView } from '@zentao/api-client/generated/model/docSpaceView'
import type { DocVersionView } from '@zentao/api-client/generated/model/docVersionView'
import type { DocView } from '@zentao/api-client/generated/model/docView'
import type { FileView } from '@zentao/api-client/generated/model/fileView'
import type { ListDocSpacesParams } from '@zentao/api-client/generated/model/listDocSpacesParams'
import type { ListDocsParams } from '@zentao/api-client/generated/model/listDocsParams'
import type { ListFilesParams } from '@zentao/api-client/generated/model/listFilesParams'
import type { ListSpaceDocsParams } from '@zentao/api-client/generated/model/listSpaceDocsParams'
import { buildListParams, type ListDsl } from '../../../shared/list-dsl'
import { type DomainMeta, fetchMeta } from '../../../shared/meta'

/** doc 域数据入口（01 §3.2：域内唯一数据入口，orval 封装 + qk 工厂）。全域 = DocSpace/Doc/DocVersion（doc §5 全部端点）。 */

export type { ActivityView, DocCategoryNode, DocCategoryView, DocSpaceView, DocVersionView, DocView, FileView }

export type ListResult<T> = { items: T[]; total: number }
export type ActivityPage = { items: ActivityView[]; hasMore: boolean }
export type BatchResultItem = { id: number; ok: boolean; error?: string | null }

/** 章节列表一次取满（树需同页数据；契约 limit 上限 200）。 */
export const TREE_LIMIT = 200

// ── 文档库（doc §5 doc-spaces 族） ──

export async function fetchDocSpaces(dsl: ListDsl<ListDocSpacesParams> = {}): Promise<ListResult<DocSpaceView>> {
  return ok(await listDocSpaces(buildListParams<ListDocSpacesParams>(dsl))).data
}

export async function fetchDocSpace(docSpaceId: number): Promise<DocSpaceView> {
  return ok(await getDocSpace(docSpaceId)).data
}

export async function submitDocSpace(body: Record<string, unknown>): Promise<DocSpaceView> {
  return ok(await createDocSpace(body as never)).data
}

export async function patchDocSpace(docSpaceId: number, body: Record<string, unknown>): Promise<DocSpaceView> {
  return ok(await updateDocSpace(docSpaceId, body as never)).data
}

export async function deleteDocSpaceAction(docSpaceId: number): Promise<null> {
  return ok(await deleteDocSpace(docSpaceId)).data
}

/** 库内目录树（左树数据源，§5）。 */
export async function fetchDocCategories(docSpaceId: number): Promise<DocCategoryNode[]> {
  return ok(await listDocCategories(docSpaceId)).data.items
}

// ── 目录管理（doc §5 categories 写端点，B-DOC-01；库页「管理目录」弹窗） ──

export async function submitDocCategory(
  docSpaceId: number,
  body: { name: string; parentId?: number | null; sort?: number | null },
): Promise<DocCategoryView> {
  return ok(await createDocCategory(docSpaceId, body as never)).data
}

/** 改名/移动/排序（PATCH null = 不修改，§5）。 */
export async function patchDocCategory(
  docSpaceId: number,
  categoryId: number,
  body: { name?: string | null; parentId?: number | null; sort?: number | null },
): Promise<DocCategoryView> {
  return ok(await updateDocCategory(docSpaceId, categoryId, body as never)).data
}

/** 真实删除：有子节点或被文档引用 → 42203（§3 doc_category）。 */
export async function deleteDocCategoryAction(docSpaceId: number, categoryId: number): Promise<null> {
  return ok(await deleteDocCategory(docSpaceId, categoryId)).data
}

// ── 文档（doc §5 docs 族） ──

export async function fetchSpaceDocs(
  docSpaceId: number,
  dsl: ListDsl<ListSpaceDocsParams> = {},
): Promise<ListResult<DocView>> {
  return ok(await listSpaceDocs(docSpaceId, buildListParams<ListSpaceDocsParams>(dsl))).data
}

export async function submitDoc(docSpaceId: number, body: Record<string, unknown>): Promise<DocView> {
  return ok(await createDoc(docSpaceId, body as never)).data
}

export async function fetchDocs(dsl: ListDsl<ListDocsParams> = {}): Promise<ListResult<DocView>> {
  return ok(await listDocs(buildListParams<ListDocsParams>(dsl))).data
}

export async function fetchDoc(docId: number): Promise<DocView> {
  return ok(await getDoc(docId)).data
}

export async function patchDoc(docId: number, body: Record<string, unknown>): Promise<DocView> {
  return ok(await updateDoc(docId, body as never)).data
}

/** 存草稿：覆盖写 v0 工作副本（不升版本、不写动态流，§4）。 */
export async function saveDocDraftAction(
  docId: number,
  body: { title?: string | null; content: string; files?: number[] | null },
): Promise<DocView> {
  return ok(await saveDocDraft(docId, body as never)).data
}

/** 发布：v0 落快照；无改动 / 草稿守卫失败 → 42203（§4）。 */
export async function publishDocAction(docId: number, comment?: string): Promise<DocView> {
  return ok(await publishDoc(docId, { comment: comment ?? null })).data
}

export async function moveDocAction(
  docId: number,
  body: { docSpaceId: number; categoryId?: number | null; parentId?: number | null },
): Promise<DocView> {
  return ok(await moveDoc(docId, body as never)).data
}

export async function deleteDocAction(docId: number): Promise<null> {
  return ok(await deleteDoc(docId)).data
}

/** 批量动作（action ∈ delete|move，≤50；逐项部分成功）。 */
export async function submitBatchDocs(body: {
  ids: number[]
  action: 'delete' | 'move'
  params?: { docSpaceId: number; categoryId?: number | null; parentId?: number | null }
}): Promise<{ results: BatchResultItem[] }> {
  return ok(await batchDocs(body as never)).data
}

// ── 版本与动态（§3.3/§5） ──

/** 版本列表（v≥1 快照，固定 version desc，不分页）。 */
export async function fetchDocVersions(docId: number): Promise<ListResult<DocVersionView>> {
  return ok(await listDocVersions(docId)).data
}

/** 单版快照；version=0 取草稿工作副本（仅可编辑者，余者 40302，§4）。 */
export async function fetchDocVersion(docId: number, version: number): Promise<DocVersionView> {
  return ok(await getDocVersion(docId, version)).data
}

export async function fetchDocActivities(docId: number, beforeId?: number): Promise<ActivityPage> {
  const params = beforeId === undefined ? { limit: 50 } : { limit: 50, beforeId }
  return ok(await listDocActivities(docId, params)).data
}

// ── 附件（platform File 只读引用，§1：存储与上传不属本域） ──

/**
 * 某文档的附件（platform §5 GET /files：filters[objectType] 与 filters[objectId] 均必填）。
 * /doc/files 页按文档选择后调用——附件挂在文档上，契约没有跨对象的全局列表端点。
 */
export async function fetchDocFiles(docId: number, dsl: ListDsl<ListFilesParams> = {}): Promise<ListResult<FileView>> {
  return ok(
    await listFiles({
      ...buildListParams<ListFilesParams>(dsl),
      // 附件宿主固定为本文档（契约 filters[objectType]/[objectId] 必填），调用方 DSL 不得覆盖。
      'filters[objectType]': 'doc',
      'filters[objectId]': String(docId),
    }),
  ).data
}

export const fetchDocMeta = (): Promise<DomainMeta> => fetchMeta('doc')
export const fetchDocSpaceMeta = (): Promise<DomainMeta> => fetchMeta('docSpace')

/**
 * 角色选项（org 域只读，B-DOC-07 白名单组多选；T23 起白名单里的「组」就是角色）。
 * org 域无 index 出口（跨域 barrel 不存在），按 platform File 只读引用先例（fetchDocFiles 同款）直取生成端点；
 * 升级路径：org 域建 index.ts 出口后改走 barrel。
 */
export async function fetchGroupOptions(): Promise<{ id: number; name: string }[]> {
  const data = ok(await listRoles()).data
  return data.items.map((role) => ({ id: role.id, name: role.name }))
}

// ── CSV 导出资源路径（03 §3 format=csv；不含 API 基址，由 shared/use-csv-export 补基址） ──

export const DOC_SPACES_CSV_PATH = '/doc-spaces'

// ── query key 工厂（02 §4） ──

/** 写后失效根：与 qk 首段同源，动作处理器统一按根失效（task/quality/workspace 域同范式）。 */
export const DOC_QUERY_ROOTS = [
  'listDocSpaces',
  'getDocSpace',
  'listDocCategories',
  'listSpaceDocs',
  'listDocs',
  'getDoc',
  'listDocVersions',
  'listDocActivities',
  'listFiles',
] as const

export const qk = {
  doc: {
    spaceList: (params: unknown) => ['listDocSpaces', params] as const,
    space: (docSpaceId: number) => ['getDocSpace', docSpaceId] as const,
    categories: (docSpaceId: number) => ['listDocCategories', docSpaceId] as const,
    spaceDocs: (docSpaceId: number, params: unknown) => ['listSpaceDocs', docSpaceId, params] as const,
    list: (params: unknown) => ['listDocs', params] as const,
    detail: (docId: number) => ['getDoc', docId] as const,
    versions: (docId: number) => ['listDocVersions', docId] as const,
    version: (docId: number, version: number) => ['getDocVersion', docId, version] as const,
    activities: (docId: number) => ['listDocActivities', docId] as const,
    files: (docId: number) => ['listFiles', 'doc', docId] as const,
    meta: () => ['meta', 'doc'] as const,
    spaceMeta: () => ['meta', 'docSpace'] as const,
  },
} as const
