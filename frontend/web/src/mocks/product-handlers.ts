import type { BranchView } from '@zentao/api-client/generated/model/branchView'
import type { BuildView } from '@zentao/api-client/generated/model/buildView'
import type { CategoryView } from '@zentao/api-client/generated/model/categoryView'
import type { PlanView } from '@zentao/api-client/generated/model/planView'
import type { ProductView } from '@zentao/api-client/generated/model/productView'
import type { ReleaseView } from '@zentao/api-client/generated/model/releaseView'
import { HttpResponse, http } from 'msw'
import { currentAccount, db, error, FORBIDDEN, mockId, NOT_FOUND, privilegesOf, UNAUTHENTICATED } from './db'
import {
  BRANCH_STATUS_OPTIONS,
  CATEGORY_TYPE_OPTIONS,
  PLAN_CLOSE_REASON_OPTIONS,
  PLAN_STATUS_OPTIONS,
  PRODUCT_ACL_OPTIONS,
  PRODUCT_STATUS_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
  RELEASE_STATUS_OPTIONS,
} from './meta-options'

const ok = (data: unknown) => HttpResponse.json({ data })
const unauthorized = () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })
const forbidden = (perm: string) => HttpResponse.json(FORBIDDEN(perm), { status: 403 })
export const hidden = () => HttpResponse.json(error(40302, '无权访问该产品。'), { status: 403 })
const validation = (message: string, fields?: Record<string, string>) =>
  HttpResponse.json(
    { error: { code: 42201, message, traceId: 'mock', ...(fields ? { fields } : {}) } },
    { status: 422 },
  )
const stateConflict = (message: string) => HttpResponse.json(error(42202, message), { status: 422 })
const referenced = (message: string) => HttpResponse.json(error(42203, message), { status: 422 })
const lockConflict = () => HttpResponse.json(error(40901, '数据已被他人修改，请刷新后重试。'), { status: 409 })
const notFound = () => HttpResponse.json(NOT_FOUND, { status: 404 })

// ── 会话 / 权限 / 可见性（product §7） ──

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

function canSee(product: ProductView): boolean {
  const account = currentAccount()
  if (!account) {
    return false
  }
  if (account.roleIds.includes(1)) {
    return true
  }
  const me = account.account
  if (product.acl === 'public') {
    return true
  }
  if (product.whitelist.includes(me)) {
    return true
  }
  return product.acl === 'private' && [product.createdBy, product.po, product.qd, product.rd].includes(me)
}

export function visibleProduct(productId: number): ProductView | undefined {
  return db.products.find((product) => product.id === productId && canSee(product))
}

/** 子对象继承产品可见性：不可见 → 40302（先于 40401）。 */
function requireProduct(productId: number): ProductView | undefined {
  return visibleProduct(productId)
}

// ── 活动流 / 通知 ──

export function record(objectType: string, objectId: number, action: string, remark: string | null = null): void {
  db.activities.push({
    id: mockId(),
    objectType,
    objectId,
    actor: currentAccount()?.account ?? 'system',
    action,
    detail: null,
    remark,
    occurredAt: new Date().toISOString(),
  })
}

export function notify(recipient: string, type: string, objectType: string, objectId: number, title: string): void {
  db.notifications.push({
    id: mockId(),
    recipient,
    type,
    objectType,
    objectId,
    activityId: null,
    title,
    content: null,
    readAt: null,
    createdBy: currentAccount()?.account ?? 'system',
    createdAt: new Date().toISOString(),
  })
}

function activityPage(objectType: string, objectId: number, url: URL): { items: unknown[]; hasMore: boolean } {
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  const beforeId = Number(url.searchParams.get('beforeId') ?? Number.MAX_SAFE_INTEGER)
  const items = db.activities
    .filter(
      (activity) => activity.objectType === objectType && activity.objectId === objectId && activity.id < beforeId,
    )
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
  return { items, hasMore: items.length === limit }
}

// ── 列表 DSL（03 §3 的最小实现：page/limit/sort/q/filters[x]） ──

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

/**
 * 区间过滤口径与后端 Filters 对齐（platform/filters/Filters.java）：带 `..` 才是 RANGE（半开区间，
 * 边界可空），**裸值 = EQ**——早先这里把裸值当 `>=`，与后端不一致：页面的「截止日期=某天」在 mock
 * 下会多出该天之后的行。
 */
function matchRange(value: unknown, filter: string | null): boolean {
  if (!filter) {
    return true
  }
  const current = String(value ?? '')
  if (!filter.includes('..')) {
    return current === filter
  }
  const [from, to] = filter.split('..')
  if (from && current < from) {
    return false
  }
  return !(to && current > to)
}

function paginate<T>(items: T[], url: URL): { items: T[]; total: number } {
  const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  return { items: items.slice((page - 1) * limit, page * limit), total: items.length }
}

function sortBy<T extends Record<string, unknown>>(
  items: T[],
  sort: string | null,
  fallback: (a: T, b: T) => number,
): T[] {
  if (!sort) {
    return [...items].sort(fallback)
  }
  const desc = sort.startsWith('-')
  const key = desc ? sort.slice(1) : sort
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

function filterParam(url: URL, key: string): string | null {
  return url.searchParams.get(`filters[${key}]`)
}

function lockVersionOf(body: Record<string, unknown>, current: number): boolean {
  return body.lockVersion === undefined || body.lockVersion === current
}

// ── meta 目录（与 workflow YAML 同源，03 §6） ──

export const PRODUCT_META = {
  domain: 'product',
  fields: [
    { key: 'name', type: 'text', required: true, maxLength: 90, i18n: 'product.field.name' },
    { key: 'code', type: 'text', maxLength: 45, i18n: 'product.field.code' },
    { key: 'type', type: 'select', i18n: 'product.field.type', options: PRODUCT_TYPE_OPTIONS },
    { key: 'acl', type: 'select', i18n: 'product.field.acl', options: PRODUCT_ACL_OPTIONS },
    { key: 'status', type: 'select', i18n: 'product.field.status', options: PRODUCT_STATUS_OPTIONS },
    { key: 'whitelist', type: 'multiselect', source: 'accounts', i18n: 'product.field.whitelist' },
    { key: 'po', type: 'select', source: 'accounts', i18n: 'product.field.po' },
    { key: 'qd', type: 'select', source: 'accounts', i18n: 'product.field.qd' },
    { key: 'rd', type: 'select', source: 'accounts', i18n: 'product.field.rd' },
    { key: 'sort', type: 'number', i18n: 'product.field.sort' },
  ],
  list: { defaultColumns: ['id', 'name', 'status', 'acl'], defaultSort: 'sort' },
  actions: [
    { code: 'product-edit', action: 'edit', i18n: 'product.action.edit', allowedStatus: ['normal'] },
    { code: 'product-close', action: 'close', i18n: 'product.action.close', allowedStatus: ['normal'] },
    { code: 'product-activate', action: 'activate', i18n: 'product.action.activate', allowedStatus: ['closed'] },
  ],
  statusVisuals: {
    normal: { tone: 'active', i18n: 'product.status.normal' },
    closed: { tone: 'closed', i18n: 'product.status.closed' },
  },
}

export const BRANCH_META = {
  domain: 'branch',
  fields: [
    { key: 'name', type: 'text', required: true, maxLength: 255, i18n: 'branch.field.name' },
    { key: 'status', type: 'select', i18n: 'branch.field.status', options: BRANCH_STATUS_OPTIONS },
    { key: 'sort', type: 'number', i18n: 'branch.field.sort' },
  ],
  actions: [
    { code: 'branch-manage', action: 'set-default', i18n: 'branch.action.setDefault', allowedStatus: ['active'] },
    { code: 'branch-manage', action: 'close', i18n: 'branch.action.close', allowedStatus: ['active'] },
    { code: 'branch-manage', action: 'activate', i18n: 'branch.action.activate', allowedStatus: ['closed'] },
  ],
  statusVisuals: {
    active: { tone: 'active', i18n: 'branch.status.active' },
    closed: { tone: 'closed', i18n: 'branch.status.closed' },
  },
}

export const CATEGORY_META = {
  domain: 'category',
  fields: [
    { key: 'name', type: 'text', required: true, maxLength: 60, i18n: 'category.field.name' },
    { key: 'type', type: 'select', required: true, i18n: 'category.field.type', options: CATEGORY_TYPE_OPTIONS },
    { key: 'parentId', type: 'select', i18n: 'category.field.parent' },
    { key: 'owner', type: 'select', source: 'accounts', i18n: 'category.field.owner' },
    { key: 'sort', type: 'number', i18n: 'category.field.sort' },
  ],
  actions: [],
  statusVisuals: {},
}

export const PLAN_META = {
  domain: 'plan',
  fields: [
    { key: 'title', type: 'text', required: true, maxLength: 90, i18n: 'plan.field.title' },
    { key: 'status', type: 'select', i18n: 'plan.field.status', options: PLAN_STATUS_OPTIONS },
    { key: 'closedReason', type: 'select', i18n: 'plan.field.closedReason', options: PLAN_CLOSE_REASON_OPTIONS },
    { key: 'branchId', type: 'select', i18n: 'plan.field.branch' },
    { key: 'parentId', type: 'select', i18n: 'plan.field.parent' },
    { key: 'beginDate', type: 'date', i18n: 'plan.field.beginDate' },
    { key: 'endDate', type: 'date', i18n: 'plan.field.endDate' },
  ],
  actions: [
    { code: 'plan-start', action: 'start', i18n: 'plan.action.start', allowedStatus: ['wait'] },
    { code: 'plan-finish', action: 'finish', i18n: 'plan.action.finish', allowedStatus: ['doing'] },
    { code: 'plan-close', action: 'close', i18n: 'plan.action.close', allowedStatus: ['wait', 'doing', 'done'] },
    { code: 'plan-activate', action: 'activate', i18n: 'plan.action.activate', allowedStatus: ['done', 'closed'] },
    { code: 'plan-edit', action: 'edit', i18n: 'common.action.edit', allowedStatus: ['wait', 'doing', 'done'] },
    { code: 'plan-link', action: 'link', i18n: 'plan.action.link', allowedStatus: ['wait', 'doing', 'done'] },
  ],
  statusVisuals: {
    wait: { tone: 'pending', i18n: 'plan.status.wait' },
    doing: { tone: 'active', i18n: 'plan.status.doing' },
    done: { tone: 'closed', i18n: 'plan.status.done' },
    closed: { tone: 'closed', i18n: 'plan.status.closed' },
  },
}

export const RELEASE_META = {
  domain: 'release',
  fields: [
    { key: 'name', type: 'text', required: true, maxLength: 90, i18n: 'release.field.name' },
    { key: 'status', type: 'select', i18n: 'release.field.status', options: RELEASE_STATUS_OPTIONS },
    { key: 'releaseDate', type: 'date', required: true, i18n: 'release.field.releaseDate' },
    { key: 'branchId', type: 'select', i18n: 'release.field.branch' },
    { key: 'buildId', type: 'select', i18n: 'release.field.build' },
    { key: 'isMilestone', type: 'bool', i18n: 'release.field.isMilestone' },
    { key: 'notifyAccounts', type: 'multiselect', source: 'accounts', i18n: 'release.field.notify' },
  ],
  actions: [
    { code: 'release-edit', action: 'edit', i18n: 'common.action.edit', allowedStatus: ['normal'] },
    { code: 'release-link', action: 'link', i18n: 'release.action.link', allowedStatus: ['normal'] },
    { code: 'release-terminate', action: 'terminate', i18n: 'release.action.terminate', allowedStatus: ['normal'] },
  ],
  statusVisuals: {
    normal: { tone: 'active', i18n: 'release.status.normal' },
    terminated: { tone: 'error', i18n: 'release.status.terminated' },
  },
}

export const BUILD_META = {
  domain: 'build',
  fields: [
    { key: 'name', type: 'text', required: true, maxLength: 150, i18n: 'build.field.name' },
    { key: 'buildDate', type: 'date', required: true, i18n: 'build.field.buildDate' },
    { key: 'builder', type: 'select', source: 'accounts', required: true, i18n: 'build.field.builder' },
    { key: 'branchId', type: 'select', i18n: 'build.field.branch' },
    { key: 'scmPath', type: 'text', maxLength: 255, i18n: 'build.field.scmPath' },
    { key: 'filePath', type: 'text', maxLength: 255, i18n: 'build.field.filePath' },
  ],
  actions: [
    { code: 'build-edit', action: 'edit', i18n: 'common.action.edit' },
    { code: 'build-link', action: 'link', i18n: 'build.action.link' },
    { code: 'build-delete', action: 'delete', i18n: 'common.action.delete' },
  ],
  statusVisuals: {},
}

export const PRODUCT_META_BY_DOMAIN: Record<string, unknown> = {
  product: PRODUCT_META,
  branch: BRANCH_META,
  category: CATEGORY_META,
  plan: PLAN_META,
  release: RELEASE_META,
  build: BUILD_META,
}

// ── handlers ──

const P = {
  view: 'product-view',
  create: 'product-create',
  edit: 'product-edit',
  close: 'product-close',
  activate: 'product-activate',
}

export const productHandlers = [
  // ── 产品 ──
  http.get('*/api/v1/products', ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.view])) {
      return forbidden(P.view)
    }
    const url = new URL(request.url)
    const status = filterParam(url, 'status')
    const type = filterParam(url, 'type')
    const acl = filterParam(url, 'acl')
    const ids = filterParam(url, 'id')
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.products.filter(canSee)
    items = items.filter(
      (item) =>
        matchIn(item.status, status) &&
        matchIn(item.type, type) &&
        matchIn(item.acl, acl) &&
        matchIn(item.id, ids) &&
        matchValue(item.po, filterParam(url, 'po')) &&
        matchValue(item.qd, filterParam(url, 'qd')) &&
        matchValue(item.rd, filterParam(url, 'rd')) &&
        matchRange(item.createdAt, filterParam(url, 'createdAt')),
    )
    if (q) {
      items = items.filter((item) => `${item.name}${item.code ?? ''}`.toLowerCase().includes(q))
    }
    const sorted = sortBy(
      items as unknown as Record<string, unknown>[],
      url.searchParams.get('sort'),
      (a, b) => Number(a.sort) - Number(b.sort) || Number(a.id) - Number(b.id),
    )
    return ok(paginate(sorted as unknown as ProductView[], url))
  }),

  http.post('*/api/v1/products', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.create])) {
      return forbidden(P.create)
    }
    const body = (await request.json()) as Record<string, unknown>
    const acl = String(body.acl ?? 'public')
    const whitelist = (body.whitelist as string[] | undefined) ?? []
    if (acl === 'custom' && whitelist.length === 0) {
      return validation('自定义白名单不能为空。', { whitelist: 'required' })
    }
    if (whitelist.length > 100) {
      return validation('白名单最多 100 人。', { whitelist: 'tooMany' })
    }
    const account = currentAccount()
    const product: ProductView = {
      id: mockId(),
      programId: Number(body.programId ?? 0),
      name: String(body.name ?? ''),
      code: (body.code as string | null) ?? null,
      type: (body.type as ProductView['type']) ?? 'normal',
      status: 'normal',
      description: (body.description as string | null) ?? null,
      po: (body.po as string | null) ?? null,
      qd: (body.qd as string | null) ?? null,
      rd: (body.rd as string | null) ?? null,
      acl: acl as ProductView['acl'],
      whitelist,
      sort: Number(body.sort ?? 0),
      createdBy: account?.account ?? 'system',
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: null,
      closedAt: null,
      lockVersion: 0,
    }
    db.products.push(product)
    record('product', product.id, 'created')
    return ok(product)
  }),

  http.post('*/api/v1/products/batch', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    const body = (await request.json()) as { ids: number[]; action: string; params?: Record<string, unknown> }
    const perm = body.action === 'close' ? P.close : body.action === 'activate' ? P.activate : P.edit
    if (!hasPerm([perm])) {
      return forbidden(perm)
    }
    const items = (body.params?.items as { id: number }[] | undefined) ?? []
    const results = body.ids.map((id) => {
      const product = db.products.find((item) => item.id === id)
      if (!product) {
        return { id, ok: false, error: '40401' }
      }
      if (!canSee(product)) {
        return { id, ok: false, error: '40301' }
      }
      if (body.action === 'close') {
        if (product.status !== 'normal') {
          return { id, ok: false, error: '42202' }
        }
        product.status = 'closed'
        product.closedAt = new Date().toISOString()
        record('product', id, 'closed')
      } else if (body.action === 'activate') {
        if (product.status !== 'closed') {
          return { id, ok: false, error: '42202' }
        }
        product.status = 'normal'
        product.closedAt = null
        record('product', id, 'activated')
      } else {
        const patch = items.find((item) => item.id === id)
        if (patch) {
          Object.assign(product, patch)
          product.updatedAt = new Date().toISOString()
          record('product', id, 'edited')
        }
      }
      return { id, ok: true, error: null }
    })
    return ok({ results })
  }),

  http.get('*/api/v1/products/:productId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.view])) {
      return forbidden(P.view)
    }
    const product = db.products.find((item) => item.id === Number(params.productId))
    if (!product) {
      return notFound()
    }
    if (!canSee(product)) {
      return hidden()
    }
    return ok(product)
  }),

  http.patch('*/api/v1/products/:productId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.edit])) {
      return forbidden(P.edit)
    }
    const product = db.products.find((item) => item.id === Number(params.productId))
    if (!product) {
      return notFound()
    }
    if (!canSee(product)) {
      return hidden()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (!lockVersionOf(body, product.lockVersion)) {
      return lockConflict()
    }
    const acl = (body.acl as string | undefined) ?? product.acl
    const whitelist = (body.whitelist as string[] | undefined) ?? product.whitelist
    if (acl === 'custom' && whitelist.length === 0) {
      return validation('自定义白名单不能为空。', { whitelist: 'required' })
    }
    if (whitelist.length > 100) {
      return validation('白名单最多 100 人。', { whitelist: 'tooMany' })
    }
    const editable = ['name', 'code', 'type', 'programId', 'po', 'qd', 'rd', 'acl', 'whitelist', 'description', 'sort']
    for (const key of editable) {
      if (key in body) {
        ;(product as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    product.lockVersion += 1
    product.updatedAt = new Date().toISOString()
    record('product', product.id, 'edited')
    return ok(product)
  }),

  http.post('*/api/v1/products/:productId/close', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.close])) {
      return forbidden(P.close)
    }
    const product = db.products.find((item) => item.id === Number(params.productId))
    if (!product) {
      return notFound()
    }
    if (product.status !== 'normal') {
      return stateConflict('仅正常状态的产品可结束。')
    }
    const body = (await request.json().catch(() => ({}))) as { comment?: string | null }
    product.status = 'closed'
    product.closedAt = new Date().toISOString()
    product.lockVersion += 1
    record('product', product.id, 'closed', body.comment ?? null)
    return ok(product)
  }),

  http.post('*/api/v1/products/:productId/activate', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.activate])) {
      return forbidden(P.activate)
    }
    const product = db.products.find((item) => item.id === Number(params.productId))
    if (!product) {
      return notFound()
    }
    if (product.status !== 'closed') {
      return stateConflict('仅已结束的产品可激活。')
    }
    const body = (await request.json().catch(() => ({}))) as { comment?: string | null }
    product.status = 'normal'
    product.closedAt = null
    product.lockVersion += 1
    record('product', product.id, 'activated', body.comment ?? null)
    return ok(product)
  }),

  http.delete('*/api/v1/products/:productId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['product-delete'])) {
      return forbidden('product-delete')
    }
    const product = requireProduct(Number(params.productId))
    if (!product) {
      return notFound()
    }
    // §5 delete 守卫：存在未删 story/branch/plan/release/build 任一 → 42203
    if (db.stories.some((story) => story.productId === product.id)) {
      return referenced('产品下存在未删除的需求，不能删除。')
    }
    if (db.branches.some((branch) => branch.productId === product.id)) {
      return referenced('产品下存在未删除的分支，不能删除。')
    }
    if (db.plans.some((plan) => plan.productId === product.id)) {
      return referenced('产品下存在未删除的计划，不能删除。')
    }
    if (db.releases.some((release) => release.productId === product.id)) {
      return referenced('产品下存在未删除的发布，不能删除。')
    }
    if (db.builds.some((build) => build.productId === product.id)) {
      return referenced('产品下存在未删除的构建，不能删除。')
    }
    db.products = db.products.filter((item) => item.id !== product.id)
    record('product', product.id, 'deleted', product.name)
    return ok(null)
  }),

  http.get('*/api/v1/products/:productId/activities', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.view])) {
      return forbidden(P.view)
    }
    const product = requireProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    return ok(activityPage('product', product.id, new URL(request.url)))
  }),

  // ── 分支 ──
  http.get('*/api/v1/products/:productId/branches', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.view])) {
      return forbidden(P.view)
    }
    const product = requireProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const url = new URL(request.url)
    const status = filterParam(url, 'status')
    const q = url.searchParams.get('q')?.toLowerCase()
    let items: BranchView[] = db.branches.filter(
      (branch) => branch.productId === product.id && matchIn(branch.status, status),
    )
    if (q) {
      items = items.filter((branch) => branch.name.toLowerCase().includes(q))
    }
    items = sortBy(
      items as unknown as Record<string, unknown>[],
      url.searchParams.get('sort'),
      (a, b) => Number(a.sort) - Number(b.sort),
    ) as unknown as BranchView[]
    return ok({ items, total: items.length })
  }),

  http.post('*/api/v1/products/:productId/branches', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['branch-manage'])) {
      return forbidden('branch-manage')
    }
    const product = requireProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    if (product.type === 'normal') {
      return validation('普通产品不支持分支。')
    }
    const body = (await request.json()) as { name: string; description?: string | null; sort?: number | null }
    if (db.branches.some((branch) => branch.productId === product.id && branch.name === body.name)) {
      return validation('同产品分支名不能重复。', { name: 'duplicate' })
    }
    const branch: BranchView = {
      id: mockId(),
      productId: product.id,
      name: body.name,
      isDefault: db.branches.every((item) => item.productId !== product.id),
      status: 'active',
      description: body.description ?? null,
      sort: body.sort ?? 0,
      createdBy: currentAccount()?.account ?? 'system',
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: null,
      closedAt: null,
      lockVersion: 0,
    }
    db.branches.push(branch)
    record('product', product.id, 'branch-created', branch.name)
    return ok(branch)
  }),

  http.patch('*/api/v1/branches/:branchId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['branch-manage'])) {
      return forbidden('branch-manage')
    }
    const branch = db.branches.find((item) => item.id === Number(params.branchId))
    if (!branch || !requireProduct(branch.productId)) {
      return notFound()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (!lockVersionOf(body, branch.lockVersion)) {
      return lockConflict()
    }
    if (
      typeof body.name === 'string' &&
      db.branches.some(
        (item) => item.productId === branch.productId && item.name === body.name && item.id !== branch.id,
      )
    ) {
      return validation('同产品分支名不能重复。', { name: 'duplicate' })
    }
    for (const key of ['name', 'description', 'sort']) {
      if (key in body) {
        ;(branch as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    branch.lockVersion += 1
    branch.updatedAt = new Date().toISOString()
    record('product', branch.productId, 'branch-edited', branch.name)
    return ok(branch)
  }),

  http.post('*/api/v1/branches/:branchId/close', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['branch-manage'])) {
      return forbidden('branch-manage')
    }
    const branch = db.branches.find((item) => item.id === Number(params.branchId))
    if (!branch || !requireProduct(branch.productId)) {
      return notFound()
    }
    if (branch.status !== 'active') {
      return stateConflict('仅激活状态的分支可关闭。')
    }
    branch.status = 'closed'
    branch.closedAt = new Date().toISOString()
    branch.lockVersion += 1
    record('product', branch.productId, 'branch-closed', branch.name)
    return ok(branch)
  }),

  http.post('*/api/v1/branches/:branchId/activate', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['branch-manage'])) {
      return forbidden('branch-manage')
    }
    const branch = db.branches.find((item) => item.id === Number(params.branchId))
    if (!branch || !requireProduct(branch.productId)) {
      return notFound()
    }
    if (branch.status !== 'closed') {
      return stateConflict('仅已关闭的分支可激活。')
    }
    branch.status = 'active'
    branch.closedAt = null
    branch.lockVersion += 1
    record('product', branch.productId, 'branch-activated', branch.name)
    return ok(branch)
  }),

  http.post('*/api/v1/branches/:branchId/set-default', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['branch-manage'])) {
      return forbidden('branch-manage')
    }
    const branch = db.branches.find((item) => item.id === Number(params.branchId))
    if (!branch || !requireProduct(branch.productId)) {
      return notFound()
    }
    if (branch.status !== 'active') {
      return stateConflict('仅激活状态的分支可设为默认。')
    }
    for (const item of db.branches) {
      if (item.productId === branch.productId) {
        item.isDefault = item.id === branch.id
      }
    }
    record('product', branch.productId, 'branch-default', branch.name)
    return ok(branch)
  }),

  http.delete('*/api/v1/branches/:branchId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['branch-delete'])) {
      return forbidden('branch-delete')
    }
    const branch = db.branches.find((item) => item.id === Number(params.branchId))
    if (!branch || !requireProduct(branch.productId)) {
      return notFound()
    }
    // §5 delete 守卫：分支下存在未删需求 → 42203
    if (db.stories.some((story) => story.branchId === branch.id)) {
      return referenced('分支下存在未删除的需求，不能删除。')
    }
    db.branches = db.branches.filter((item) => item.id !== branch.id)
    record('product', branch.productId, 'branch-deleted', branch.name)
    return ok(null)
  }),

  // ── 分类 ──
  http.get('*/api/v1/products/:productId/categories', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.view])) {
      return forbidden(P.view)
    }
    const product = requireProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const url = new URL(request.url)
    const type = filterParam(url, 'type')
    if (!type) {
      return HttpResponse.json(error(40001, 'filters[type] 必填。'), { status: 400 })
    }
    const branchId = filterParam(url, 'branchId')
    const items = db.categories.filter(
      (category) =>
        category.productId === product.id &&
        matchIn(category.type, type) &&
        matchValue(category.branchId ?? 0, branchId) &&
        matchIn(category.parentId ?? 0, filterParam(url, 'parentId')),
    )
    return ok({ items, total: items.length })
  }),

  http.post('*/api/v1/products/:productId/categories', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['category-manage'])) {
      return forbidden('category-manage')
    }
    const product = requireProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const body = (await request.json()) as Record<string, unknown>
    const type = String(body.type ?? 'story')
    const parentId = Number(body.parentId ?? 0)
    const parent = db.categories.find((item) => item.id === parentId)
    if (parent && (parent.productId !== product.id || parent.type !== type)) {
      return referenced('上级分类必须同产品同类型。')
    }
    const category: CategoryView = {
      id: mockId(),
      productId: product.id,
      branchId: Number(body.branchId ?? 0),
      parentId,
      type: type as CategoryView['type'],
      name: String(body.name ?? ''),
      owner: (body.owner as string | null) ?? null,
      sort: Number(body.sort ?? 0),
      createdBy: currentAccount()?.account ?? 'system',
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
    }
    db.categories.push(category)
    record('product', product.id, 'category-created', category.name)
    return ok(category)
  }),

  http.patch('*/api/v1/categories/:categoryId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['category-manage'])) {
      return forbidden('category-manage')
    }
    const category = db.categories.find((item) => item.id === Number(params.categoryId))
    if (!category || !requireProduct(category.productId)) {
      return notFound()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (!lockVersionOf(body, category.lockVersion)) {
      return lockConflict()
    }
    if (body.parentId !== undefined) {
      const parentId = Number(body.parentId)
      const parent = db.categories.find((item) => item.id === parentId)
      if (parentId !== 0 && (!parent || parent.productId !== category.productId || parent.type !== category.type)) {
        return referenced('上级分类必须同产品同类型。')
      }
      if (parentId === category.id) {
        return referenced('分类不能作为自身的上级。')
      }
      category.parentId = parentId
    }
    for (const key of ['name', 'owner', 'sort']) {
      if (key in body) {
        ;(category as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    category.lockVersion += 1
    category.updatedAt = new Date().toISOString()
    return ok(category)
  }),

  http.delete('*/api/v1/categories/:categoryId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['category-manage'])) {
      return forbidden('category-manage')
    }
    const category = db.categories.find((item) => item.id === Number(params.categoryId))
    if (!category || !requireProduct(category.productId)) {
      return notFound()
    }
    // 级联软删子树（§3.3）
    const doomed = new Set<number>([category.id])
    let grew = true
    while (grew) {
      grew = false
      for (const item of db.categories) {
        if (item.parentId !== undefined && doomed.has(item.parentId) && !doomed.has(item.id)) {
          doomed.add(item.id)
          grew = true
        }
      }
    }
    db.categories = db.categories.filter((item) => !doomed.has(item.id))
    record('product', category.productId, 'category-deleted', category.name)
    return ok(null)
  }),

  // ── 计划 ──
  http.get('*/api/v1/products/:productId/plans', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-view'])) {
      return forbidden('plan-view')
    }
    const product = requireProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    let items: PlanView[] = db.plans.filter(
      (plan) =>
        plan.productId === product.id &&
        matchIn(plan.status, filterParam(url, 'status')) &&
        matchValue(plan.branchId ?? 0, filterParam(url, 'branchId')) &&
        matchIn(plan.parentId ?? 0, filterParam(url, 'parentId')) &&
        matchValue(plan.closedReason, filterParam(url, 'closedReason')) &&
        matchRange(plan.beginDate, filterParam(url, 'beginDate')) &&
        matchRange(plan.endDate, filterParam(url, 'endDate')),
    )
    if (q) {
      items = items.filter((plan) => plan.title.toLowerCase().includes(q))
    }
    items = sortBy(
      items as unknown as Record<string, unknown>[],
      url.searchParams.get('sort'),
      (a, b) => Number(a.id) - Number(b.id),
    ) as unknown as PlanView[]
    return ok({ items, total: items.length })
  }),

  http.post('*/api/v1/products/:productId/plans', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-create'])) {
      return forbidden('plan-create')
    }
    const product = requireProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const body = (await request.json()) as Record<string, unknown>
    const parentId = Number(body.parentId ?? 0)
    if (parentId !== 0) {
      const parent = db.plans.find((plan) => plan.id === parentId)
      if (!parent || parent.productId !== product.id || (parent.parentId ?? 0) !== 0) {
        return validation('父计划必须是同产品的一级计划。', { parentId: 'invalid' })
      }
    }
    const plan: PlanView = {
      id: mockId(),
      productId: product.id,
      branchId: Number(body.branchId ?? 0),
      parentId,
      title: String(body.title ?? ''),
      status: 'wait',
      description: (body.description as string | null) ?? null,
      beginDate: (body.beginDate as string | null) ?? null,
      endDate: (body.endDate as string | null) ?? null,
      finishedAt: null,
      closedAt: null,
      closedReason: null,
      createdBy: currentAccount()?.account ?? 'system',
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
    }
    db.plans.push(plan)
    record('plan', plan.id, 'created')
    record('product', product.id, 'plan-created', plan.title)
    return ok(plan)
  }),

  http.get('*/api/v1/plans/:planId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-view'])) {
      return forbidden('plan-view')
    }
    const plan = db.plans.find((item) => item.id === Number(params.planId))
    if (!plan) {
      return notFound()
    }
    if (!requireProduct(plan.productId)) {
      return hidden()
    }
    return ok(plan)
  }),

  http.patch('*/api/v1/plans/:planId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-edit'])) {
      return forbidden('plan-edit')
    }
    const plan = db.plans.find((item) => item.id === Number(params.planId))
    if (!plan || !requireProduct(plan.productId)) {
      return notFound()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (!lockVersionOf(body, plan.lockVersion)) {
      return lockConflict()
    }
    if (body.parentId !== undefined && Number(body.parentId) !== 0) {
      const parent = db.plans.find((item) => item.id === Number(body.parentId))
      if (!parent || (parent.parentId ?? 0) !== 0 || parent.id === plan.id) {
        return validation('父计划必须是同产品的一级计划。', { parentId: 'invalid' })
      }
      plan.parentId = parent.id
    }
    for (const key of ['title', 'branchId', 'beginDate', 'endDate', 'description']) {
      if (key in body) {
        ;(plan as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    plan.lockVersion += 1
    plan.updatedAt = new Date().toISOString()
    record('plan', plan.id, 'edited')
    return ok(plan)
  }),

  http.post('*/api/v1/plans/:planId/start', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-start'])) {
      return forbidden('plan-start')
    }
    const plan = db.plans.find((item) => item.id === Number(params.planId))
    if (!plan || !requireProduct(plan.productId)) {
      return notFound()
    }
    if (plan.status !== 'wait') {
      return stateConflict('仅未开始的计划可开始。')
    }
    plan.status = 'doing'
    plan.lockVersion += 1
    record('plan', plan.id, 'started')
    rollupParent(plan)
    return ok(plan)
  }),

  http.post('*/api/v1/plans/:planId/finish', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-finish'])) {
      return forbidden('plan-finish')
    }
    const plan = db.plans.find((item) => item.id === Number(params.planId))
    if (!plan || !requireProduct(plan.productId)) {
      return notFound()
    }
    if (plan.status !== 'doing') {
      return stateConflict('仅进行中的计划可完成。')
    }
    plan.status = 'done'
    plan.finishedAt = new Date().toISOString()
    plan.lockVersion += 1
    record('plan', plan.id, 'finished')
    rollupParent(plan)
    return ok(plan)
  }),

  http.post('*/api/v1/plans/:planId/close', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-close'])) {
      return forbidden('plan-close')
    }
    const plan = db.plans.find((item) => item.id === Number(params.planId))
    if (!plan || !requireProduct(plan.productId)) {
      return notFound()
    }
    const body = (await request.json().catch(() => ({}))) as { closedReason?: string; comment?: string | null }
    if (body.closedReason !== 'done' && body.closedReason !== 'cancel') {
      return validation('closedReason 必填且取值 done|cancel。', { closedReason: 'required' })
    }
    if (plan.status === 'closed') {
      return stateConflict('计划已关闭。')
    }
    plan.status = 'closed'
    plan.closedReason = body.closedReason
    plan.closedAt = new Date().toISOString()
    if (body.closedReason === 'done') {
      plan.finishedAt = new Date().toISOString()
    }
    plan.lockVersion += 1
    record('plan', plan.id, 'closed', body.comment ?? null)
    rollupParent(plan)
    return ok(plan)
  }),

  http.post('*/api/v1/plans/:planId/activate', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-activate'])) {
      return forbidden('plan-activate')
    }
    const plan = db.plans.find((item) => item.id === Number(params.planId))
    if (!plan || !requireProduct(plan.productId)) {
      return notFound()
    }
    if (plan.status !== 'done' && plan.status !== 'closed') {
      return stateConflict('仅已完成/已关闭的计划可激活。')
    }
    plan.status = 'doing'
    plan.finishedAt = null
    plan.closedAt = null
    plan.closedReason = null
    plan.lockVersion += 1
    record('plan', plan.id, 'activated')
    rollupParent(plan)
    return ok(plan)
  }),

  http.delete('*/api/v1/plans/:planId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-delete'])) {
      return forbidden('plan-delete')
    }
    const plan = db.plans.find((item) => item.id === Number(params.planId))
    if (!plan || !requireProduct(plan.productId)) {
      return notFound()
    }
    // §5 delete 守卫：存在未删需求 planId 指向本计划 → 42203
    if (db.stories.some((story) => story.planId === plan.id)) {
      return referenced('存在未删除的需求关联本计划，不能删除。')
    }
    // 子计划脱钩（§5：detachChildren）
    for (const child of db.plans) {
      if (child.parentId === plan.id) {
        child.parentId = 0
      }
    }
    db.plans = db.plans.filter((item) => item.id !== plan.id)
    record('plan', plan.id, 'deleted', plan.title)
    return ok(null)
  }),

  http.get('*/api/v1/plans/:planId/stories', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-view'])) {
      return forbidden('plan-view')
    }
    const plan = db.plans.find((item) => item.id === Number(params.planId))
    if (!plan || !requireProduct(plan.productId)) {
      return notFound()
    }
    const url = new URL(request.url)
    let items = db.stories.filter((story) => story.planId === plan.id)
    const status = filterParam(url, 'status')
    const type = filterParam(url, 'type')
    items = items.filter((story) => matchIn(story.status, status) && matchIn(story.type, type))
    return ok(paginate(items, url))
  }),

  http.get('*/api/v1/plans/:planId/bugs', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-view'])) {
      return forbidden('plan-view')
    }
    const plan = db.plans.find((item) => item.id === Number(params.planId))
    if (!plan || !requireProduct(plan.productId)) {
      return notFound()
    }
    // P4 前 EmptyBugApi 占位：Bug 端点恒空（T-8）
    return ok(paginate([], new URL(request.url)))
  }),

  http.post('*/api/v1/plans/:planId/link', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-link'])) {
      return forbidden('plan-link')
    }
    const plan = db.plans.find((item) => item.id === Number(params.planId))
    if (!plan || !requireProduct(plan.productId)) {
      return notFound()
    }
    if (plan.status === 'closed') {
      return stateConflict('已关闭的计划不可关联对象。')
    }
    const body = (await request.json()) as { objectType: string; ids: number[] }
    if (body.objectType === 'story') {
      for (const id of body.ids) {
        const story = db.stories.find((item) => item.id === id)
        if (!story) {
          return notFound()
        }
        if (story.productId !== plan.productId) {
          return referenced('对象必须属于同产品。')
        }
      }
      for (const id of body.ids) {
        const story = db.stories.find((item) => item.id === id)
        if (story && story.planId !== plan.id) {
          story.planId = plan.id
          story.lockVersion += 1
          record('story', story.id, 'linked', plan.title)
        }
      }
    }
    record('plan', plan.id, 'linked')
    return ok(plan)
  }),

  http.post('*/api/v1/plans/:planId/unlink', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-link'])) {
      return forbidden('plan-link')
    }
    const plan = db.plans.find((item) => item.id === Number(params.planId))
    if (!plan || !requireProduct(plan.productId)) {
      return notFound()
    }
    const body = (await request.json()) as { objectType: string; ids: number[] }
    if (body.objectType === 'story') {
      for (const id of body.ids) {
        const story = db.stories.find((item) => item.id === id)
        if (story && story.planId === plan.id) {
          story.planId = null
          story.lockVersion += 1
          record('story', story.id, 'unlinked', plan.title)
        }
      }
    }
    record('plan', plan.id, 'unlinked')
    return ok(plan)
  }),

  http.get('*/api/v1/plans/:planId/activities', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['plan-view'])) {
      return forbidden('plan-view')
    }
    const plan = db.plans.find((item) => item.id === Number(params.planId))
    if (!plan || !requireProduct(plan.productId)) {
      return notFound()
    }
    return ok(activityPage('plan', plan.id, new URL(request.url)))
  }),

  // ── 发布 ──
  http.get('*/api/v1/products/:productId/releases', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['release-view'])) {
      return forbidden('release-view')
    }
    const product = requireProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    let items: ReleaseView[] = db.releases.filter(
      (release) =>
        release.productId === product.id &&
        matchIn(release.status, filterParam(url, 'status')) &&
        matchValue(release.branchId ?? 0, filterParam(url, 'branchId')) &&
        matchValue(release.buildId, filterParam(url, 'buildId')) &&
        matchRange(release.releaseDate, filterParam(url, 'releaseDate')),
    )
    if (q) {
      items = items.filter((release) => release.name.toLowerCase().includes(q))
    }
    items = sortBy(
      items as unknown as Record<string, unknown>[],
      url.searchParams.get('sort'),
      (a, b) => Number(b.id) - Number(a.id),
    ) as unknown as ReleaseView[]
    return ok(paginate(items, url))
  }),

  http.post('*/api/v1/products/:productId/releases', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['release-create'])) {
      return forbidden('release-create')
    }
    const product = requireProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const body = (await request.json()) as Record<string, unknown>
    const storyIds = (body.storyIds as number[] | undefined) ?? []
    for (const id of storyIds) {
      const story = db.stories.find((item) => item.id === id)
      if (!story) {
        return notFound()
      }
      if (story.productId !== product.id) {
        return referenced('需求必须属于同产品。')
      }
    }
    const release: ReleaseView = {
      id: mockId(),
      productId: product.id,
      branchId: Number(body.branchId ?? 0),
      buildId: body.buildId === undefined || body.buildId === null ? null : Number(body.buildId),
      projectId: Number(body.projectId ?? 0),
      name: String(body.name ?? ''),
      status: 'normal',
      releaseDate: String(body.releaseDate ?? ''),
      publishedAt: (body.publishedAt as string | null) ?? new Date().toISOString(),
      isMilestone: Boolean(body.isMilestone ?? false),
      storyIds,
      bugIds: (body.bugIds as number[] | undefined) ?? [],
      notifyAccounts: (body.notifyAccounts as string[] | undefined) ?? [],
      description: (body.description as string | null) ?? null,
      createdBy: currentAccount()?.account ?? 'system',
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
    }
    db.releases.push(release)
    // §4.4 创建副作用：story.stage → released + 需求侧 linked2release 动态流 + 通知
    for (const id of storyIds) {
      const story = db.stories.find((item) => item.id === id)
      if (story) {
        story.stage = 'released'
        story.lockVersion += 1
        record('story', story.id, 'linked2release', release.name)
      }
    }
    for (const account of release.notifyAccounts ?? []) {
      notify(account, 'story-created', 'release', release.id, release.name)
    }
    record('release', release.id, 'created')
    record('product', product.id, 'release-created', release.name)
    return ok(release)
  }),

  http.get('*/api/v1/releases/:releaseId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['release-view'])) {
      return forbidden('release-view')
    }
    const release = db.releases.find((item) => item.id === Number(params.releaseId))
    if (!release) {
      return notFound()
    }
    if (!requireProduct(release.productId)) {
      return hidden()
    }
    return ok(release)
  }),

  http.patch('*/api/v1/releases/:releaseId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['release-edit'])) {
      return forbidden('release-edit')
    }
    const release = db.releases.find((item) => item.id === Number(params.releaseId))
    if (!release || !requireProduct(release.productId)) {
      return notFound()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (!lockVersionOf(body, release.lockVersion)) {
      return lockConflict()
    }
    for (const key of [
      'name',
      'branchId',
      'buildId',
      'projectId',
      'releaseDate',
      'publishedAt',
      'isMilestone',
      'notifyAccounts',
      'description',
    ]) {
      if (key in body) {
        ;(release as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    release.lockVersion += 1
    release.updatedAt = new Date().toISOString()
    record('release', release.id, 'edited')
    return ok(release)
  }),

  http.post('*/api/v1/releases/:releaseId/terminate', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['release-terminate'])) {
      return forbidden('release-terminate')
    }
    const release = db.releases.find((item) => item.id === Number(params.releaseId))
    if (!release || !requireProduct(release.productId)) {
      return notFound()
    }
    if (release.status !== 'normal') {
      return stateConflict('该发布已停止维护。')
    }
    release.status = 'terminated'
    release.lockVersion += 1
    record('release', release.id, 'terminated')
    for (const account of release.notifyAccounts ?? []) {
      notify(account, 'story-changed', 'release', release.id, release.name)
    }
    return ok(release)
  }),

  http.delete('*/api/v1/releases/:releaseId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['release-delete'])) {
      return forbidden('release-delete')
    }
    const release = db.releases.find((item) => item.id === Number(params.releaseId))
    if (!release || !requireProduct(release.productId)) {
      return notFound()
    }
    db.releases = db.releases.filter((item) => item.id !== release.id)
    record('release', release.id, 'deleted', release.name)
    return ok(null)
  }),

  http.get('*/api/v1/releases/:releaseId/stories', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['release-view'])) {
      return forbidden('release-view')
    }
    const release = db.releases.find((item) => item.id === Number(params.releaseId))
    if (!release || !requireProduct(release.productId)) {
      return notFound()
    }
    const items = db.stories.filter((story) => (release.storyIds ?? []).includes(story.id))
    return ok(paginate(items, new URL(request.url)))
  }),

  http.get('*/api/v1/releases/:releaseId/bugs', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['release-view'])) {
      return forbidden('release-view')
    }
    const release = db.releases.find((item) => item.id === Number(params.releaseId))
    if (!release || !requireProduct(release.productId)) {
      return notFound()
    }
    return ok(paginate([], new URL(request.url)))
  }),

  http.post('*/api/v1/releases/:releaseId/link', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['release-link'])) {
      return forbidden('release-link')
    }
    const release = db.releases.find((item) => item.id === Number(params.releaseId))
    if (!release || !requireProduct(release.productId)) {
      return notFound()
    }
    const body = (await request.json()) as { objectType: string; ids: number[] }
    if (body.objectType === 'story') {
      for (const id of body.ids) {
        const story = db.stories.find((item) => item.id === id)
        if (!story) {
          return notFound()
        }
        if (story.productId !== release.productId) {
          return referenced('需求必须属于同产品。')
        }
      }
      const linked = new Set(release.storyIds ?? [])
      for (const id of body.ids) {
        if (!linked.has(id)) {
          linked.add(id)
          const story = db.stories.find((item) => item.id === id)
          if (story) {
            story.stage = 'released'
            story.lockVersion += 1
            record('story', story.id, 'linked2release', release.name)
          }
        }
      }
      release.storyIds = [...linked]
    }
    release.lockVersion += 1
    record('release', release.id, 'linked')
    return ok(release)
  }),

  http.post('*/api/v1/releases/:releaseId/unlink', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['release-link'])) {
      return forbidden('release-link')
    }
    const release = db.releases.find((item) => item.id === Number(params.releaseId))
    if (!release || !requireProduct(release.productId)) {
      return notFound()
    }
    const body = (await request.json()) as { objectType: string; ids: number[] }
    if (body.objectType === 'story') {
      release.storyIds = (release.storyIds ?? []).filter((id) => !body.ids.includes(id))
      for (const id of body.ids) {
        const story = db.stories.find((item) => item.id === id)
        if (story) {
          record('story', story.id, 'unlinked', release.name)
        }
      }
    }
    release.lockVersion += 1
    record('release', release.id, 'unlinked')
    return ok(release)
  }),

  http.get('*/api/v1/releases/:releaseId/activities', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['release-view'])) {
      return forbidden('release-view')
    }
    const release = db.releases.find((item) => item.id === Number(params.releaseId))
    if (!release || !requireProduct(release.productId)) {
      return notFound()
    }
    return ok(activityPage('release', release.id, new URL(request.url)))
  }),

  // ── 构建 ──
  http.get('*/api/v1/products/:productId/builds', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['build-view'])) {
      return forbidden('build-view')
    }
    const product = requireProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    let items: BuildView[] = db.builds.filter(
      (build) =>
        build.productId === product.id &&
        matchValue(build.branchId ?? 0, filterParam(url, 'branchId')) &&
        matchValue(build.builder, filterParam(url, 'builder')) &&
        matchRange(build.buildDate, filterParam(url, 'buildDate')),
    )
    if (q) {
      items = items.filter((build) => build.name.toLowerCase().includes(q))
    }
    items = sortBy(
      items as unknown as Record<string, unknown>[],
      url.searchParams.get('sort'),
      (a, b) => Number(b.id) - Number(a.id),
    ) as unknown as BuildView[]
    return ok(paginate(items, url))
  }),

  http.post('*/api/v1/products/:productId/builds', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['build-create'])) {
      return forbidden('build-create')
    }
    const product = requireProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const body = (await request.json()) as Record<string, unknown>
    const build: BuildView = {
      id: mockId(),
      productId: product.id,
      branchId: Number(body.branchId ?? 0),
      executionId: Number(body.executionId ?? 0),
      projectId: Number(body.projectId ?? 0),
      name: String(body.name ?? ''),
      scmPath: (body.scmPath as string | null) ?? null,
      filePath: (body.filePath as string | null) ?? null,
      buildDate: String(body.buildDate ?? new Date().toISOString().slice(0, 10)),
      builder: String(body.builder ?? currentAccount()?.account ?? 'admin'),
      storyIds: (body.storyIds as number[] | undefined) ?? [],
      bugIds: (body.bugIds as number[] | undefined) ?? [],
      description: (body.description as string | null) ?? null,
      createdBy: currentAccount()?.account ?? 'system',
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
    }
    db.builds.push(build)
    record('build', build.id, 'created')
    record('product', product.id, 'build-created', build.name)
    return ok(build)
  }),

  http.get('*/api/v1/builds/:buildId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['build-view'])) {
      return forbidden('build-view')
    }
    const build = db.builds.find((item) => item.id === Number(params.buildId))
    if (!build) {
      return notFound()
    }
    if (!requireProduct(build.productId)) {
      return hidden()
    }
    return ok(build)
  }),

  http.patch('*/api/v1/builds/:buildId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['build-edit'])) {
      return forbidden('build-edit')
    }
    const build = db.builds.find((item) => item.id === Number(params.buildId))
    if (!build || !requireProduct(build.productId)) {
      return notFound()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (!lockVersionOf(body, build.lockVersion)) {
      return lockConflict()
    }
    for (const key of ['name', 'branchId', 'scmPath', 'filePath', 'buildDate', 'builder', 'projectId', 'description']) {
      if (key in body) {
        ;(build as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    build.lockVersion += 1
    build.updatedAt = new Date().toISOString()
    record('build', build.id, 'edited')
    return ok(build)
  }),

  http.delete('*/api/v1/builds/:buildId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['build-delete'])) {
      return forbidden('build-delete')
    }
    const build = db.builds.find((item) => item.id === Number(params.buildId))
    if (!build || !requireProduct(build.productId)) {
      return notFound()
    }
    if (db.releases.some((release) => release.buildId === build.id)) {
      return referenced('构建已被发布引用，不能删除。')
    }
    db.builds = db.builds.filter((item) => item.id !== build.id)
    record('product', build.productId, 'build-deleted', build.name)
    return ok(null)
  }),

  http.get('*/api/v1/builds/:buildId/stories', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['build-view'])) {
      return forbidden('build-view')
    }
    const build = db.builds.find((item) => item.id === Number(params.buildId))
    if (!build || !requireProduct(build.productId)) {
      return notFound()
    }
    const items = db.stories.filter((story) => (build.storyIds ?? []).includes(story.id))
    return ok(paginate(items, new URL(request.url)))
  }),

  http.get('*/api/v1/builds/:buildId/bugs', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['build-view'])) {
      return forbidden('build-view')
    }
    const build = db.builds.find((item) => item.id === Number(params.buildId))
    if (!build || !requireProduct(build.productId)) {
      return notFound()
    }
    return ok(paginate([], new URL(request.url)))
  }),

  http.post('*/api/v1/builds/:buildId/link', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['build-link'])) {
      return forbidden('build-link')
    }
    const build = db.builds.find((item) => item.id === Number(params.buildId))
    if (!build || !requireProduct(build.productId)) {
      return notFound()
    }
    const body = (await request.json()) as { objectType: string; ids: number[] }
    if (body.objectType === 'story') {
      for (const id of body.ids) {
        const story = db.stories.find((item) => item.id === id)
        if (!story) {
          return notFound()
        }
        if (story.productId !== build.productId) {
          return referenced('需求必须属于同产品。')
        }
      }
      build.storyIds = [...new Set([...(build.storyIds ?? []), ...body.ids])]
    }
    build.lockVersion += 1
    record('build', build.id, 'linked')
    return ok(build)
  }),

  http.post('*/api/v1/builds/:buildId/unlink', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['build-link'])) {
      return forbidden('build-link')
    }
    const build = db.builds.find((item) => item.id === Number(params.buildId))
    if (!build || !requireProduct(build.productId)) {
      return notFound()
    }
    const body = (await request.json()) as { objectType: string; ids: number[] }
    if (body.objectType === 'story') {
      build.storyIds = (build.storyIds ?? []).filter((id) => !body.ids.includes(id))
    }
    build.lockVersion += 1
    record('build', build.id, 'unlinked')
    return ok(build)
  }),

  http.get('*/api/v1/builds/:buildId/activities', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['build-view'])) {
      return forbidden('build-view')
    }
    const build = db.builds.find((item) => item.id === Number(params.buildId))
    if (!build || !requireProduct(build.productId)) {
      return notFound()
    }
    return ok(activityPage('build', build.id, new URL(request.url)))
  }),
]

/** 父计划状态聚合（plan §4.3 四规则的最小实现）。 */
function rollupParent(plan: PlanView): void {
  if ((plan.parentId ?? 0) === 0) {
    return
  }
  const parent = db.plans.find((item) => item.id === plan.parentId)
  if (!parent) {
    return
  }
  const children = db.plans.filter((item) => item.parentId === parent.id)
  if (children.length === 0) {
    parent.status = 'wait'
    parent.parentId = 0
    return
  }
  const statuses = new Set(children.map((child) => child.status))
  if ([...statuses].every((status) => status === 'closed')) {
    parent.status = 'closed'
    parent.closedReason = 'done'
    parent.closedAt = new Date().toISOString()
    record('plan', parent.id, 'closedbychild')
    return
  }
  if (statuses.has('doing')) {
    parent.status = 'doing'
    record('plan', parent.id, 'activatedbychild')
    return
  }
  if (!statuses.has('wait')) {
    parent.status = 'done'
    parent.finishedAt = new Date().toISOString()
    record('plan', parent.id, 'finishedbychild')
  }
}
