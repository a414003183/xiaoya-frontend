import type { BugView } from '@zentao/api-client/generated/model/bugView'
import type { TestCaseView } from '@zentao/api-client/generated/model/testCaseView'
import { HttpResponse, http } from 'msw'
import type { StepInput } from '../features/quality/model'
import { currentAccount, db, error, FORBIDDEN, mockId, NOT_FOUND, privilegesOf, UNAUTHENTICATED } from './db'
import {
  BUG_CONFIRMED_OPTIONS,
  BUG_RESOLUTION_OPTIONS,
  BUG_SEVERITY_OPTIONS,
  BUG_STATUS_OPTIONS,
  BUG_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  TEST_CASE_RESULT_OPTIONS,
  TEST_CASE_STAGE_OPTIONS,
  TEST_CASE_STATUS_OPTIONS,
  TEST_CASE_TYPE_OPTIONS,
} from './meta-options'
import { hidden, notify, record, visibleProduct } from './product-handlers'

/** quality 域 MSW handlers（P4 · T-2/T-3/T-5）：Bug 12 端点 + TestCase 11 端点，逐一对齐 contract/openapi.yaml。 */

const ok = (data: unknown) => HttpResponse.json({ data })
const unauthorized = () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })
const forbidden = (perm: string) => HttpResponse.json(FORBIDDEN(perm), { status: 403 })
const validation = (message: string, fields?: Record<string, string>) =>
  HttpResponse.json(
    { error: { code: 42201, message, traceId: 'mock', ...(fields ? { fields } : {}) } },
    { status: 422 },
  )
const badRequest = (message: string) => HttpResponse.json(error(40001, message), { status: 400 })
const stateConflict = (message: string) => HttpResponse.json(error(42202, message), { status: 422 })
const lockConflict = () => HttpResponse.json(error(40901, '数据已被他人修改，请刷新后重试。'), { status: 409 })
const notFound = () => HttpResponse.json(NOT_FOUND, { status: 404 })

const B = {
  view: 'bug-view',
  create: 'bug-create',
  edit: 'bug-edit',
  confirm: 'bug-confirm',
  resolve: 'bug-resolve',
  activate: 'bug-activate',
  close: 'bug-close',
  assign: 'bug-assign',
  delete: 'bug-delete',
}
const C = {
  view: 'testcase-view',
  create: 'testcase-create',
  edit: 'testcase-edit',
  review: 'testcase-review',
  delete: 'testcase-delete',
}
const L = { view: 'library-view', edit: 'library-edit' }

function hasPerm(codes: string[]): boolean {
  const account = currentAccount()
  if (!account) {
    return false
  }
  if (account.groupIds.includes(1)) {
    return true
  }
  const owned = privilegesOf(account)
  return codes.some((code) => owned.includes(code))
}

/** Bug/用例可见性 = 所属产品可见性（quality §7）。 */
function findBug(bugId: number): BugView | undefined {
  const bug = db.bugs.find((item) => item.id === bugId)
  return bug && visibleProduct(bug.productId) ? bug : undefined
}

function findCase(caseId: number): TestCaseView | undefined {
  const item = db.testCases.find((candidate) => candidate.id === caseId)
  // 库用例（productId=0）免产品 ACL（quality §7 Library 面，与 GET 详情同口径）
  return item && (item.productId === 0 || visibleProduct(item.productId)) ? item : undefined
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
  if (filter === '@null') {
    return value === null || value === undefined
  }
  if (filter === '@notNull') {
    return value !== null && value !== undefined
  }
  return String(value ?? '') === filter
}

function paginate<T>(items: T[], url: URL): { items: T[]; total: number } {
  const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  return { items: items.slice((page - 1) * limit, page * limit), total: items.length }
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

// ── Bug 实体构造与校验（quality §3.1） ──

function createBug(productId: number, body: Record<string, unknown>): BugView {
  const bug: BugView = {
    id: mockId(),
    productId,
    branchId: Number(body.branchId ?? 0),
    categoryId: Number(body.categoryId ?? 0),
    projectId: 0,
    executionId: Number(body.executionId ?? 0),
    planId: body.planId === undefined || body.planId === null ? null : Number(body.planId),
    storyId: body.storyId === undefined || body.storyId === null ? null : Number(body.storyId),
    taskId: body.taskId === undefined || body.taskId === null ? null : Number(body.taskId),
    testCaseId: body.testCaseId === undefined || body.testCaseId === null ? null : Number(body.testCaseId),
    testRunId: body.testRunId === undefined || body.testRunId === null ? null : Number(body.testRunId),
    title: String(body.title ?? ''),
    keywords: (body.keywords as string | null) ?? null,
    severity: Number(body.severity ?? 3),
    priority: Number(body.priority ?? 3),
    type: (body.type as BugView['type']) ?? 'codeerror',
    os: (body.os as string | null) ?? null,
    browser: (body.browser as string | null) ?? null,
    steps: (body.steps as string | null) ?? null,
    openedBuilds: (body.openedBuilds as string | null) ?? null,
    status: 'active',
    confirmed: false,
    activatedCount: 0,
    deadline: (body.deadline as string | null) ?? null,
    assignee: (body.assignee as string | null) ?? null,
    assignedAt: body.assignee ? new Date().toISOString() : null,
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    resolvedBuild: null,
    duplicateOfId: null,
    relatedBugIds: (body.relatedBugIds as number[] | undefined) ?? [],
    notifyAccounts: (body.notifyAccounts as string[] | undefined) ?? [],
    closedBy: null,
    closedAt: null,
    createdBy: currentAccount()?.account ?? 'system',
    createdAt: new Date().toISOString(),
    updatedBy: null,
    updatedAt: null,
    lockVersion: 0,
  }
  db.bugs.push(bug)
  record('bug', bug.id, 'created')
  if (bug.assignee) {
    notify(bug.assignee, 'bug-created', 'bug', bug.id, bug.title)
  }
  return bug
}

const BUG_TYPES = [
  'codeerror',
  'config',
  'install',
  'security',
  'performance',
  'standard',
  'automation',
  'designdefect',
  'others',
]

function validateBugBody(body: Record<string, unknown>): string | null {
  const title = String(body.title ?? '').trim()
  if (title.length === 0) {
    return 'title required'
  }
  if (title.length > 255) {
    return 'title 最多 255 字。'
  }
  const severity = Number(body.severity ?? 3)
  if (severity < 1 || severity > 4) {
    return 'severity 取值 1–4。'
  }
  const priority = Number(body.priority ?? 3)
  if (priority < 1 || priority > 4) {
    return 'priority 取值 1–4。'
  }
  if (body.type !== undefined && !BUG_TYPES.includes(String(body.type))) {
    return 'type 非法。'
  }
  return null
}

/** PATCH 白名单（quality §5 updateBug）。 */
const BUG_PATCH_KEYS = [
  'title',
  'keywords',
  'severity',
  'priority',
  'type',
  'os',
  'browser',
  'steps',
  'openedBuilds',
  'categoryId',
  'executionId',
  'planId',
  'storyId',
  'taskId',
  'deadline',
  'relatedBugIds',
  'notifyAccounts',
] as const

// ── TestCase 实体构造与校验（quality §3.2） ──

const TEST_CASE_TYPES = ['unit', 'interface', 'feature', 'install', 'config', 'performance', 'security', 'other']
const TEST_CASE_STAGES = ['unittest', 'feature', 'intergrate', 'system', 'smoke', 'bvt']

function normalizeSteps(raw: unknown): StepInput[] {
  const steps = Array.isArray(raw) ? (raw as StepInput[]) : []
  return steps
    .filter((step) => String(step.description ?? '').trim().length > 0)
    .map((step, index) => ({
      sort: index + 1,
      description: String(step.description ?? ''),
      expects: step.expects == null ? null : String(step.expects),
    }))
}

function createTestCase(productId: number, libraryId: number, body: Record<string, unknown>): TestCaseView {
  const item: TestCaseView = {
    id: mockId(),
    productId,
    branchId: Number(body.branchId ?? 0),
    libraryId,
    categoryId: Number(body.categoryId ?? 0),
    storyId: body.storyId === undefined || body.storyId === null ? null : Number(body.storyId),
    title: String(body.title ?? ''),
    precondition: (body.precondition as string | null) ?? null,
    keywords: (body.keywords as string | null) ?? null,
    priority: Number(body.priority ?? 3),
    type: (body.type as TestCaseView['type']) ?? 'feature',
    stage: (body.stage as TestCaseView['stage']) ?? [],
    status: body.needReview === true ? 'wait' : 'normal',
    steps: normalizeSteps(body.steps),
    fromBugId: null,
    lastRunResult: null,
    lastRunner: null,
    lastRunAt: null,
    reviewers: [],
    reviewedAt: null,
    version: 1,
    createdBy: currentAccount()?.account ?? 'system',
    createdAt: new Date().toISOString(),
    updatedBy: null,
    updatedAt: null,
    lockVersion: 0,
  }
  db.testCases.push(item)
  record('testCase', item.id, 'created')
  return item
}

function validateCaseBody(body: Record<string, unknown>): string | null {
  const title = String(body.title ?? '').trim()
  if (title.length === 0) {
    return 'title required'
  }
  if (title.length > 255) {
    return 'title 最多 255 字。'
  }
  const priority = Number(body.priority ?? 3)
  if (priority < 1 || priority > 4) {
    return 'priority 取值 1–4。'
  }
  if (body.type !== undefined && !TEST_CASE_TYPES.includes(String(body.type))) {
    return 'type 非法。'
  }
  const stage = body.stage
  if (
    stage !== undefined &&
    (!Array.isArray(stage) || stage.some((item) => !TEST_CASE_STAGES.includes(String(item))))
  ) {
    return 'stage 非法。'
  }
  const steps = Array.isArray(body.steps) ? (body.steps as StepInput[]) : []
  if (steps.length > 100) {
    return 'steps 最多 100 条。'
  }
  for (const step of steps) {
    if (String(step.description ?? '').length > 2000 || String(step.expects ?? '').length > 2000) {
      return '步骤/预期单条最多 2000 字。'
    }
  }
  return null
}

// ── meta 目录（与 workflow bug.yml / test-case.yml 同源，03 §6） ──

export const BUG_META = {
  domain: 'bug',
  fields: [
    { key: 'title', type: 'text', required: true, maxLength: 255, i18n: 'bug.field.title' },
    { key: 'severity', type: 'select', required: true, i18n: 'bug.field.severity', options: BUG_SEVERITY_OPTIONS },
    { key: 'priority', type: 'select', required: true, i18n: 'common.priority', options: PRIORITY_OPTIONS },
    { key: 'type', type: 'select', required: true, i18n: 'bug.field.type', options: BUG_TYPE_OPTIONS },
    { key: 'status', type: 'select', i18n: 'bug.field.status', options: BUG_STATUS_OPTIONS },
    { key: 'resolution', type: 'select', i18n: 'bug.field.resolution', options: BUG_RESOLUTION_OPTIONS },
    { key: 'confirmed', type: 'select', i18n: 'bug.field.confirmed', options: BUG_CONFIRMED_OPTIONS },
    { key: 'os', type: 'select', i18n: 'bug.field.os' },
    { key: 'browser', type: 'select', i18n: 'bug.field.browser' },
    { key: 'steps', type: 'richtext', i18n: 'bug.field.steps' },
    { key: 'openedBuilds', type: 'text', maxLength: 255, i18n: 'bug.field.openedBuilds' },
    { key: 'categoryId', type: 'select', i18n: 'bug.field.category' },
    { key: 'planId', type: 'select', i18n: 'bug.field.plan' },
    { key: 'storyId', type: 'select', i18n: 'bug.field.story' },
    { key: 'assignee', type: 'select', source: 'accounts', i18n: 'bug.field.assignee' },
    { key: 'deadline', type: 'date', i18n: 'bug.field.deadline' },
    { key: 'keywords', type: 'text', maxLength: 255, i18n: 'bug.field.keywords' },
    { key: 'notifyAccounts', type: 'multiselect', source: 'accounts', i18n: 'bug.field.notify' },
  ],
  list: { defaultColumns: ['id', 'title', 'severity', 'priority', 'status', 'assignee'], defaultSort: '-id' },
  actions: [
    { code: 'bug-confirm', action: 'confirm', i18n: 'bug.action.confirm', allowedStatus: ['active'] },
    { code: 'bug-resolve', action: 'resolve', i18n: 'bug.action.resolve', allowedStatus: ['active'] },
    { code: 'bug-activate', action: 'activate', i18n: 'bug.action.activate', allowedStatus: ['resolved', 'closed'] },
    { code: 'bug-close', action: 'close', i18n: 'bug.action.close', allowedStatus: ['resolved'] },
    { code: 'bug-assign', action: 'assign', i18n: 'bug.action.assign', allowedStatus: ['active', 'resolved'] },
    { code: 'bug-edit', action: 'edit', i18n: 'common.action.edit', allowedStatus: ['active', 'resolved', 'closed'] },
  ],
  statusVisuals: {
    active: { tone: 'error', i18n: 'bug.status.active' },
    resolved: { tone: 'pending', i18n: 'bug.status.resolved' },
    closed: { tone: 'closed', i18n: 'bug.status.closed' },
  },
}

export const TEST_CASE_META = {
  domain: 'testCase',
  fields: [
    { key: 'title', type: 'text', required: true, maxLength: 255, i18n: 'testCase.field.title' },
    { key: 'priority', type: 'select', required: true, i18n: 'common.priority', options: PRIORITY_OPTIONS },
    { key: 'type', type: 'select', required: true, i18n: 'testCase.field.type', options: TEST_CASE_TYPE_OPTIONS },
    { key: 'stage', type: 'multiselect', i18n: 'testCase.field.stage', options: TEST_CASE_STAGE_OPTIONS },
    { key: 'status', type: 'select', i18n: 'testCase.field.status', options: TEST_CASE_STATUS_OPTIONS },
    {
      key: 'lastRunResult',
      type: 'select',
      i18n: 'testCase.field.lastRunResult',
      options: TEST_CASE_RESULT_OPTIONS,
    },
    { key: 'categoryId', type: 'select', i18n: 'testCase.field.category' },
    { key: 'storyId', type: 'select', i18n: 'testCase.field.story' },
    { key: 'precondition', type: 'textarea', i18n: 'testCase.field.precondition' },
    { key: 'keywords', type: 'text', maxLength: 255, i18n: 'testCase.field.keywords' },
    { key: 'needReview', type: 'bool', i18n: 'testCase.field.needReview' },
  ],
  list: { defaultColumns: ['id', 'title', 'priority', 'status', 'type'], defaultSort: '-id' },
  actions: [
    { code: 'testcase-review', action: 'review', i18n: 'testCase.action.review', allowedStatus: ['wait'] },
    {
      code: 'testcase-edit',
      action: 'edit',
      i18n: 'common.action.edit',
      allowedStatus: ['wait', 'normal', 'blocked', 'investigate'],
    },
  ],
  statusVisuals: {
    wait: { tone: 'pending', i18n: 'testCase.status.wait' },
    normal: { tone: 'active', i18n: 'testCase.status.normal' },
    blocked: { tone: 'warning', i18n: 'testCase.status.blocked' },
    investigate: { tone: 'neutral', i18n: 'testCase.status.investigate' },
  },
}

export const QUALITY_META_BY_DOMAIN: Record<string, unknown> = {
  bug: BUG_META,
  testCase: TEST_CASE_META,
}

// ── handlers ──

export const qualityHandlers = [
  // ── Bug：产品面（quality §5） ──

  http.get('*/api/v1/products/:productId/bugs', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.view])) {
      return forbidden(B.view)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.bugs.filter(
      (bug) =>
        bug.productId === product.id &&
        matchIn(bug.status, url.searchParams.get('filters[status]')) &&
        matchIn(bug.severity, url.searchParams.get('filters[severity]')) &&
        matchIn(bug.priority, url.searchParams.get('filters[priority]')) &&
        matchIn(bug.type, url.searchParams.get('filters[type]')) &&
        matchIn(bug.resolution, url.searchParams.get('filters[resolution]')) &&
        matchIn(bug.id, url.searchParams.get('filters[id]')) &&
        // filters[confirmed] 取值 1/0（契约「1/0」，DB 列同口径）——bool 落 1/0 再比。
        matchValue(bug.confirmed ? 1 : 0, url.searchParams.get('filters[confirmed]')) &&
        matchValue(bug.assignee, url.searchParams.get('filters[assignee]')) &&
        matchValue(bug.executionId, url.searchParams.get('filters[executionId]')) &&
        matchValue(bug.categoryId, url.searchParams.get('filters[categoryId]')) &&
        matchValue(bug.createdBy, url.searchParams.get('filters[createdBy]')),
    )
    if (q) {
      items = items.filter((bug) => `${bug.title}${bug.keywords ?? ''}`.toLowerCase().includes(q))
    }
    return ok(paginate(items, url))
  }),

  http.post('*/api/v1/products/:productId/bugs', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.create])) {
      return forbidden(B.create)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const body = (await request.json()) as Record<string, unknown>
    const invalid = validateBugBody(body)
    if (invalid) {
      return validation(invalid, { title: 'required' })
    }
    return ok(createBug(product.id, body))
  }),

  http.post('*/api/v1/products/:productId/bugs/batch', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.create])) {
      return forbidden(B.create)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const body = (await request.json()) as { items: Record<string, unknown>[] }
    if (body.items.length > 50) {
      return validation('批量创建上限 50 条。')
    }
    const results = body.items.map((item, index) => {
      const invalid = validateBugBody(item)
      if (invalid) {
        return { index, ok: false, id: null, error: invalid }
      }
      const bug = createBug(product.id, item)
      return { index, ok: true, id: bug.id, error: null }
    })
    return ok({ results })
  }),

  // ── Bug：单体读改（quality §5） ──

  http.get('*/api/v1/bugs/:bugId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.view])) {
      return forbidden(B.view)
    }
    const bug = db.bugs.find((item) => item.id === Number(params.bugId))
    if (!bug) {
      return notFound()
    }
    if (!visibleProduct(bug.productId)) {
      return hidden()
    }
    return ok(bug)
  }),

  http.patch('*/api/v1/bugs/:bugId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.edit])) {
      return forbidden(B.edit)
    }
    const bug = findBug(Number(params.bugId))
    if (!bug) {
      return notFound()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (body.lockVersion !== undefined && body.lockVersion !== bug.lockVersion) {
      return lockConflict()
    }
    const invalid = validateBugBody({ ...body, title: body.title ?? bug.title })
    if (invalid) {
      return validation(invalid)
    }
    for (const key of BUG_PATCH_KEYS) {
      if (key in body) {
        ;(bug as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    bug.lockVersion += 1
    bug.updatedAt = new Date().toISOString()
    record('bug', bug.id, 'edited')
    return ok(bug)
  }),

  // 软删（§5 DELETE，A-07）：叶子对象直接删，删后详情 40401。
  http.delete('*/api/v1/bugs/:bugId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.delete])) {
      return forbidden(B.delete)
    }
    const bug = findBug(Number(params.bugId))
    if (!bug) {
      return notFound()
    }
    db.bugs = db.bugs.filter((item) => item.id !== bug.id)
    record('bug', bug.id, 'deleted')
    return ok(null)
  }),

  // ── Bug：五动作 + 批量 + 动态流（quality §4.1） ──

  http.post('*/api/v1/bugs/:bugId/confirm', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.confirm])) {
      return forbidden(B.confirm)
    }
    const bug = findBug(Number(params.bugId))
    if (!bug) {
      return notFound()
    }
    if (bug.status !== 'active') {
      return stateConflict('仅激活状态可确认。')
    }
    if (bug.confirmed) {
      return stateConflict('已确认的 Bug 不可重复确认。')
    }
    const body = (await request.json().catch(() => ({}))) as { assignee?: string | null; comment?: string | null }
    bug.confirmed = true
    if (body.assignee) {
      bug.assignee = body.assignee
      bug.assignedAt = new Date().toISOString()
      notify(body.assignee, 'task-assigned', 'bug', bug.id, bug.title)
    }
    bug.lockVersion += 1
    record('bug', bug.id, 'confirmed', body.comment ?? null)
    return ok(bug)
  }),

  http.post('*/api/v1/bugs/:bugId/resolve', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.resolve])) {
      return forbidden(B.resolve)
    }
    const bug = findBug(Number(params.bugId))
    if (!bug) {
      return notFound()
    }
    if (bug.status !== 'active') {
      return stateConflict('仅激活状态可解决。')
    }
    const body = (await request.json().catch(() => ({}))) as {
      resolution?: string
      resolvedBuild?: string | null
      duplicateOfId?: number | null
      assignee?: string | null
      comment?: string | null
    }
    const allowed = ['bydesign', 'duplicate', 'external', 'fixed', 'notrepro', 'postponed', 'willnotfix', 'tostory']
    if (!body.resolution || !allowed.includes(body.resolution)) {
      return validation('resolution 必填。', { resolution: 'required' })
    }
    if (body.resolution === 'duplicate') {
      const target = body.duplicateOfId == null ? undefined : db.bugs.find((item) => item.id === body.duplicateOfId)
      if (!target || target.productId !== bug.productId) {
        return validation('解决方式为重复时必须选择同产品未删 Bug。', { duplicateOfId: 'required' })
      }
    }
    if (body.resolution === 'fixed' && !(body.resolvedBuild ?? '').trim()) {
      return validation('解决方式为已解决时必须填写解决版本。', { resolvedBuild: 'required' })
    }
    bug.status = 'resolved'
    bug.resolution = body.resolution as NonNullable<BugView['resolution']>
    bug.resolvedBuild = body.resolvedBuild ?? null
    bug.duplicateOfId = body.duplicateOfId ?? null
    bug.resolvedBy = currentAccount()?.account ?? null
    bug.resolvedAt = new Date().toISOString()
    if (body.assignee) {
      bug.assignee = body.assignee
      bug.assignedAt = new Date().toISOString()
    }
    bug.lockVersion += 1
    record('bug', bug.id, 'resolved', body.comment ?? null)
    if (bug.createdBy) {
      notify(bug.createdBy, 'bug-resolved', 'bug', bug.id, bug.title)
    }
    return ok(bug)
  }),

  http.post('*/api/v1/bugs/:bugId/activate', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.activate])) {
      return forbidden(B.activate)
    }
    const bug = findBug(Number(params.bugId))
    if (!bug) {
      return notFound()
    }
    if (bug.status !== 'resolved' && bug.status !== 'closed') {
      return stateConflict('仅已解决/已关闭状态可重开。')
    }
    const body = (await request.json().catch(() => ({}))) as {
      openedBuilds?: string
      assignee?: string | null
      comment?: string | null
    }
    if (!body.openedBuilds || body.openedBuilds.trim().length === 0) {
      return validation('重开必须填写影响版本。', { openedBuilds: 'required' })
    }
    bug.status = 'active'
    bug.openedBuilds = body.openedBuilds
    bug.activatedCount += 1
    bug.resolution = null
    bug.resolvedBy = null
    bug.resolvedAt = null
    bug.resolvedBuild = null
    bug.closedBy = null
    bug.closedAt = null
    bug.assignee = body.assignee ?? bug.resolvedBy // 缺省回派原解决人（quality §4.1）
    bug.assignedAt = new Date().toISOString()
    bug.lockVersion += 1
    record('bug', bug.id, 'activated', body.comment ?? null)
    if (bug.assignee) {
      notify(bug.assignee, 'bug-created', 'bug', bug.id, bug.title)
    }
    return ok(bug)
  }),

  http.post('*/api/v1/bugs/:bugId/close', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.close])) {
      return forbidden(B.close)
    }
    const bug = findBug(Number(params.bugId))
    if (!bug) {
      return notFound()
    }
    if (bug.status !== 'resolved') {
      return stateConflict('仅已解决状态可关闭。')
    }
    const body = (await request.json().catch(() => ({}))) as { comment?: string | null }
    bug.status = 'closed'
    bug.closedBy = currentAccount()?.account ?? null
    bug.closedAt = new Date().toISOString()
    bug.lockVersion += 1
    record('bug', bug.id, 'closed', body.comment ?? null)
    if (bug.createdBy) {
      notify(bug.createdBy, 'bug-resolved', 'bug', bug.id, bug.title)
    }
    return ok(bug)
  }),

  http.post('*/api/v1/bugs/:bugId/assign', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.assign])) {
      return forbidden(B.assign)
    }
    const bug = findBug(Number(params.bugId))
    if (!bug) {
      return notFound()
    }
    if (bug.status === 'closed') {
      return stateConflict('已关闭的 Bug 不可指派。')
    }
    const body = (await request.json().catch(() => ({}))) as { assignee?: string; comment?: string | null }
    if (!body.assignee) {
      return validation('assignee 必填。', { assignee: 'required' })
    }
    bug.assignee = body.assignee
    bug.assignedAt = new Date().toISOString()
    bug.lockVersion += 1
    record('bug', bug.id, 'assigned', body.comment ?? null)
    notify(body.assignee, 'task-assigned', 'bug', bug.id, bug.title)
    return ok(bug)
  }),

  http.post('*/api/v1/bugs/batch', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    const body = (await request.json()) as { ids: number[]; action: string; params?: Record<string, unknown> }
    const perm =
      body.action === 'confirm'
        ? B.confirm
        : body.action === 'resolve'
          ? B.resolve
          : body.action === 'activate'
            ? B.activate
            : body.action === 'close'
              ? B.close
              : body.action === 'assign'
                ? B.assign
                : B.edit
    if (!hasPerm([perm])) {
      return forbidden(perm)
    }
    const items = (body.params?.rows as { id: number }[] | undefined) ?? []
    const results = body.ids.map((id) => {
      const bug = findBug(id)
      if (!bug) {
        return { id, ok: false, error: '40301' }
      }
      if (body.action === 'confirm') {
        if (bug.status !== 'active' || bug.confirmed) {
          return { id, ok: false, error: '42202' }
        }
        bug.confirmed = true
        const assignee = body.params?.assignee
        if (typeof assignee === 'string' && assignee.length > 0) {
          bug.assignee = assignee
          bug.assignedAt = new Date().toISOString()
        }
        record('bug', id, 'confirmed')
      } else if (body.action === 'resolve') {
        const resolution = String(body.params?.resolution ?? '')
        if (bug.status !== 'active') {
          return { id, ok: false, error: '42202' }
        }
        if (!resolution) {
          return { id, ok: false, error: '42201' }
        }
        if (resolution === 'fixed' && !String(body.params?.resolvedBuild ?? '').trim()) {
          return { id, ok: false, error: '42201' }
        }
        bug.status = 'resolved'
        bug.resolution = resolution as NonNullable<BugView['resolution']>
        bug.resolvedBuild = (body.params?.resolvedBuild as string | undefined) ?? null
        bug.duplicateOfId = (body.params?.duplicateOfId as number | undefined) ?? null
        bug.resolvedBy = currentAccount()?.account ?? null
        bug.resolvedAt = new Date().toISOString()
        record('bug', id, 'resolved')
      } else if (body.action === 'activate') {
        if (bug.status !== 'resolved' && bug.status !== 'closed') {
          return { id, ok: false, error: '42202' }
        }
        const openedBuilds = String(body.params?.openedBuilds ?? '')
        if (openedBuilds.trim().length === 0) {
          return { id, ok: false, error: '42201' }
        }
        bug.status = 'active'
        bug.openedBuilds = openedBuilds
        bug.activatedCount += 1
        bug.resolution = null
        bug.resolvedBy = null
        bug.resolvedAt = null
        bug.resolvedBuild = null
        bug.assignee = (body.params?.assignee as string | undefined) ?? bug.resolvedBy
        record('bug', id, 'activated')
      } else if (body.action === 'close') {
        if (bug.status !== 'resolved') {
          return { id, ok: false, error: '42202' }
        }
        bug.status = 'closed'
        bug.closedBy = currentAccount()?.account ?? null
        bug.closedAt = new Date().toISOString()
        record('bug', id, 'closed')
      } else if (body.action === 'assign') {
        const assignee = body.params?.assignee
        if (bug.status === 'closed') {
          return { id, ok: false, error: '42202' }
        }
        if (typeof assignee !== 'string' || assignee.length === 0) {
          return { id, ok: false, error: '42201' }
        }
        bug.assignee = assignee
        bug.assignedAt = new Date().toISOString()
        record('bug', id, 'assigned')
      } else {
        // A-03 定案：edit 走 params.rows=[{id,lockVersion,…}] 逐行乐观锁，缺/不符 lockVersion → 40901 计入该行
        const patch = items.find((item) => item.id === id) as Record<string, unknown> | undefined
        if (!patch || patch.lockVersion === undefined || patch.lockVersion !== bug.lockVersion) {
          return { id, ok: false, error: '40901' }
        }
        for (const key of BUG_PATCH_KEYS) {
          if (key in patch) {
            ;(bug as unknown as Record<string, unknown>)[key] = patch[key]
          }
        }
        bug.updatedAt = new Date().toISOString()
        record('bug', id, 'edited')
      }
      bug.lockVersion += 1
      return { id, ok: true, error: null }
    })
    return ok({ results })
  }),

  http.get('*/api/v1/bugs/:bugId/activities', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.view])) {
      return forbidden(B.view)
    }
    const bug = findBug(Number(params.bugId))
    if (!bug) {
      return notFound()
    }
    return ok(activityPage('bug', bug.id, new URL(request.url)))
  }),

  // ── TestCase：产品面（quality §5） ──

  http.get('*/api/v1/products/:productId/test-cases', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([C.view])) {
      return forbidden(C.view)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.testCases.filter(
      (item) =>
        item.productId === product.id &&
        item.libraryId === 0 &&
        matchIn(item.status, url.searchParams.get('filters[status]')) &&
        matchIn(item.priority, url.searchParams.get('filters[priority]')) &&
        matchIn(item.type, url.searchParams.get('filters[type]')) &&
        matchIn(item.id, url.searchParams.get('filters[id]')) &&
        matchValue(item.categoryId, url.searchParams.get('filters[categoryId]')) &&
        matchValue(item.storyId, url.searchParams.get('filters[storyId]')) &&
        matchValue(item.lastRunResult, url.searchParams.get('filters[lastRunResult]')) &&
        matchValue(item.createdBy, url.searchParams.get('filters[createdBy]')),
    )
    const stage = url.searchParams.get('filters[stage]')
    if (stage) {
      const wanted = new Set(stage.split(','))
      items = items.filter((item) => (item.stage ?? []).some((entry) => wanted.has(entry)))
    }
    if (q) {
      items = items.filter((item) => `${item.title}${item.keywords ?? ''}`.toLowerCase().includes(q))
    }
    return ok(paginate(items, url))
  }),

  http.post('*/api/v1/products/:productId/test-cases', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([C.create])) {
      return forbidden(C.create)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const body = (await request.json()) as Record<string, unknown>
    const invalid = validateCaseBody(body)
    if (invalid) {
      return validation(invalid, { title: 'required' })
    }
    return ok(createTestCase(product.id, 0, body))
  }),

  http.post('*/api/v1/products/:productId/test-cases/batch', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([C.create])) {
      return forbidden(C.create)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const body = (await request.json()) as { items: Record<string, unknown>[] }
    if (body.items.length > 50) {
      return validation('批量创建上限 50 条。')
    }
    const results = body.items.map((item, index) => {
      const invalid = validateCaseBody(item)
      if (invalid) {
        return { index, ok: false, id: null, error: invalid }
      }
      const created = createTestCase(product.id, 0, item)
      return { index, ok: true, id: created.id, error: null }
    })
    return ok({ results })
  }),

  // ── TestCase：单体读改 + 评审（quality §4.2） ──

  http.get('*/api/v1/test-cases/:caseId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([C.view])) {
      return forbidden(C.view)
    }
    const item = db.testCases.find((candidate) => candidate.id === Number(params.caseId))
    if (!item) {
      return notFound()
    }
    if (item.productId !== 0 && !visibleProduct(item.productId)) {
      return hidden()
    }
    return ok(item)
  }),

  http.patch('*/api/v1/test-cases/:caseId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([C.edit])) {
      return forbidden(C.edit)
    }
    const item = findCase(Number(params.caseId))
    if (!item) {
      return notFound()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (body.lockVersion !== undefined && body.lockVersion !== item.lockVersion) {
      return lockConflict()
    }
    // 03 §1 唯一例外：status 仅 normal|blocked|investigate 互转（quality §4.2）
    if (body.status !== undefined) {
      const allowed = ['normal', 'blocked', 'investigate']
      if (!allowed.includes(String(body.status)) || item.status === 'wait') {
        return badRequest('status 仅允许 normal/blocked/investigate 互转，wait 进出只经评审。')
      }
    }
    const invalid = validateCaseBody({ ...body, title: body.title ?? item.title })
    if (invalid) {
      return validation(invalid)
    }
    for (const key of ['title', 'precondition', 'keywords', 'priority', 'type', 'stage', 'categoryId', 'storyId']) {
      if (key in body) {
        ;(item as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    if ('status' in body) {
      item.status = body.status as TestCaseView['status']
    }
    if ('steps' in body) {
      item.steps = normalizeSteps(body.steps) // 整体替换（quality §4.2）
    }
    item.lockVersion += 1
    item.updatedAt = new Date().toISOString()
    record('testCase', item.id, 'edited')
    return ok(item)
  }),

  // 软删（§5 DELETE）：历史执行结果行保留（mock 仅移除用例本体）。
  http.delete('*/api/v1/test-cases/:caseId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([C.delete])) {
      return forbidden(C.delete)
    }
    const item = findCase(Number(params.caseId))
    if (!item) {
      return notFound()
    }
    db.testCases = db.testCases.filter((candidate) => candidate.id !== item.id)
    record('testCase', item.id, 'deleted')
    return ok(null)
  }),

  http.post('*/api/v1/test-cases/:caseId/review', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([C.review])) {
      return forbidden(C.review)
    }
    const item = findCase(Number(params.caseId))
    if (!item) {
      return notFound()
    }
    if (item.status !== 'wait') {
      return stateConflict('仅待评审状态可评审。')
    }
    const body = (await request.json().catch(() => ({}))) as { result?: string; comment?: string | null }
    if (body.result !== 'pass' && body.result !== 'clarify') {
      return validation('result 必填 pass|clarify。', { result: 'required' })
    }
    const actor = currentAccount()?.account ?? 'system'
    if (body.result === 'pass') {
      item.status = 'normal'
      item.reviewers = [...new Set([...(item.reviewers ?? []), actor])]
      item.reviewedAt = new Date().toISOString()
    }
    item.lockVersion += 1
    record('testCase', item.id, 'reviewed', body.comment ?? null)
    if (item.createdBy) {
      notify(item.createdBy, 'story-changed', 'testCase', item.id, item.title)
    }
    return ok(item)
  }),

  http.post('*/api/v1/test-cases/batch', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    const body = (await request.json()) as { ids: number[]; action: string; params?: Record<string, unknown> }
    const perm = body.action === 'review' ? C.review : C.edit
    if (!hasPerm([perm])) {
      return forbidden(perm)
    }
    const results = body.ids.map((id) => {
      const item = findCase(id)
      if (!item) {
        return { id, ok: false, error: '40301' }
      }
      if (body.action === 'review') {
        const result = String(body.params?.result ?? 'pass')
        if (item.status !== 'wait') {
          return { id, ok: false, error: '42202' }
        }
        if (result === 'pass') {
          item.status = 'normal'
          item.reviewers = [...new Set([...(item.reviewers ?? []), currentAccount()?.account ?? 'system'])]
          item.reviewedAt = new Date().toISOString()
        }
        record('testCase', id, 'reviewed')
      } else {
        // A-03 定案：edit 走 params.rows=[{id,lockVersion,…}] 逐行乐观锁，缺/不符 lockVersion → 40901 计入该行
        const rows = (body.params?.rows as Record<string, unknown>[] | undefined) ?? []
        const row = rows.find((entry) => entry.id === id)
        if (!row || row.lockVersion === undefined || row.lockVersion !== item.lockVersion) {
          return { id, ok: false, error: '40901' }
        }
        for (const key of ['title', 'precondition', 'keywords', 'priority', 'type', 'stage', 'categoryId', 'storyId']) {
          if (key in row) {
            ;(item as unknown as Record<string, unknown>)[key] = row[key]
          }
        }
        record('testCase', id, 'edited')
      }
      item.lockVersion += 1
      return { id, ok: true, error: null }
    })
    return ok({ results })
  }),

  http.get('*/api/v1/test-cases/:caseId/activities', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([C.view])) {
      return forbidden(C.view)
    }
    const item = findCase(Number(params.caseId))
    if (!item) {
      return notFound()
    }
    return ok(activityPage('testCase', item.id, new URL(request.url)))
  }),

  // ── TestCase：用例库导入 + 库内两面（quality §5） ──

  http.post('*/api/v1/products/:productId/test-cases/import-from-library', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([C.create])) {
      return forbidden(C.create)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const body = (await request.json()) as { libraryId?: number; caseIds?: number[] }
    if (!body.libraryId || !Array.isArray(body.caseIds) || body.caseIds.length === 0) {
      return validation('libraryId 与 caseIds 必填。')
    }
    const actor = currentAccount()?.account ?? 'system'
    let importedCount = 0
    for (const caseId of body.caseIds) {
      const source = db.testCases.find((item) => item.id === caseId && item.libraryId === body.libraryId)
      if (!source) {
        continue
      }
      // 复制为产品用例且 libraryId=0（quality §8）
      const copy: TestCaseView = {
        ...source,
        id: mockId(),
        productId: product.id,
        libraryId: 0,
        status: 'normal',
        steps: source.steps.map((step, index) => ({ ...step, sort: index + 1 })),
        reviewers: [],
        reviewedAt: null,
        createdBy: actor,
        createdAt: new Date().toISOString(),
        updatedBy: null,
        updatedAt: null,
        lockVersion: 0,
      }
      db.testCases.push(copy)
      record('testCase', copy.id, 'created')
      importedCount += 1
    }
    return ok({ importedCount })
  }),

  http.get('*/api/v1/libraries/:libraryId/test-cases', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([L.view])) {
      return forbidden(L.view)
    }
    const url = new URL(request.url)
    const libraryId = Number(params.libraryId)
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.testCases.filter(
      (item) =>
        item.productId === 0 &&
        item.libraryId === libraryId &&
        matchIn(item.status, url.searchParams.get('filters[status]')) &&
        matchIn(item.priority, url.searchParams.get('filters[priority]')) &&
        matchIn(item.type, url.searchParams.get('filters[type]')) &&
        matchIn(item.id, url.searchParams.get('filters[id]')),
    )
    if (q) {
      items = items.filter((item) => `${item.title}${item.keywords ?? ''}`.toLowerCase().includes(q))
    }
    return ok(paginate(items, url))
  }),

  http.post('*/api/v1/libraries/:libraryId/test-cases', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([L.edit])) {
      return forbidden(L.edit)
    }
    const libraryId = Number(params.libraryId)
    const body = (await request.json()) as Record<string, unknown>
    const invalid = validateCaseBody(body)
    if (invalid) {
      return validation(invalid, { title: 'required' })
    }
    return ok(createTestCase(0, libraryId, body))
  }),
]
