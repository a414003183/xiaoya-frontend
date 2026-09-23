/**
 * doc 域 MSW handlers（P5 · T-1）：22 端点，逐一对齐 contract/openapi.yaml（tag `doc`）；下文 §号引自原 `docs/rewrite/domains/doc.md`（该目录已删除），契约以 openapi 为准。
 * 双层 ACL（§7）：先库门禁（open 全员 / private 创建者+白名单 / default 继承归属对象 / mine 仅创建者含超管不可见），
 * 再判文档 ACL（open 可读；private 仅 createdBy/超管/editors 可写、readers 只读、其余不可见）。
 * 状态机（§4）：create 草稿写 v0 / 直发写 v1；save-draft 覆盖 v0 不升版本不写动态流；publish 首发 v1、再发 v(n+1)（v0 无改动 → 42203）；
 * move 联动冗余 productId/projectId/executionId 并级联重建子树 path；delete 软删并级联子文档。
 * 目录写端点按契约嵌套于库路径（/doc-spaces/{docSpaceId}/categories/{categoryId}，doc 卡 §5 的 /categories/{categoryId} 写法已废弃）。
 */
import type { DocAclPayload } from '@zentao/api-client/generated/model/docAclPayload'
import type { DocCategoryNode } from '@zentao/api-client/generated/model/docCategoryNode'
import type { DocCategoryView } from '@zentao/api-client/generated/model/docCategoryView'
import type { DocSpaceView } from '@zentao/api-client/generated/model/docSpaceView'
import type { DocVersionView } from '@zentao/api-client/generated/model/docVersionView'
import type { DocView } from '@zentao/api-client/generated/model/docView'
import { HttpResponse, http } from 'msw'
import type { DocRow, DocSpaceRow, MockAccount } from './db'
import { currentAccount, db, error, FORBIDDEN, mockId, NOT_FOUND, privilegesOf, UNAUTHENTICATED } from './db'
import {
  DOC_ACL_OPTIONS,
  DOC_SPACE_ACL_OPTIONS,
  DOC_SPACE_DOC_SORT_OPTIONS,
  DOC_SPACE_TYPE_OPTIONS,
  DOC_STATUS_OPTIONS,
  DOC_TYPE_OPTIONS,
} from './meta-options'
import { notify, record, visibleProduct } from './product-handlers'
import { canSeeProject } from './project-handlers'

const ok = (data: unknown) => HttpResponse.json({ data })
const unauthorized = () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })
const forbidden = (perm: string) => HttpResponse.json(FORBIDDEN(perm), { status: 403 })
const validation = (message: string, fields?: Record<string, string>) =>
  HttpResponse.json(
    { error: { code: 42201, message, traceId: 'mock', ...(fields ? { fields } : {}) } },
    { status: 422 },
  )
const badRequest = (message: string) => HttpResponse.json(error(40001, message), { status: 400 })
const conditionNotMet = (message: string) => HttpResponse.json(error(42203, message), { status: 422 })
const lockConflict = () => HttpResponse.json(error(40901, '数据已被他人修改，请刷新后重试。'), { status: 409 })
const notFound = () => HttpResponse.json(NOT_FOUND, { status: 404 })
const hidden = (message: string) => HttpResponse.json(error(40302, message), { status: 403 })

const D = {
  spaceView: 'doc-space-view',
  spaceCreate: 'doc-space-create',
  spaceEdit: 'doc-space-edit',
  spaceDelete: 'doc-space-delete',
  view: 'doc-view',
  create: 'doc-create',
  edit: 'doc-edit',
  delete: 'doc-delete',
}

const SPACE_TYPES = ['product', 'project', 'execution', 'custom', 'mine'] as const
const SPACE_ACLS = ['open', 'default', 'private'] as const
const DOC_ACLS = ['open', 'private'] as const
const DOC_TYPES = ['markdown', 'html'] as const
const DOC_STATUSES = ['draft', 'published'] as const
/** PATCH 不可改字段（§5：content 走 save-draft，docSpaceId 走 move）。 */
const DOC_IMMUTABLE_KEYS = ['docSpaceId', 'status', 'version', 'type', 'path', 'productId', 'projectId', 'executionId']

function hasPerm(codes: string[]): boolean {
  const account = currentAccount()
  if (!account) {
    return false
  }
  if (account.roleIds.includes(1)) {
    return true
  }
  const owned = privilegesOf(account)
  return codes.some((code) => owned.includes(code))
}

const now = () => new Date().toISOString()

// ── 列表 DSL（03 §3 最小实现） ──

function matchValue(value: unknown, filter: string | null): boolean {
  if (!filter) {
    return true
  }
  if (filter === '@null') {
    return value === null || value === undefined
  }
  if (filter === '@notNull') {
    return value !== null && value !== undefined
  }
  return String(value ?? '') === filter
}

function matchIn(value: unknown, filter: string | null): boolean {
  if (!filter) {
    return true
  }
  return filter.split(',').some((item) => item === String(value ?? ''))
}

/** 账号过滤支持 @me（契约：账号 / @me / @null）。 */
function matchAccount(value: unknown, filter: string | null): boolean {
  if (!filter) {
    return true
  }
  if (filter === '@me') {
    return String(value ?? '') === (currentAccount()?.account ?? '')
  }
  return matchValue(value, filter)
}

function paginate<T>(items: T[], url: URL): { items: T[]; total: number } {
  const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  return { items: items.slice((page - 1) * limit, page * limit), total: items.length }
}

/** 排序白名单由各端点调用处传入（契约逐端点列明），未知 key 回退默认比较器。 */
function sortBy<T extends Record<string, unknown>>(
  items: T[],
  sort: string | null,
  allowed: string[],
  fallback: (a: T, b: T) => number,
): T[] {
  if (!sort) {
    return [...items].sort(fallback)
  }
  const desc = sort.startsWith('-')
  const key = desc ? sort.slice(1) : sort
  if (!allowed.includes(key)) {
    return [...items].sort(fallback)
  }
  return [...items].sort((a, b) => {
    const left = a[key]
    const right = b[key]
    if (left === right) {
      return 0
    }
    const compared = String(left ?? '') > String(right ?? '') ? 1 : -1
    return desc ? -compared : compared
  })
}

function activityPage(objectId: number, url: URL): { items: unknown[]; hasMore: boolean } {
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  const beforeId = Number(url.searchParams.get('beforeId') ?? Number.MAX_SAFE_INTEGER)
  const items = db.activities
    .filter((activity) => activity.objectType === 'doc' && activity.objectId === objectId && activity.id < beforeId)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
  return { items, hasMore: items.length === limit }
}

// ── 双层 ACL（§7） ──

/** 白名单命中：账号直接命中或所属组命中（按判定时刻的组关系，不做快照）。 */
function aclHit(payload: DocAclPayload | undefined, account: MockAccount): boolean {
  if (!payload) {
    return false
  }
  if ((payload.accounts ?? []).includes(account.account)) {
    return true
  }
  return db.userRoles.some((item) => (payload.groupIds ?? []).includes(item.roleId) && item.accountId === account.id)
}

/** 库门禁（§7）：mine 库仅创建者（超管也不可见）；private=创建者+白名单+超管；default 继承归属对象；open 全员。 */
function spaceVisible(space: DocSpaceRow): boolean {
  const account = currentAccount()
  if (!account || space.deletedAt) {
    return false
  }
  const me = account.account
  if (space.type === 'mine') {
    return space.createdBy === me
  }
  if (account.roleIds.includes(1)) {
    return true
  }
  if (space.acl === 'open') {
    return true
  }
  if (space.acl === 'private') {
    return space.createdBy === me || aclHit(space.whitelist, account)
  }
  // acl=default：随归属对象可见性（product 走产品 ACL，project/execution 走项目 ACL）
  if (space.type === 'product') {
    return visibleProduct(space.productId) !== undefined
  }
  if (space.type === 'project' || space.type === 'execution') {
    const projectId = space.type === 'execution' ? space.executionId : space.projectId
    const project = db.projects.find((item) => item.id === projectId)
    return project !== undefined && canSeeProject(project)
  }
  return true // custom 库无 default（创建/更新已校验），兜底按可见处理
}

/** 文档 ACL 层级（§7）：edit=可写、read=只读、null=不可见；库不可见时一律 null。 */
function docAccess(doc: DocRow): 'edit' | 'read' | null {
  const account = currentAccount()
  if (!account || doc.deletedAt) {
    return null
  }
  const space = db.docSpaces.find((item) => item.id === doc.docSpaceId)
  if (!space || !spaceVisible(space)) {
    return null
  }
  if (account.roleIds.includes(1)) {
    return 'edit' // mine 库已在 spaceVisible 拦下，超管不豁免
  }
  const me = account.account
  if (doc.createdBy === me) {
    return 'edit'
  }
  if (doc.acl === 'open') {
    return 'read'
  }
  if (aclHit(doc.editors, account)) {
    return 'edit'
  }
  if (aclHit(doc.readers, account)) {
    return 'read'
  }
  return null
}

/** 单体读路径闸门：不存在/已删/库不可见 → 40401（按不存在）；文档 ACL 拒绝 → 40302（§7）。 */
function guardDoc(docId: number): { doc: DocRow; access: 'edit' | 'read' } | { denied: Response } {
  const doc = db.docs.find((item) => item.id === docId)
  if (!doc || doc.deletedAt) {
    return { denied: notFound() }
  }
  const space = db.docSpaces.find((item) => item.id === doc.docSpaceId)
  if (!space || space.deletedAt || !spaceVisible(space)) {
    return { denied: notFound() }
  }
  const access = docAccess(doc)
  if (!access) {
    return { denied: hidden('无权访问该文档。') }
  }
  return { doc, access }
}

/** 库读路径闸门：不存在 → 40401，不可见 → 40302（库详情口径，§7）。 */
function guardSpace(docSpaceId: number): { space: DocSpaceRow } | { denied: Response } {
  const space = db.docSpaces.find((item) => item.id === docSpaceId)
  if (!space || space.deletedAt) {
    return { denied: notFound() }
  }
  if (!spaceVisible(space)) {
    return { denied: hidden('无权访问该文档库。') }
  }
  return { space }
}

/** 库子资源（库内文档/目录）闸门：库不可见按不存在处理（40401，§7）。 */
function guardSpaceChild(docSpaceId: number): { space: DocSpaceRow } | { denied: Response } {
  const space = db.docSpaces.find((item) => item.id === docSpaceId)
  if (!space || space.deletedAt || !spaceVisible(space)) {
    return { denied: notFound() }
  }
  return { space }
}

// ── 视图与派生值（§3.1 docCount、§3.2 hasDraft、§3.3 digest） ──

function spaceView(space: DocSpaceRow): DocSpaceView {
  const { deletedAt: _deletedAt, ...view } = space
  return { ...view, docCount: db.docs.filter((doc) => doc.docSpaceId === space.id && !doc.deletedAt).length }
}

function snapshotOf(docId: number, version: number): DocVersionView | undefined {
  return db.docVersions.find((item) => item.docId === docId && item.version === version)
}

const workingCopyOf = (docId: number) => snapshotOf(docId, 0)

/** digest 缺省 = 正文去标记后前 200 字（§3.3）。 */
function digestOf(content: string | null): string {
  return (content ?? '')
    .replace(/[#>*`~\-[\]()!|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/** hasDraft = v0 工作副本与最新发布快照是否有差异（§3.2 派生行）。 */
function hasDraftOf(doc: DocRow): boolean {
  const draft = workingCopyOf(doc.id)
  if (!draft) {
    return false
  }
  if (doc.version === 0) {
    return (draft.content ?? '').length > 0
  }
  const latest = snapshotOf(doc.id, doc.version)
  if (!latest) {
    return true
  }
  return (
    draft.title !== latest.title ||
    (draft.content ?? '') !== (latest.content ?? '') ||
    JSON.stringify(draft.files ?? []) !== JSON.stringify(latest.files ?? [])
  )
}

/** 列表视图：不含 content/files（§5 补充约定）。 */
function docView(doc: DocRow): DocView {
  const { deletedAt: _deletedAt, ...view } = doc
  return { ...view, hasDraft: hasDraftOf(doc) }
}

/** 详情视图：可编辑者看 v0 工作副本，只读者永远看最新发布快照（§4）。 */
function docDetailView(doc: DocRow): DocView {
  const draft = workingCopyOf(doc.id)
  const latest = doc.version > 0 ? snapshotOf(doc.id, doc.version) : undefined
  const body = docAccess(doc) === 'edit' ? (draft ?? latest) : latest
  return { ...docView(doc), content: body?.content ?? null, files: body?.files ?? [], digest: body?.digest ?? null }
}

function categoryTree(docSpaceId: number): DocCategoryNode[] {
  const rows = db.docCategories
    .filter((item) => item.docSpaceId === docSpaceId)
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
  const build = (parentId: number): DocCategoryNode[] =>
    rows.filter((item) => item.parentId === parentId).map((item) => ({ ...item, children: build(item.id) }))
  return build(0)
}

// ── 创建/更新入参归一（§3 字段表） ──

function aclPayloadOf(raw: unknown): Required<DocAclPayload> {
  const payload = (raw ?? {}) as DocAclPayload
  return {
    accounts: [...new Set(payload.accounts ?? [])].slice(0, 50),
    groupIds: [...new Set(payload.groupIds ?? [])].slice(0, 50),
  }
}

/** publish 的 comment 可选体（删除类端点 T66 起走 DELETE + ?comment=，不再读体）。 */
async function commentOf(request: Request): Promise<string | null> {
  const body = (await request.json().catch(() => ({}))) as { comment?: string | null }
  return body.comment ?? null
}

/** isDefault 同一归属对象至多一个 true（§3.1）：置位前打下他人。 */
function clearDefault(space: DocSpaceRow): void {
  for (const item of db.docSpaces) {
    if (item.id !== space.id && item.type === space.type && !item.deletedAt) {
      const sameObject =
        space.type === 'product'
          ? item.productId === space.productId
          : space.type === 'project'
            ? item.projectId === space.projectId
            : space.type === 'execution'
              ? item.executionId === space.executionId
              : false
      if (sameObject) {
        item.isDefault = false
      }
    }
  }
}

function docPathOf(parentId: number, id: number): string {
  const parent = parentId === 0 ? undefined : db.docs.find((item) => item.id === parentId)
  return parent ? `${parent.path}${id},` : `,${id},`
}

/** move 后子树 path 级联重建（§4 副作用）。 */
function rebuildSubtreePaths(doc: DocRow): void {
  for (const child of db.docs.filter((item) => item.parentId === doc.id && !item.deletedAt)) {
    child.path = `${doc.path}${child.id},`
    rebuildSubtreePaths(child)
  }
}

/** parentId 成环判定：候选父节点是自身或自身后代（§4 → 42201）。 */
function isSelfOrDescendant(candidateId: number, docId: number): boolean {
  if (candidateId === docId) {
    return true
  }
  let current = db.docs.find((item) => item.id === candidateId)
  while (current && current.parentId !== 0) {
    if (current.parentId === docId) {
      return true
    }
    current = db.docs.find((item) => item.id === current?.parentId)
  }
  return false
}

function collectSubtree(doc: DocRow): DocRow[] {
  return [doc, ...db.docs.filter((item) => item.parentId === doc.id).flatMap((child) => collectSubtree(child))]
}

/** 目录子树（真实删除守卫用）。 */
function categoryHasChildren(categoryId: number): boolean {
  return db.docCategories.some((item) => item.parentId === categoryId)
}

// ── handlers ──

export const docHandlers = [
  // ── 文档库：列表 / 创建（doc §5 doc-spaces 族） ──

  http.get('*/api/v1/doc-spaces', ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.spaceView])) {
      return forbidden(D.spaceView)
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.docSpaces.filter(
      (space) =>
        !space.deletedAt &&
        spaceVisible(space) &&
        matchIn(space.type, url.searchParams.get('filters[type]')) &&
        matchIn(space.acl, url.searchParams.get('filters[acl]')) &&
        matchValue(space.productId, url.searchParams.get('filters[productId]')) &&
        matchValue(space.projectId, url.searchParams.get('filters[projectId]')) &&
        matchValue(space.executionId, url.searchParams.get('filters[executionId]')) &&
        matchIn(space.id, url.searchParams.get('filters[id]')) &&
        matchAccount(space.createdBy, url.searchParams.get('filters[createdBy]')),
    )
    if (q) {
      items = items.filter((space) => `${space.name}${space.description ?? ''}`.toLowerCase().includes(q))
    }
    const sorted = sortBy(
      items as unknown as Record<string, unknown>[],
      url.searchParams.get('sort'),
      ['id', 'name', 'sort', 'createdAt'],
      (a, b) => Number((b as unknown as DocSpaceRow).sort) - Number((a as unknown as DocSpaceRow).sort),
    ) as unknown as DocSpaceRow[]
    return ok(paginate(sorted.map(spaceView), url))
  }),

  http.post('*/api/v1/doc-spaces', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.spaceCreate])) {
      return forbidden(D.spaceCreate)
    }
    const body = (await request.json()) as Record<string, unknown>
    const name = String(body.name ?? '').trim()
    if (name.length === 0 || name.length > 60) {
      return validation('库名称必填且不超过 60 字。', { name: 'required' })
    }
    const type = String(body.type ?? '')
    if (!(SPACE_TYPES as readonly string[]).includes(type)) {
      return validation('type 取值 product|project|execution|custom|mine。', { type: 'invalid' })
    }
    const account = currentAccount()
    // mine 每人至多一个：重复创建返回既有库（幂等 200，§5）
    if (type === 'mine') {
      const existing = db.docSpaces.find(
        (space) => space.createdBy === account?.account && space.type === 'mine' && !space.deletedAt,
      )
      if (existing) {
        return ok(spaceView(existing))
      }
    }
    let productId = 0
    let projectId = 0
    let executionId = 0
    if (type === 'product') {
      productId = Number(body.productId ?? 0)
      if (!productId || !visibleProduct(productId)) {
        return validation('product 型库必须指定可见产品。', { productId: 'required' })
      }
    } else if (type === 'project') {
      projectId = Number(body.projectId ?? 0)
      const project = db.projects.find((item) => item.id === projectId && item.type === 'project')
      if (!project || !canSeeProject(project)) {
        return validation('project 型库必须指定可见项目。', { projectId: 'required' })
      }
    } else if (type === 'execution') {
      executionId = Number(body.executionId ?? 0)
      const execution = db.projects.find(
        (item) => item.id === executionId && ['sprint', 'stage', 'kanban'].includes(item.type),
      )
      if (!execution || !canSeeProject(execution)) {
        return validation('execution 型库必须指定可见执行。', { executionId: 'required' })
      }
      projectId = execution.parentId // 执行型由执行带出项目（§3.1）
    } else if (body.productId || body.projectId || body.executionId) {
      return validation('custom/mine 型库归属列恒 0。', { type: 'invalid' })
    }
    const acl = type === 'mine' ? 'private' : String(body.acl ?? 'open')
    if (!(SPACE_ACLS as readonly string[]).includes(acl)) {
      return validation('acl 取值 open|default|private。', { acl: 'invalid' })
    }
    if (type === 'custom' && acl === 'default') {
      return validation('custom 库无 default 权限。', { acl: 'invalid' })
    }
    const whitelist = aclPayloadOf(body.whitelist)
    if (acl === 'private' && type !== 'mine' && whitelist.accounts.length + whitelist.groupIds.length === 0) {
      return validation('private 库必须配置白名单。', { whitelist: 'required' })
    }
    const space: DocSpaceRow = {
      id: mockId(),
      name,
      type: type as DocSpaceRow['type'],
      productId,
      projectId,
      executionId,
      acl: acl as DocSpaceRow['acl'],
      whitelist,
      description: (body.description as string | null | undefined) ?? null,
      docSort: (body.docSort as DocSpaceRow['docSort']) ?? 'id_asc',
      isDefault: body.isDefault === true,
      docCount: 0,
      sort: Number(body.sort ?? 0),
      createdBy: account?.account ?? 'system',
      createdAt: now(),
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      deletedAt: null,
    }
    db.docSpaces.push(space)
    if (space.isDefault) {
      clearDefault(space)
    }
    return ok(spaceView(space))
  }),

  // ── 文档库：详情 / 部分更新 / 删除（doc §5） ──

  http.get('*/api/v1/doc-spaces/:docSpaceId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.spaceView])) {
      return forbidden(D.spaceView)
    }
    const guarded = guardSpace(Number(params.docSpaceId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    return ok(spaceView(guarded.space))
  }),

  http.patch('*/api/v1/doc-spaces/:docSpaceId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.spaceEdit])) {
      return forbidden(D.spaceEdit)
    }
    const guarded = guardSpace(Number(params.docSpaceId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const space = guarded.space
    const body = (await request.json()) as Record<string, unknown>
    if ('type' in body) {
      return badRequest('库 type 创建后不可修改。')
    }
    if (body.lockVersion === undefined || body.lockVersion !== space.lockVersion) {
      return lockConflict()
    }
    if (body.name !== undefined && body.name !== null) {
      const name = String(body.name).trim()
      if (name.length === 0 || name.length > 60) {
        return validation('库名称必填且不超过 60 字。', { name: 'invalid' })
      }
      space.name = name
    }
    if (body.acl !== undefined && body.acl !== null) {
      const acl = String(body.acl)
      if (!(SPACE_ACLS as readonly string[]).includes(acl) || (space.type === 'custom' && acl === 'default')) {
        return validation('acl 非法。', { acl: 'invalid' })
      }
      if (space.type === 'mine' && acl !== 'private') {
        return validation('mine 库恒为 private。', { acl: 'invalid' })
      }
      space.acl = acl as DocSpaceRow['acl']
    }
    if (body.whitelist !== undefined) {
      space.whitelist = aclPayloadOf(body.whitelist)
    }
    if (body.docSort !== undefined && body.docSort !== null) {
      space.docSort = body.docSort as DocSpaceRow['docSort']
    }
    if (body.description !== undefined) {
      space.description = (body.description as string | null) ?? null
    }
    if (body.sort !== undefined && body.sort !== null) {
      space.sort = Number(body.sort)
    }
    if (body.isDefault !== undefined && body.isDefault !== null) {
      space.isDefault = body.isDefault === true
      if (space.isDefault) {
        clearDefault(space)
      }
    }
    space.lockVersion += 1
    space.updatedBy = currentAccount()?.account ?? null
    space.updatedAt = now()
    return ok(spaceView(space))
  }),

  http.delete('*/api/v1/doc-spaces/:docSpaceId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.spaceDelete])) {
      return forbidden(D.spaceDelete)
    }
    const guarded = guardSpace(Number(params.docSpaceId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const space = guarded.space
    if (db.docs.some((doc) => doc.docSpaceId === space.id && !doc.deletedAt)) {
      return conditionNotMet('库内仍有文档，无法删除。')
    }
    space.deletedAt = now()
    return ok(null)
  }),

  // ── 库内文档：列表 / 创建（doc §5） ──

  http.get('*/api/v1/doc-spaces/:docSpaceId/docs', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.view])) {
      return forbidden(D.view)
    }
    const guarded = guardSpaceChild(Number(params.docSpaceId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const space = guarded.space
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.docs.filter(
      (doc) =>
        doc.docSpaceId === space.id &&
        !doc.deletedAt &&
        docAccess(doc) !== null &&
        matchValue(doc.categoryId, url.searchParams.get('filters[categoryId]')) &&
        matchValue(doc.parentId, url.searchParams.get('filters[parentId]')) &&
        matchIn(doc.status, url.searchParams.get('filters[status]')) &&
        matchIn(doc.type, url.searchParams.get('filters[type]')) &&
        matchIn(doc.acl, url.searchParams.get('filters[acl]')) &&
        matchIn(doc.id, url.searchParams.get('filters[id]')) &&
        matchAccount(doc.createdBy, url.searchParams.get('filters[createdBy]')),
    )
    if (q) {
      items = items.filter((doc) =>
        `${doc.title}${doc.keywords ?? ''}${snapshotOf(doc.id, doc.version)?.content ?? ''}`.toLowerCase().includes(q),
      )
    }
    // 缺省排序取库 docSort（§3.1）
    const defaultSort = space.docSort === 'id_desc' ? '-id' : 'id_asc'
    const sorted = sortBy(
      items as unknown as Record<string, unknown>[],
      url.searchParams.get('sort') ?? defaultSort,
      ['id', 'sort', 'views', 'title', 'createdAt', 'updatedAt'],
      (a, b) => Number((a as unknown as DocRow).id) - Number((b as unknown as DocRow).id),
    ) as unknown as DocRow[]
    return ok(paginate(sorted.map(docView), url))
  }),

  http.post('*/api/v1/doc-spaces/:docSpaceId/docs', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.create])) {
      return forbidden(D.create)
    }
    const guarded = guardSpaceChild(Number(params.docSpaceId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const space = guarded.space
    const body = (await request.json()) as Record<string, unknown>
    const title = String(body.title ?? '').trim()
    if (title.length === 0 || title.length > 255) {
      return validation('标题必填且不超过 255 字。', { title: 'required' })
    }
    const type = String(body.type ?? 'markdown')
    if (!(DOC_TYPES as readonly string[]).includes(type)) {
      return validation('type 取值 markdown|html。', { type: 'invalid' })
    }
    const status = String(body.status ?? 'draft')
    if (!(DOC_STATUSES as readonly string[]).includes(status)) {
      return validation('status 取值 draft|published。', { status: 'invalid' })
    }
    const acl = String(body.acl ?? 'open')
    if (!(DOC_ACLS as readonly string[]).includes(acl)) {
      return validation('acl 取值 open|private。', { acl: 'invalid' })
    }
    const parentId = Number(body.parentId ?? 0)
    if (parentId !== 0) {
      const parent = db.docs.find((item) => item.id === parentId && item.docSpaceId === space.id && !item.deletedAt)
      if (!parent) {
        return validation('父章节必须属于该库。', { parentId: 'notFound' })
      }
    }
    const categoryId = Number(body.categoryId ?? 0)
    if (categoryId !== 0 && !db.docCategories.some((item) => item.id === categoryId && item.docSpaceId === space.id)) {
      return validation('目录必须属于该库。', { categoryId: 'notFound' })
    }
    const content = (body.content as string | null | undefined) ?? null
    if (status === 'published' && (content ?? '').trim().length === 0) {
      return validation('直接发布时正文不能为空。', { content: 'required' })
    }
    const id = mockId()
    const files = (body.files as number[] | undefined) ?? []
    const account = currentAccount()?.account ?? 'system'
    const createdAt = now()
    const doc: DocRow = {
      id,
      docSpaceId: space.id,
      productId: space.productId, // 冗余列由所属库带出（§3.2）
      projectId: space.projectId,
      executionId: space.executionId,
      categoryId,
      parentId,
      path: docPathOf(parentId, id),
      title,
      keywords: (body.keywords as string | null | undefined) ?? null,
      type: type as DocRow['type'],
      status: status as DocRow['status'],
      acl: acl as DocRow['acl'],
      // acl=open 时 editors/readers 强制清空（§3.2）
      editors: acl === 'open' ? { accounts: [], groupIds: [] } : aclPayloadOf(body.editors),
      readers: acl === 'open' ? { accounts: [], groupIds: [] } : aclPayloadOf(body.readers),
      notifyAccounts: (body.notifyAccounts as string[] | undefined) ?? [],
      views: 0,
      version: 0,
      hasDraft: true,
      sort: Number(body.sort ?? 0),
      createdBy: account,
      createdAt,
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      deletedAt: null,
    }
    // create 总是先落 v0 工作副本：draft 停在这里；published 再落 v1 快照（§4）
    db.docVersions.push({
      id: mockId(),
      docId: id,
      version: 0,
      title,
      content,
      digest: digestOf(content),
      files,
      createdBy: account,
      createdAt,
      updatedBy: null,
      updatedAt: null,
    })
    if (status === 'published') {
      doc.version = 1
      db.docVersions.push({
        id: mockId(),
        docId: id,
        version: 1,
        title,
        content,
        digest: digestOf(content),
        files,
        createdBy: account,
        createdAt,
        updatedBy: null,
        updatedAt: null,
      })
      for (const recipient of doc.notifyAccounts) {
        notify(recipient, 'doc-publish', 'doc', id, title)
      }
    }
    db.docs.push(doc)
    record('doc', id, 'created')
    return ok(docDetailView(doc))
  }),

  // ── 库内目录树（doc §5；契约路径嵌套于库） ──

  http.get('*/api/v1/doc-spaces/:docSpaceId/categories', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.view])) {
      return forbidden(D.view)
    }
    const guarded = guardSpaceChild(Number(params.docSpaceId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    return ok({ items: categoryTree(guarded.space.id) })
  }),

  http.post('*/api/v1/doc-spaces/:docSpaceId/categories', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.edit])) {
      return forbidden(D.edit)
    }
    const guarded = guardSpaceChild(Number(params.docSpaceId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const space = guarded.space
    const body = (await request.json()) as Record<string, unknown>
    const name = String(body.name ?? '').trim()
    if (name.length === 0 || name.length > 60) {
      return validation('目录名必填且不超过 60 字。', { name: 'required' })
    }
    const parentId = Number(body.parentId ?? 0)
    if (parentId !== 0 && !db.docCategories.some((item) => item.id === parentId && item.docSpaceId === space.id)) {
      return validation('父目录必须属于该库。', { parentId: 'notFound' })
    }
    const category: DocCategoryView = {
      id: mockId(),
      docSpaceId: space.id,
      parentId,
      name,
      sort: Number(body.sort ?? 0),
    }
    db.docCategories.push(category)
    return ok(category)
  }),

  http.patch('*/api/v1/doc-spaces/:docSpaceId/categories/:categoryId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.edit])) {
      return forbidden(D.edit)
    }
    const guarded = guardSpaceChild(Number(params.docSpaceId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const category = db.docCategories.find(
      (item) => item.id === Number(params.categoryId) && item.docSpaceId === guarded.space.id,
    )
    if (!category) {
      return notFound()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (body.name !== undefined && body.name !== null) {
      const name = String(body.name).trim()
      if (name.length === 0 || name.length > 60) {
        return validation('目录名必填且不超过 60 字。', { name: 'invalid' })
      }
      category.name = name
    }
    if (body.parentId !== undefined && body.parentId !== null) {
      const parentId = Number(body.parentId)
      if (
        parentId !== 0 &&
        !db.docCategories.some((item) => item.id === parentId && item.docSpaceId === category.docSpaceId)
      ) {
        return validation('父目录必须属于该库。', { parentId: 'notFound' })
      }
      // 移动到自身或后代 → 42201（契约 summary）
      let current: DocCategoryView | undefined = db.docCategories.find((item) => item.id === parentId)
      while (current) {
        if (current.id === category.id) {
          return validation('目录不能移动到自身或后代。', { parentId: 'cycle' })
        }
        current = db.docCategories.find((item) => item.id === current?.parentId)
      }
      category.parentId = parentId
    }
    if (body.sort !== undefined && body.sort !== null) {
      category.sort = Number(body.sort)
    }
    return ok(category)
  }),

  http.delete('*/api/v1/doc-spaces/:docSpaceId/categories/:categoryId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.edit])) {
      return forbidden(D.edit)
    }
    const guarded = guardSpaceChild(Number(params.docSpaceId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const index = db.docCategories.findIndex(
      (item) => item.id === Number(params.categoryId) && item.docSpaceId === guarded.space.id,
    )
    if (index < 0) {
      return notFound()
    }
    const category = db.docCategories[index]
    // 真实删除：有子节点或有文档引用 → 42203（§3 doc_category）
    if (category && (categoryHasChildren(category.id) || db.docs.some((doc) => doc.categoryId === category.id))) {
      return conditionNotMet('目录下有子目录或文档，无法删除。')
    }
    db.docCategories.splice(index, 1)
    return ok(null)
  }),

  // ── 文档：跨库列表 / 批量动作（doc §5 docs 族） ──

  http.get('*/api/v1/docs', ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.view])) {
      return forbidden(D.view)
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.docs.filter(
      (doc) =>
        !doc.deletedAt &&
        docAccess(doc) !== null && // DataScope：可见库 + 文档 ACL（§7）
        matchValue(doc.docSpaceId, url.searchParams.get('filters[docSpaceId]')) &&
        matchValue(doc.categoryId, url.searchParams.get('filters[categoryId]')) &&
        matchValue(doc.productId, url.searchParams.get('filters[productId]')) &&
        matchValue(doc.projectId, url.searchParams.get('filters[projectId]')) &&
        matchValue(doc.executionId, url.searchParams.get('filters[executionId]')) &&
        matchIn(doc.type, url.searchParams.get('filters[type]')) &&
        matchIn(doc.status, url.searchParams.get('filters[status]')) &&
        matchIn(doc.acl, url.searchParams.get('filters[acl]')) &&
        matchIn(doc.id, url.searchParams.get('filters[id]')) &&
        matchAccount(doc.createdBy, url.searchParams.get('filters[createdBy]')) &&
        matchAccount(doc.updatedBy, url.searchParams.get('filters[updatedBy]')),
    )
    if (q) {
      items = items.filter((doc) =>
        `${doc.title}${doc.keywords ?? ''}${snapshotOf(doc.id, doc.version)?.content ?? ''}`.toLowerCase().includes(q),
      )
    }
    const sorted = sortBy(
      items as unknown as Record<string, unknown>[],
      url.searchParams.get('sort'),
      ['id', 'sort', 'views', 'title', 'createdAt', 'updatedAt'],
      (a, b) => Number((b as unknown as DocRow).id) - Number((a as unknown as DocRow).id),
    ) as unknown as DocRow[]
    return ok(paginate(sorted.map(docView), url))
  }),

  http.post('*/api/v1/docs/batch', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    const body = (await request.json()) as { ids?: number[]; action?: string; params?: Record<string, unknown> }
    const action = String(body.action ?? '')
    if (action !== 'delete' && action !== 'move') {
      return badRequest('action 取值 delete|move。')
    }
    const perm = action === 'delete' ? D.delete : D.edit
    if (!hasPerm([perm])) {
      return forbidden(perm)
    }
    const ids = body.ids ?? []
    if (ids.length > 50) {
      return validation('批量动作上限 50 条。')
    }
    let target: DocSpaceRow | undefined
    let categoryId = 0
    let parentId = 0
    if (action === 'move') {
      target = db.docSpaces.find((item) => item.id === Number(body.params?.docSpaceId ?? 0) && !item.deletedAt)
      if (!target) {
        return notFound()
      }
      if (!spaceVisible(target)) {
        return hidden('目标文档库不可见。')
      }
      categoryId = Number(body.params?.categoryId ?? 0)
      if (
        categoryId !== 0 &&
        !db.docCategories.some((item) => item.id === categoryId && item.docSpaceId === target?.id)
      ) {
        return validation('目录必须属于目标库。', { categoryId: 'notFound' })
      }
      parentId = Number(body.params?.parentId ?? 0)
      if (
        parentId !== 0 &&
        !db.docs.some((item) => item.id === parentId && item.docSpaceId === target?.id && !item.deletedAt)
      ) {
        return validation('父章节必须属于目标库。', { parentId: 'notFound' })
      }
    }
    const results = ids.map((id) => {
      const doc = db.docs.find((item) => item.id === id && !item.deletedAt)
      if (!doc) {
        return { id, ok: false, error: '40401' }
      }
      const space = db.docSpaces.find((item) => item.id === doc.docSpaceId)
      if (!space || space.deletedAt || !spaceVisible(space)) {
        return { id, ok: false, error: '40401' }
      }
      if (docAccess(doc) !== 'edit') {
        return { id, ok: false, error: '40302' }
      }
      if (action === 'delete') {
        for (const item of collectSubtree(doc)) {
          item.deletedAt = now()
        }
        record('doc', id, 'deleted')
      } else if (target) {
        if (parentId !== 0 && isSelfOrDescendant(parentId, doc.id)) {
          return { id, ok: false, error: '42201' }
        }
        doc.docSpaceId = target.id
        doc.productId = target.productId
        doc.projectId = target.projectId
        doc.executionId = target.executionId
        doc.categoryId = categoryId
        doc.parentId = parentId
        doc.path = docPathOf(parentId, doc.id)
        rebuildSubtreePaths(doc)
        doc.lockVersion += 1
        record('doc', id, 'moved')
      }
      return { id, ok: true, error: null }
    })
    return ok({ results })
  }),

  // ── 文档：详情 / 部分更新 / 动作（doc §4、§5） ──

  http.get('*/api/v1/docs/:docId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.view])) {
      return forbidden(D.view)
    }
    const guarded = guardDoc(Number(params.docId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    // 阅读计数：published 详情 views+1（draft 不计；朴素自增，同 §4）
    if (guarded.doc.status === 'published') {
      guarded.doc.views += 1
    }
    return ok(docDetailView(guarded.doc))
  }),

  http.patch('*/api/v1/docs/:docId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.edit])) {
      return forbidden(D.edit)
    }
    const guarded = guardDoc(Number(params.docId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const { doc, access } = guarded
    if (access !== 'edit') {
      return hidden('只读白名单账号不可编辑该文档。')
    }
    const body = (await request.json()) as Record<string, unknown>
    if (DOC_IMMUTABLE_KEYS.some((key) => key in body)) {
      return badRequest('所属库/状态/版本不可直接修改（move/publish 专用端点）。')
    }
    if (body.lockVersion === undefined || body.lockVersion !== doc.lockVersion) {
      return lockConflict()
    }
    if (body.title !== undefined && body.title !== null) {
      const title = String(body.title).trim()
      if (title.length === 0 || title.length > 255) {
        return validation('标题必填且不超过 255 字。', { title: 'invalid' })
      }
      doc.title = title
    }
    if (body.keywords !== undefined) {
      doc.keywords = (body.keywords as string | null) ?? null
    }
    if (body.categoryId !== undefined && body.categoryId !== null) {
      const categoryId = Number(body.categoryId)
      if (
        categoryId !== 0 &&
        !db.docCategories.some((item) => item.id === categoryId && item.docSpaceId === doc.docSpaceId)
      ) {
        return validation('目录必须属于该库。', { categoryId: 'notFound' })
      }
      doc.categoryId = categoryId
    }
    if (body.parentId !== undefined && body.parentId !== null) {
      const parentId = Number(body.parentId)
      if (parentId !== 0) {
        const parent = db.docs.find(
          (item) => item.id === parentId && item.docSpaceId === doc.docSpaceId && !item.deletedAt,
        )
        if (!parent) {
          return validation('父章节必须属于该库。', { parentId: 'notFound' })
        }
        if (isSelfOrDescendant(parentId, doc.id)) {
          return validation('父章节不能是自身或后代。', { parentId: 'cycle' })
        }
      }
      doc.parentId = parentId
      doc.path = docPathOf(parentId, doc.id)
      rebuildSubtreePaths(doc)
    }
    if (body.acl !== undefined && body.acl !== null) {
      const acl = String(body.acl)
      if (!(DOC_ACLS as readonly string[]).includes(acl)) {
        return validation('acl 取值 open|private。', { acl: 'invalid' })
      }
      doc.acl = acl as DocRow['acl']
    }
    if (body.editors !== undefined) {
      doc.editors = aclPayloadOf(body.editors)
    }
    if (body.readers !== undefined) {
      doc.readers = aclPayloadOf(body.readers)
    }
    if (body.notifyAccounts !== undefined && body.notifyAccounts !== null) {
      doc.notifyAccounts = body.notifyAccounts as string[]
    }
    if (body.sort !== undefined && body.sort !== null) {
      doc.sort = Number(body.sort)
    }
    // acl=open 时 editors/readers 强制清空（§3.2）
    if (doc.acl === 'open') {
      doc.editors = { accounts: [], groupIds: [] }
      doc.readers = { accounts: [], groupIds: [] }
    }
    doc.lockVersion += 1
    doc.updatedBy = currentAccount()?.account ?? null
    doc.updatedAt = now()
    record('doc', doc.id, 'edited')
    return ok(docDetailView(doc))
  }),

  http.post('*/api/v1/docs/:docId/save-draft', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.edit])) {
      return forbidden(D.edit)
    }
    const guarded = guardDoc(Number(params.docId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const { doc, access } = guarded
    if (access !== 'edit') {
      return hidden('只读白名单账号不可编辑该文档。')
    }
    const body = (await request.json()) as Record<string, unknown>
    if (typeof body.content !== 'string') {
      return validation('content 必填。', { content: 'required' })
    }
    if (body.title !== undefined && body.title !== null) {
      const title = String(body.title).trim()
      if (title.length === 0 || title.length > 255) {
        return validation('标题必填且不超过 255 字。', { title: 'invalid' })
      }
      doc.title = title
    }
    const actor = currentAccount()?.account ?? 'system'
    const content = body.content
    const files = (body.files as number[] | undefined) ?? workingCopyOf(doc.id)?.files ?? []
    let draft = workingCopyOf(doc.id)
    if (draft) {
      draft.title = doc.title
      draft.content = content
      draft.digest = digestOf(content)
      draft.files = files
      draft.updatedBy = actor
      draft.updatedAt = now()
    } else {
      draft = {
        id: mockId(),
        docId: doc.id,
        version: 0,
        title: doc.title,
        content,
        digest: digestOf(content),
        files,
        createdBy: actor,
        createdAt: now(),
        updatedBy: actor,
        updatedAt: now(),
      }
      db.docVersions.push(draft)
    }
    // 覆盖写 v0：不升 version、不改已发布内容、不写动态流（§4）
    doc.hasDraft = true
    doc.lockVersion += 1
    doc.updatedBy = actor
    doc.updatedAt = now()
    return ok(docDetailView(doc))
  }),

  http.post('*/api/v1/docs/:docId/publish', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.edit])) {
      return forbidden(D.edit)
    }
    const guarded = guardDoc(Number(params.docId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const { doc, access } = guarded
    if (access !== 'edit') {
      return hidden('只读白名单账号不可发布该文档。')
    }
    await commentOf(request)
    const draft = workingCopyOf(doc.id)
    const content = draft?.content ?? null
    const files = draft?.files ?? []
    const account = currentAccount()?.account ?? 'system'
    const title = draft?.title ?? doc.title
    if (doc.version === 0) {
      // 首发守卫：title 非空（doc §4 publish 行；正文允许为空）
      if (title.trim().length === 0) {
        return validation('发布前标题不能为空。', { title: 'required' })
      }
      // 首发：v0 → v1 快照（§4）
      db.docVersions.push({
        id: mockId(),
        docId: doc.id,
        version: 1,
        title,
        content,
        digest: digestOf(content),
        files,
        createdBy: account,
        createdAt: now(),
        updatedBy: null,
        updatedAt: null,
      })
      doc.version = 1
      doc.status = 'published'
      record('doc', doc.id, 'published')
    } else {
      const latest = snapshotOf(doc.id, doc.version)
      if (
        latest &&
        latest.title === title &&
        (latest.content ?? '') === (content ?? '') &&
        JSON.stringify(latest.files ?? []) === JSON.stringify(files)
      ) {
        return conditionNotMet('内容与当前版本一致，无需发布。')
      }
      // 再发布：v0 → v(n+1) 新快照，v0 保留为与新快照一致的工作副本（§4/§8）
      const nextVersion = doc.version + 1
      db.docVersions.push({
        id: mockId(),
        docId: doc.id,
        version: nextVersion,
        title,
        content,
        digest: digestOf(content),
        files,
        createdBy: account,
        createdAt: now(),
        updatedBy: null,
        updatedAt: null,
      })
      doc.version = nextVersion
      doc.status = 'published'
      record('doc', doc.id, 'edited')
    }
    doc.hasDraft = hasDraftOf(doc)
    doc.lockVersion += 1
    doc.updatedBy = account
    doc.updatedAt = now()
    for (const recipient of doc.notifyAccounts) {
      notify(recipient, 'doc-publish', 'doc', doc.id, doc.title)
    }
    return ok(docDetailView(doc))
  }),

  http.post('*/api/v1/docs/:docId/move', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.edit])) {
      return forbidden(D.edit)
    }
    const guarded = guardDoc(Number(params.docId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const { doc, access } = guarded
    if (access !== 'edit') {
      return hidden('只读白名单账号不可移动该文档。')
    }
    const body = (await request.json()) as Record<string, unknown>
    const targetId = Number(body.docSpaceId ?? 0)
    const target = db.docSpaces.find((item) => item.id === targetId && !item.deletedAt)
    if (!target) {
      return notFound()
    }
    if (!spaceVisible(target)) {
      return hidden('目标文档库不可见。')
    }
    const categoryId = Number(body.categoryId ?? 0)
    if (categoryId !== 0 && !db.docCategories.some((item) => item.id === categoryId && item.docSpaceId === target.id)) {
      return validation('目录必须属于目标库。', { categoryId: 'notFound' })
    }
    const parentId = Number(body.parentId ?? 0)
    if (parentId !== 0) {
      const parent = db.docs.find((item) => item.id === parentId && item.docSpaceId === target.id && !item.deletedAt)
      if (!parent) {
        return validation('父章节必须属于目标库。', { parentId: 'notFound' })
      }
      if (isSelfOrDescendant(parentId, doc.id)) {
        return validation('父章节不能是自身或后代。', { parentId: 'cycle' })
      }
    }
    doc.docSpaceId = target.id
    doc.productId = target.productId // 冗余列跟随目标库联动（§4 move 副作用）
    doc.projectId = target.projectId
    doc.executionId = target.executionId
    doc.categoryId = categoryId
    doc.parentId = parentId
    doc.path = docPathOf(parentId, doc.id)
    rebuildSubtreePaths(doc)
    doc.lockVersion += 1
    doc.updatedBy = currentAccount()?.account ?? null
    doc.updatedAt = now()
    record('doc', doc.id, 'moved')
    return ok(docDetailView(doc))
  }),

  http.delete('*/api/v1/docs/:docId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.delete])) {
      return forbidden(D.delete)
    }
    const guarded = guardDoc(Number(params.docId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const { doc, access } = guarded
    if (access !== 'edit') {
      return hidden('只读白名单账号不可删除该文档。')
    }
    // 软删并级联子文档（§4 delete 副作用）
    for (const item of collectSubtree(doc)) {
      item.deletedAt = now()
    }
    record('doc', doc.id, 'deleted')
    return ok(null)
  }),

  http.get('*/api/v1/docs/:docId/versions', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.view])) {
      return forbidden(D.view)
    }
    const guarded = guardDoc(Number(params.docId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    // 固定 version desc，不分页（§3.3）
    const items = db.docVersions
      .filter((item) => item.docId === guarded.doc.id && item.version >= 1)
      .sort((a, b) => b.version - a.version)
    return ok({ items, total: items.length })
  }),

  http.get('*/api/v1/docs/:docId/versions/:version', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.view])) {
      return forbidden(D.view)
    }
    const guarded = guardDoc(Number(params.docId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const version = Number(params.version)
    if (version === 0) {
      // 草稿工作副本仅可编辑者（§4/§7），余者 40302
      if (guarded.access !== 'edit') {
        return hidden('草稿工作副本仅可编辑者可见。')
      }
      const draft = workingCopyOf(guarded.doc.id)
      if (!draft) {
        return notFound()
      }
      return ok(draft)
    }
    const snapshot = snapshotOf(guarded.doc.id, version)
    if (!snapshot) {
      return notFound()
    }
    return ok(snapshot)
  }),

  http.get('*/api/v1/docs/:docId/activities', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([D.view])) {
      return forbidden(D.view)
    }
    const guarded = guardDoc(Number(params.docId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    return ok(activityPage(guarded.doc.id, new URL(request.url)))
  }),
]

/**
 * meta 域 `docSpace`/`doc`（platform `GET /meta/{domain}` 消费；与 backend DocRegistrar + workflow/doc.yml 同源）。
 * 动作顺序 = YAML 声明顺序，allowedStatus = 各动作 from 集；action.code 由 workflow 导出（doc-save-draft 等）。
 */
export const DOC_META_BY_DOMAIN: Record<string, unknown> = {
  docSpace: {
    domain: 'docSpace',
    fields: [
      { key: 'name', type: 'text', required: true, maxLength: 60, i18n: 'docSpace.field.name' },
      { key: 'type', type: 'select', required: true, i18n: 'docSpace.type', options: DOC_SPACE_TYPE_OPTIONS },
      { key: 'productId', type: 'select', i18n: 'docSpace.field.product' },
      { key: 'projectId', type: 'select', i18n: 'docSpace.field.project' },
      { key: 'executionId', type: 'select', i18n: 'docSpace.field.execution' },
      { key: 'acl', type: 'select', required: true, i18n: 'docSpace.acl', options: DOC_SPACE_ACL_OPTIONS },
      { key: 'whitelist', type: 'multiselect', i18n: 'docSpace.field.whitelist', source: 'accounts' },
      { key: 'description', type: 'textarea', i18n: 'docSpace.field.description' },
      { key: 'docSort', type: 'select', i18n: 'docSpace.field.docSort', options: DOC_SPACE_DOC_SORT_OPTIONS },
      { key: 'isDefault', type: 'checkbox', i18n: 'docSpace.field.isDefault' },
      { key: 'sort', type: 'number', i18n: 'docSpace.field.sort' },
    ],
    list: { defaultColumns: ['id', 'name', 'type', 'acl', 'docCount', 'createdBy'], defaultSort: '-id' },
    actions: [],
    statusVisuals: {},
  },
  doc: {
    domain: 'doc',
    fields: [
      { key: 'title', type: 'text', required: true, maxLength: 255, i18n: 'doc.field.title' },
      { key: 'keywords', type: 'text', maxLength: 255, i18n: 'doc.field.keywords' },
      { key: 'docSpaceId', type: 'select', required: true, i18n: 'doc.field.docSpace' },
      { key: 'categoryId', type: 'categoryTree', i18n: 'doc.field.category' },
      { key: 'parentId', type: 'select', i18n: 'doc.field.parent' },
      { key: 'type', type: 'select', required: true, i18n: 'doc.field.type', options: DOC_TYPE_OPTIONS },
      { key: 'acl', type: 'select', required: true, i18n: 'doc.acl', options: DOC_ACL_OPTIONS },
      { key: 'status', type: 'select', i18n: 'doc.field.status', options: DOC_STATUS_OPTIONS },
      { key: 'editors', type: 'multiselect', i18n: 'doc.field.editors', source: 'accounts' },
      { key: 'readers', type: 'multiselect', i18n: 'doc.field.readers', source: 'accounts' },
      { key: 'notifyAccounts', type: 'accounts', i18n: 'doc.field.notify', source: 'accounts' },
      { key: 'content', type: 'richtext', i18n: 'doc.field.content' },
      { key: 'files', type: 'file', i18n: 'doc.field.files' },
      { key: 'version', type: 'number', i18n: 'doc.field.version' },
      { key: 'views', type: 'number', i18n: 'doc.field.views' },
      { key: 'sort', type: 'number', i18n: 'doc.field.sort' },
    ],
    list: {
      defaultColumns: ['id', 'title', 'status', 'version', 'views', 'createdBy', 'updatedAt'],
      defaultSort: '-id',
    },
    actions: [
      {
        code: 'doc-save-draft',
        action: 'save-draft',
        i18n: 'doc.action.save-draft',
        allowedStatus: ['draft', 'published'],
      },
      { code: 'doc-publish', action: 'publish', i18n: 'doc.action.publish', allowedStatus: ['draft', 'published'] },
      { code: 'doc-move', action: 'move', i18n: 'doc.action.move', allowedStatus: ['draft', 'published'] },
      { code: 'doc-delete', action: 'delete', i18n: 'doc.action.delete', allowedStatus: ['draft', 'published'] },
    ],
    statusVisuals: {
      draft: { tone: 'wait', i18n: 'doc.status.draft' },
      published: { tone: 'active', i18n: 'doc.status.published' },
    },
  },
}
