import type { SuiteView } from '@zentao/api-client/generated/model/suiteView'
import type { SuiteViewType } from '@zentao/api-client/generated/model/suiteViewType'
import { HttpResponse, http } from 'msw'
import { currentAccount, db, error, FORBIDDEN, mockId, NOT_FOUND, privilegesOf, UNAUTHENTICATED } from './db'
import { visibleProduct } from './product-handlers'

/**
 * quality 域 MSW handlers（P4 · T-7）：Suite 6 端点 + Library 4 端点，逐一对齐
 * contract/openapi.yaml（quality §5）与领域卡 §3.3/§7（同表双端点面、private 行级、link 幂等）。
 * 库内用例 2 端点（`/libraries/{libraryId}/test-cases` GET/POST）已由 quality-handlers.ts 注册（T-5），
 * 本文件不重复注册——MSW 按数组顺序首匹配，重复即永不执行的死代码。
 */

const ok = (data: unknown) => HttpResponse.json({ data })
const unauthorized = () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })
const forbidden = (perm: string) => HttpResponse.json(FORBIDDEN(perm), { status: 403 })
/** 数据权限不可见 → 40302（同产品 ACL 语义，quality §7）。 */
const hidden = (message: string) => HttpResponse.json(error(40302, message), { status: 403 })
const validation = (message: string, fields?: Record<string, string>) =>
  HttpResponse.json(
    { error: { code: 42201, message, traceId: 'mock', ...(fields ? { fields } : {}) } },
    { status: 422 },
  )
const lockConflict = () => HttpResponse.json(error(40901, '数据已被他人修改，请刷新后重试。'), { status: 409 })
const conditionNotMet = (message: string) => HttpResponse.json(error(42203, message), { status: 422 })
const notFound = () => HttpResponse.json(NOT_FOUND, { status: 404 })

const S = {
  view: 'suite-view',
  create: 'suite-create',
  edit: 'suite-edit',
  link: 'suite-link-case',
  delete: 'suite-delete',
}
const L = { view: 'library-view', create: 'library-create', edit: 'library-edit', delete: 'library-delete' }

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

function isSuperAdmin(): boolean {
  return currentAccount()?.roleIds.includes(1) ?? false
}

function matchIn(value: unknown, filter: string | null): boolean {
  if (!filter) {
    return true
  }
  return filter.split(',').some((item) => item === String(value ?? ''))
}

function matchValue(value: unknown, filter: string | null): boolean {
  if (!filter) {
    return true
  }
  return String(value ?? '') === filter
}

function paginate<T>(items: T[], url: URL): { items: T[]; total: number } {
  const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  return { items: items.slice((page - 1) * limit, page * limit), total: items.length }
}

// ── 同表双面（§3.3：Library = type='library' 且 productId=0） ──

/** /suites 面的行：排除 library（§5「套件列表（type≠library）」）。 */
function suiteRow(suiteId: number): SuiteView | undefined {
  return db.suites.find((item) => item.id === suiteId && item.type !== 'library')
}

/** /libraries 面的行：只认 type=library（§3.3「library 仅经 /libraries 读写」）。 */
function libraryRow(libraryId: number): SuiteView | undefined {
  return db.suites.find((item) => item.id === libraryId && item.type === 'library')
}

/** 行级规则（§7）：public 产品内可见，private 仅创建者；超管不受限。 */
function canSeeSuite(row: SuiteView): boolean {
  const account = currentAccount()
  if (!account) {
    return false
  }
  if (isSuperAdmin()) {
    return true
  }
  return row.type !== 'private' || row.createdBy === account.account
}

/** caseIds 即 suite_case 关联（唯一存储）；列表面恒空数组，caseCount 为计算列。 */
function toView(row: SuiteView, withCaseIds: boolean): SuiteView {
  const caseIds = [...new Set(row.caseIds ?? [])]
  return { ...row, caseIds: withCaseIds ? caseIds : [], caseCount: caseIds.length }
}

const SUITE_TYPES = ['public', 'private'] as const

function validateName(name: string): string | null {
  if (name.trim().length === 0) {
    return 'name required'
  }
  return name.length > 255 ? 'name 最多 255 字。' : null
}

function validateType(type: unknown): string | null {
  return type === undefined || type === null || (SUITE_TYPES as readonly unknown[]).includes(type)
    ? null
    : 'type 仅 public|private。'
}

function validateSort(sort: unknown): string | null {
  if (sort === undefined || sort === null) {
    return null
  }
  return Number(sort) >= 0 ? null : 'sort ≥ 0。'
}

function createRow(productId: number, type: SuiteViewType, body: Record<string, unknown>): SuiteView {
  const row: SuiteView = {
    id: mockId(),
    productId,
    name: String(body.name ?? ''),
    description: body.description === undefined || body.description === null ? null : String(body.description),
    type,
    sort: Number(body.sort ?? 0),
    caseIds: [],
    caseCount: 0,
    createdBy: currentAccount()?.account ?? 'system',
    createdAt: new Date().toISOString(),
    updatedBy: null,
    updatedAt: null,
    lockVersion: 0,
  }
  db.suites.push(row)
  return row
}

/** PATCH 白名单（§5 updateSuite：name/description/type/sort；updateLibrary：name/description）。 */
function applyPatch(row: SuiteView, body: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of keys) {
    if (key in body) {
      ;(row as unknown as Record<string, unknown>)[key] = body[key]
    }
  }
  row.lockVersion += 1
  row.updatedBy = currentAccount()?.account ?? null
  row.updatedAt = new Date().toISOString()
}

// ── meta（与 backend QualityRegistrar 的 suite/library 注册同形：无状态机故 actions/statusVisuals 为空） ──

const SUITE_META = {
  domain: 'suite',
  fields: [
    { key: 'name', type: 'text', required: true, maxLength: 255, i18n: 'suite.field.name' },
    { key: 'description', type: 'richtext', i18n: 'suite.field.description' },
    {
      key: 'type',
      type: 'select',
      required: true,
      i18n: 'suite.field.type',
      options: [
        { value: 'public', i18n: 'suite.type.public' },
        { value: 'private', i18n: 'suite.type.private' },
      ],
    },
    { key: 'sort', type: 'number', i18n: 'suite.field.sort' },
  ],
  list: { defaultColumns: ['id', 'name', 'type', 'caseCount', 'createdBy'], defaultSort: '-id' },
  actions: [],
  statusVisuals: {},
}

const LIBRARY_META = {
  domain: 'library',
  fields: [
    { key: 'name', type: 'text', required: true, maxLength: 255, i18n: 'suite.field.name' },
    { key: 'description', type: 'richtext', i18n: 'suite.field.description' },
  ],
  list: { defaultColumns: ['id', 'name', 'caseCount', 'createdBy'], defaultSort: '-id' },
  actions: [],
  statusVisuals: {},
}

export const QUALITY_SUITE_META_BY_DOMAIN: Record<string, unknown> = {
  suite: SUITE_META,
  library: LIBRARY_META,
}

// ── handlers ──

export const qualitySuiteHandlers = [
  // ── Suite：产品面 6 端点（quality §5） ──

  http.get('*/api/v1/products/:productId/suites', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.view])) {
      return forbidden(S.view)
    }
    const productId = Number(params.productId)
    if (!visibleProduct(productId)) {
      return hidden('无权访问该产品。')
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const items = db.suites
      .filter((item) => item.type !== 'library' && item.productId === productId)
      .filter((item) => canSeeSuite(item)) // private 非创建者：列表 0 条（§7）
      .filter((item) => matchIn(item.type, url.searchParams.get('filters[type]')))
      .filter((item) => matchValue(item.createdBy, url.searchParams.get('filters[createdBy]')))
      .filter((item) => matchIn(item.id, url.searchParams.get('filters[id]')))
      .filter((item) => !q || item.name.toLowerCase().includes(q))
      .sort((a, b) => a.sort - b.sort || a.id - b.id)
    return ok(
      paginate(
        items.map((item) => toView(item, false)),
        url,
      ),
    )
  }),

  http.post('*/api/v1/products/:productId/suites', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.create])) {
      return forbidden(S.create)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden('无权访问该产品。')
    }
    const body = (await request.json()) as Record<string, unknown>
    const invalid = validateName(String(body.name ?? '')) ?? validateType(body.type) ?? validateSort(body.sort)
    if (invalid) {
      return validation(invalid, { name: 'required' })
    }
    const type: SuiteViewType = body.type === 'private' ? 'private' : 'public'
    return ok(toView(createRow(product.id, type, body), true))
  }),

  http.get('*/api/v1/suites/:suiteId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.view])) {
      return forbidden(S.view)
    }
    const row = suiteRow(Number(params.suiteId))
    if (!row) {
      return notFound()
    }
    if (!visibleProduct(row.productId) || !canSeeSuite(row)) {
      return hidden('无权访问该套件。')
    }
    return ok(toView(row, true))
  }),

  http.patch('*/api/v1/suites/:suiteId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.edit])) {
      return forbidden(S.edit)
    }
    const row = suiteRow(Number(params.suiteId))
    if (!row) {
      return notFound()
    }
    if (!visibleProduct(row.productId) || !canSeeSuite(row)) {
      return hidden('无权访问该套件。')
    }
    const body = (await request.json()) as Record<string, unknown>
    if (body.lockVersion !== undefined && body.lockVersion !== row.lockVersion) {
      return lockConflict()
    }
    const invalid =
      ('name' in body ? validateName(String(body.name ?? '')) : null) ??
      validateType(body.type) ??
      validateSort(body.sort)
    if (invalid) {
      return validation(invalid)
    }
    applyPatch(row, body, ['name', 'description', 'type', 'sort'])
    return ok(toView(row, true))
  }),

  // 软删套件（§5 DELETE）：suite_case 关联行连带失效。
  http.delete('*/api/v1/suites/:suiteId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.delete])) {
      return forbidden(S.delete)
    }
    const row = suiteRow(Number(params.suiteId))
    if (!row) {
      return notFound()
    }
    if (!visibleProduct(row.productId) || !canSeeSuite(row)) {
      return hidden('无权访问该套件。')
    }
    db.suites = db.suites.filter((item) => item.id !== row.id)
    return ok(null)
  }),

  http.post('*/api/v1/suites/:suiteId/link-cases', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.link])) {
      return forbidden(S.link)
    }
    const row = suiteRow(Number(params.suiteId))
    if (!row) {
      return notFound()
    }
    if (!visibleProduct(row.productId) || !canSeeSuite(row)) {
      return hidden('无权访问该套件。')
    }
    const body = (await request.json()) as { caseIds?: number[] }
    if (!Array.isArray(body.caseIds)) {
      return validation('caseIds 必填。', { caseIds: 'required' })
    }
    for (const caseId of body.caseIds) {
      const owned = db.testCases.find(
        (item) => item.id === caseId && item.productId === row.productId && item.libraryId === 0,
      )
      if (!owned) {
        return validation('仅可关联本产品用例。', { caseIds: 'invalid' })
      }
    }
    // UNIQUE(suite_id, case_id)：Set 去重 → 重复关联幂等，不新增行、不报错（§2）
    const linked = new Set(row.caseIds ?? [])
    const before = linked.size
    for (const caseId of body.caseIds) {
      linked.add(caseId)
    }
    if (linked.size !== before) {
      row.caseIds = [...linked]
      row.lockVersion += 1
      row.updatedAt = new Date().toISOString()
    }
    return ok(toView(row, true))
  }),

  http.post('*/api/v1/suites/:suiteId/unlink-cases', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.link])) {
      return forbidden(S.link)
    }
    const row = suiteRow(Number(params.suiteId))
    if (!row) {
      return notFound()
    }
    if (!visibleProduct(row.productId) || !canSeeSuite(row)) {
      return hidden('无权访问该套件。')
    }
    const body = (await request.json()) as { caseIds?: number[] }
    if (!Array.isArray(body.caseIds)) {
      return validation('caseIds 必填。', { caseIds: 'required' })
    }
    const remove = new Set(body.caseIds)
    const next = (row.caseIds ?? []).filter((caseId) => !remove.has(caseId))
    if (next.length !== (row.caseIds ?? []).length) {
      row.caseIds = next
      row.lockVersion += 1
      row.updatedAt = new Date().toISOString()
    }
    return ok(toView(row, true))
  }),

  // ── Library：同表另一端点面 4 端点（quality §5；读面无产品 ACL 过滤，§7） ──

  http.get('*/api/v1/libraries', ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([L.view])) {
      return forbidden(L.view)
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const items = db.suites
      .filter((item) => item.type === 'library' && item.productId === 0)
      .filter((item) => matchValue(item.createdBy, url.searchParams.get('filters[createdBy]')))
      .filter((item) => matchIn(item.id, url.searchParams.get('filters[id]')))
      .filter((item) => !q || item.name.toLowerCase().includes(q))
      .sort((a, b) => a.sort - b.sort || a.id - b.id)
    return ok(
      paginate(
        items.map((item) => toView(item, false)),
        url,
      ),
    )
  }),

  http.post('*/api/v1/libraries', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([L.create])) {
      return forbidden(L.create)
    }
    const body = (await request.json()) as Record<string, unknown>
    const invalid = validateName(String(body.name ?? ''))
    if (invalid) {
      return validation(invalid, { name: 'required' })
    }
    // 写入面强制 type=library / productId=0（§3.3），请求体不参与这两字段
    return ok(toView(createRow(0, 'library', body), true))
  }),

  http.get('*/api/v1/libraries/:libraryId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([L.view])) {
      return forbidden(L.view)
    }
    const row = libraryRow(Number(params.libraryId))
    if (!row) {
      return notFound()
    }
    return ok(toView(row, true))
  }),

  http.patch('*/api/v1/libraries/:libraryId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([L.edit])) {
      return forbidden(L.edit)
    }
    const row = libraryRow(Number(params.libraryId))
    if (!row) {
      return notFound()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (body.lockVersion !== undefined && body.lockVersion !== row.lockVersion) {
      return lockConflict()
    }
    const invalid = 'name' in body ? validateName(String(body.name ?? '')) : null
    if (invalid) {
      return validation(invalid)
    }
    applyPatch(row, body, ['name', 'description'])
    return ok(toView(row, true))
  }),

  // 软删用例库（§5 DELETE）：库内存在未删用例 → 42203。
  http.delete('*/api/v1/libraries/:libraryId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([L.delete])) {
      return forbidden(L.delete)
    }
    const row = libraryRow(Number(params.libraryId))
    if (!row) {
      return notFound()
    }
    if (db.testCases.some((item) => item.libraryId === row.id)) {
      return conditionNotMet('用例库内存在未删用例，无法删除。')
    }
    db.suites = db.suites.filter((item) => item.id !== row.id)
    return ok(null)
  }),
]
