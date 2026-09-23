/**
 * quality 域第三批 MSW handlers（P4 · T-9/T-10）：TestRun 14 端点 + Report 4 端点，共 18 条。
 * 与 contract/openapi.yaml（quality §5）逐条对齐，状态机守卫同 backend workflow/test-run.yml（§4.3）与
 * backend TestRunHandlers/RecordResultHandler/ReportHandlers：
 *   start 仅 wait（落 realBeganAt）；block 仅 wait|doing；activate 仅 blocked|done；
 *   close 仅 wait|doing|blocked 且 realFinishedAt 必填、≥ beginDate、≤ 次日（否则 42201）；
 *   record-result 仅 doing（否则 42202），按 (testRunId, testCaseId) 幂等 upsert 同行覆写并同步 test_case.lastRun 三字段。
 * 数据权限（§7）：TestRun 随产品可见性（与同域 Bug/用例列表同范式：路径产品不可见 → 40302；详情 40302）；
 * Report 随冗余 productId（productId=0 的「无关联测试单」报告仅超管可见，对齐 backend ProductApi.canAccess(0)）。
 */
import type { ProjectView } from '@zentao/api-client/generated/model/projectView'
import type { ReportView } from '@zentao/api-client/generated/model/reportView'
import type { ResultView } from '@zentao/api-client/generated/model/resultView'
import type { TestRunView } from '@zentao/api-client/generated/model/testRunView'
import { HttpResponse, http } from 'msw'
import { closeDateError, REPORT_IMMUTABLE_FIELDS, TEST_RUN_RESULTS } from '../features/quality/model'

/** 测试单类型（与 QualityRegistrar 的 meta/testRun.type options 同源）。 */
const TEST_RUN_TYPES = ['integrate', 'system', 'acceptance', 'performance', 'safety'] as const

import { currentAccount, db, error, FORBIDDEN, mockId, NOT_FOUND, privilegesOf, UNAUTHENTICATED } from './db'
import {
  PRIORITY_OPTIONS,
  TEST_RUN_RESULT_OPTIONS,
  TEST_RUN_STATUS_OPTIONS,
  TEST_RUN_TYPE_OPTIONS,
} from './meta-options'
import { hidden, notify, record, visibleProduct } from './product-handlers'
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
const stateConflict = (message: string) => HttpResponse.json(error(42202, message), { status: 422 })
const lockConflict = () => HttpResponse.json(error(40901, '数据已被他人修改，请刷新后重试。'), { status: 409 })
const notFound = () => HttpResponse.json(NOT_FOUND, { status: 404 })

const R = {
  view: 'testrun-view',
  create: 'testrun-create',
  edit: 'testrun-edit',
  start: 'testrun-start',
  block: 'testrun-block',
  activate: 'testrun-activate',
  close: 'testrun-close',
  linkCase: 'testrun-link-case',
  recordResult: 'testrun-record-result',
  assignCase: 'testrun-assign-case',
  delete: 'testrun-delete',
}
const P = { view: 'report-view', create: 'report-create', edit: 'report-edit', delete: 'report-delete' }

/** 执行 = project 表 type ∈ sprint|stage|kanban 的行（project §2）。 */
const EXECUTION_TYPES = ['sprint', 'stage', 'kanban'] as const

/** close 守卫文案（quality §4.3；与 testRun.message.closeDate* 同义）。 */
const CLOSE_MESSAGES: Record<string, string> = {
  required: '请填写实际结束时间。',
  beforeBegin: '实际结束时间不得早于开始日期。',
  afterNextDay: '实际结束时间不得晚于结束日期的次日。',
}

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

// ── 数据权限（§7：随产品；写路径先 40401 后 40302） ──

/** Report 可见性随冗余 productId（§7）；productId=0（未关联测试单）无产品可依，仅超管可见。 */
function reportVisible(productId: number | undefined): boolean {
  if (!productId) {
    return currentAccount()?.roleIds.includes(1) ?? false
  }
  return visibleProduct(productId) !== undefined
}

/** 执行可见性闸门：不存在 → 40401，不可见 → 40302（与 task-handlers.guardExecution 同构）。 */
function guardExecution(executionId: number): { execution: ProjectView } | { denied: Response } {
  const execution = db.projects.find((item) => item.id === executionId)
  if (!execution || !(EXECUTION_TYPES as readonly string[]).includes(execution.type)) {
    return { denied: notFound() }
  }
  if (!canSeeProject(execution)) {
    return { denied: HttpResponse.json(error(40302, '无权访问该执行。'), { status: 403 }) }
  }
  return { execution }
}

function findTestRun(testRunId: number): TestRunView | undefined {
  const testRun = db.testRuns.find((item) => item.id === testRunId)
  return testRun && visibleProduct(testRun.productId) ? testRun : undefined
}

// ── 列表 DSL（03 §3 最小实现） ──

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

// ── Result（§3.5：test_run_case 行 + 用例摘要联结） ──

function runView(row: ResultView): ResultView {
  const testCase = db.testCases.find((item) => item.id === row.testCaseId)
  return {
    ...row,
    caseTitle: testCase?.title ?? null,
    casePriority: testCase?.priority ?? null,
  }
}

function runRows(testRunId: number): ResultView[] {
  return db.testRunCases.filter((row) => row.testRunId === testRunId)
}

function runCasePage(testRunId: number, url: URL): { items: ResultView[]; total: number } {
  const rows = runRows(testRunId).filter(
    (row) =>
      matchAccount(row.assignee, url.searchParams.get('filters[assignee]')) &&
      matchValue(row.result, url.searchParams.get('filters[result]')),
  )
  return paginate(rows.map(runView), url)
}

// ── TestRun 构造与校验（§3.4） ──

function validateTestRunBody(body: Record<string, unknown>, current?: TestRunView): string | null {
  const name = String(body.name ?? current?.name ?? '').trim()
  if (name.length === 0) {
    return '测试单名称必填。'
  }
  if (name.length > 90) {
    return '测试单名称最多 90 个字符。'
  }
  const priority = Number(body.priority ?? current?.priority ?? 3)
  if (priority < 1 || priority > 4) {
    return 'priority 取值 1–4。'
  }
  const type = body.type === undefined ? current?.type : body.type
  if (type !== undefined && type !== null && !(TEST_RUN_TYPES as readonly string[]).includes(String(type))) {
    return 'type 非法。'
  }
  const beginDate = String(body.beginDate ?? current?.beginDate ?? '')
  const endDate = String(body.endDate ?? current?.endDate ?? '')
  if (beginDate.length === 0 || endDate.length === 0) {
    return '开始日期与结束日期必填。'
  }
  if (endDate < beginDate) {
    return '结束日期不得早于开始日期。'
  }
  return null
}

function newTestRun(productId: number, execution: ProjectView, body: Record<string, unknown>): TestRunView {
  return {
    id: mockId(),
    productId,
    projectId: execution.parentId,
    executionId: execution.id,
    buildId: Number(body.buildId ?? 0),
    name: String(body.name ?? '').trim(),
    owner: (body.owner as string | null | undefined) ?? null,
    priority: Number(body.priority ?? 3),
    type: (body.type as TestRunView['type']) ?? null,
    beginDate: String(body.beginDate ?? ''),
    endDate: String(body.endDate ?? ''),
    realBeganAt: null,
    realFinishedAt: null,
    description: (body.description as string | null | undefined) ?? null,
    members: (body.members as string[] | undefined) ?? [],
    notifyAccounts: (body.notifyAccounts as string[] | undefined) ?? [],
    status: 'wait',
    reportId: null,
    customFields: (body.customFields as Record<string, unknown> | undefined) ?? {},
    createdBy: currentAccount()?.account ?? 'system',
    createdAt: now(),
    updatedBy: null,
    updatedAt: null,
    lockVersion: 0,
  }
}

/** PATCH 白名单（§5 updateTestRun）；productId/executionId/status/reportId 创建后不可改（40001）。 */
const TEST_RUN_PATCH_KEYS = [
  'name',
  'owner',
  'priority',
  'type',
  'beginDate',
  'endDate',
  'buildId',
  'description',
  'members',
  'notifyAccounts',
] as const
const TEST_RUN_IMMUTABLE_KEYS = ['productId', 'projectId', 'executionId', 'status', 'reportId']

/** 状态动作：from 守卫 + activity（§4.3）。 */
type TestRunAction = 'start' | 'block' | 'activate'

/** 状态动作：from 守卫 + 权限码（§4.3）；activity 名与 workflow/test-run.yml 同源。 */
const RUN_ACTIONS: Record<TestRunAction, { from: string[]; perm: string }> = {
  start: { from: ['wait'], perm: R.start },
  block: { from: ['wait', 'doing'], perm: R.block },
  activate: { from: ['blocked', 'done'], perm: R.activate },
}

function runAction(testRun: TestRunView, action: TestRunAction, comment: string | null): void {
  testRun.status = action === 'block' ? 'blocked' : 'doing'
  if (action === 'start') {
    testRun.realBeganAt = now()
    if (testRun.owner) {
      notify(testRun.owner, 'testrun-started', 'testRun', testRun.id, testRun.name)
    }
  }
  testRun.lockVersion += 1
  testRun.updatedBy = currentAccount()?.account ?? null
  testRun.updatedAt = now()
  record('testRun', testRun.id, action === 'start' ? 'started' : action, comment)
}

// ── Report 构造与校验（§3.6） ──

function validateReportBody(body: Record<string, unknown>, current?: ReportView): string | null {
  const title = String(body.title ?? current?.title ?? '').trim()
  if (title.length === 0) {
    return '报告标题必填。'
  }
  if (title.length > 255) {
    return '报告标题最多 255 个字符。'
  }
  const beginDate = String(body.beginDate ?? current?.beginDate ?? '')
  const endDate = String(body.endDate ?? current?.endDate ?? '')
  if (beginDate.length === 0 || endDate.length === 0) {
    return '开始日期与结束日期必填。'
  }
  if (endDate < beginDate) {
    return '结束日期不得早于开始日期。'
  }
  return null
}

/** 关联测试单须属于该执行（§3.6）；返回 null 表示合法。 */
function validateReportRuns(executionId: number, runIds: number[]): string | null {
  const owned = db.testRuns.filter((run) => run.executionId === executionId).map((run) => run.id)
  return runIds.every((runId) => owned.includes(runId)) ? null : '关联测试单必须属于该执行。'
}

const REPORT_PATCH_KEYS = ['title', 'testRunIds', 'beginDate', 'endDate', 'owner', 'content'] as const

// ── meta 目录（与 workflow/test-run.yml 同源，03 §6） ──

export const TEST_RUN_META = {
  domain: 'testRun',
  fields: [
    { key: 'name', type: 'text', required: true, maxLength: 90, i18n: 'testRun.field.name' },
    { key: 'executionId', type: 'select', required: true, i18n: 'testRun.field.execution' },
    { key: 'buildId', type: 'select', i18n: 'testRun.field.build' },
    { key: 'owner', type: 'select', source: 'accounts', i18n: 'testRun.field.owner' },
    { key: 'priority', type: 'select', required: true, i18n: 'common.priority', options: PRIORITY_OPTIONS },
    { key: 'type', type: 'select', i18n: 'testRun.field.type', options: TEST_RUN_TYPE_OPTIONS },
    { key: 'status', type: 'select', i18n: 'testRun.field.status', options: TEST_RUN_STATUS_OPTIONS },
    { key: 'result', type: 'select', i18n: 'testRun.field.result', options: TEST_RUN_RESULT_OPTIONS },
    { key: 'beginDate', type: 'date', required: true, i18n: 'testRun.field.beginDate' },
    { key: 'endDate', type: 'date', required: true, i18n: 'testRun.field.endDate' },
    { key: 'description', type: 'richtext', i18n: 'testRun.field.description' },
    { key: 'members', type: 'multiselect', source: 'accounts', i18n: 'testRun.field.members' },
    { key: 'notifyAccounts', type: 'multiselect', source: 'accounts', i18n: 'testRun.field.notify' },
  ],
  list: { defaultColumns: ['id', 'name', 'status', 'owner', 'priority'], defaultSort: '-id' },
  actions: [
    { code: 'testrun-start', action: 'start', i18n: 'testRun.action.start', allowedStatus: ['wait'] },
    { code: 'testrun-block', action: 'block', i18n: 'testRun.action.block', allowedStatus: ['wait', 'doing'] },
    {
      code: 'testrun-activate',
      action: 'activate',
      i18n: 'testRun.action.activate',
      allowedStatus: ['blocked', 'done'],
    },
    {
      code: 'testrun-close',
      action: 'close',
      i18n: 'testRun.action.close',
      allowedStatus: ['wait', 'doing', 'blocked'],
    },
    {
      code: 'testrun-edit',
      action: 'edit',
      i18n: 'common.action.edit',
      allowedStatus: ['wait', 'doing', 'blocked', 'done'],
    },
  ],
  statusVisuals: {
    wait: { tone: 'pending', i18n: 'testRun.status.wait' },
    doing: { tone: 'active', i18n: 'testRun.status.doing' },
    done: { tone: 'closed', i18n: 'testRun.status.done' },
    blocked: { tone: 'error', i18n: 'testRun.status.blocked' },
  },
}

export const REPORT_META = {
  domain: 'report',
  fields: [
    { key: 'title', type: 'text', required: true, maxLength: 255, i18n: 'report.field.title' },
    { key: 'testRunIds', type: 'multiselect', i18n: 'report.field.testRuns' },
    { key: 'beginDate', type: 'date', required: true, i18n: 'report.field.beginDate' },
    { key: 'endDate', type: 'date', required: true, i18n: 'report.field.endDate' },
    { key: 'owner', type: 'select', source: 'accounts', i18n: 'report.field.owner' },
    { key: 'content', type: 'richtext', i18n: 'report.field.content' },
  ],
  list: { defaultColumns: ['id', 'title', 'owner', 'createdAt'], defaultSort: '-id' },
  actions: [
    {
      code: 'report-edit',
      action: 'edit',
      i18n: 'common.action.edit',
      allowedStatus: [],
    },
  ],
  statusVisuals: {},
}

export const QUALITY_RUN_META_BY_DOMAIN: Record<string, unknown> = {
  testRun: TEST_RUN_META,
  report: REPORT_META,
}

// ── handlers ──

export const qualityTestRunHandlers = [
  // ── TestRun：产品面列表与创建（quality §5） ──

  http.get('*/api/v1/products/:productId/test-runs', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([R.view])) {
      return forbidden(R.view)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.testRuns.filter(
      (run) =>
        run.productId === product.id &&
        matchIn(run.status, url.searchParams.get('filters[status]')) &&
        matchIn(run.priority, url.searchParams.get('filters[priority]')) &&
        matchIn(run.type, url.searchParams.get('filters[type]')) &&
        matchIn(run.id, url.searchParams.get('filters[id]')) &&
        matchValue(run.buildId, url.searchParams.get('filters[buildId]')) &&
        matchValue(run.executionId, url.searchParams.get('filters[executionId]')) &&
        matchIn(run.createdAt?.slice(0, 10), url.searchParams.get('filters[createdAt]')) &&
        matchAccount(run.owner, url.searchParams.get('filters[owner]')),
    )
    if (q) {
      items = items.filter((run) => run.name.toLowerCase().includes(q))
    }
    return ok(paginate(items, url))
  }),

  http.post('*/api/v1/products/:productId/test-runs', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([R.create])) {
      return forbidden(R.create)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (body.executionId === undefined || body.executionId === null) {
      return validation('所属执行必填。', { executionId: 'required' })
    }
    const guarded = guardExecution(Number(body.executionId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const invalid = validateTestRunBody(body)
    if (invalid) {
      return validation(invalid, { name: 'invalid' })
    }
    const testRun = newTestRun(product.id, guarded.execution, body)
    db.testRuns.push(testRun)
    record('testRun', testRun.id, 'created')
    return ok(testRun)
  }),

  // ── TestRun：详情 / 部分更新（quality §5） ──

  http.get('*/api/v1/test-runs/:testRunId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([R.view])) {
      return forbidden(R.view)
    }
    const testRun = db.testRuns.find((item) => item.id === Number(params.testRunId))
    if (!testRun) {
      return notFound()
    }
    if (!visibleProduct(testRun.productId)) {
      return hidden()
    }
    return ok(testRun)
  }),

  http.patch('*/api/v1/test-runs/:testRunId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([R.edit])) {
      return forbidden(R.edit)
    }
    const testRun = findTestRun(Number(params.testRunId))
    if (!testRun) {
      return notFound()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (TEST_RUN_IMMUTABLE_KEYS.some((key) => key in body)) {
      return badRequest('所属产品/执行与状态不可直接修改。')
    }
    if (body.lockVersion === undefined || body.lockVersion !== testRun.lockVersion) {
      return lockConflict()
    }
    const invalid = validateTestRunBody(body, testRun)
    if (invalid) {
      return validation(invalid)
    }
    for (const key of TEST_RUN_PATCH_KEYS) {
      if (key in body) {
        ;(testRun as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    testRun.lockVersion += 1
    testRun.updatedBy = currentAccount()?.account ?? null
    testRun.updatedAt = now()
    record('testRun', testRun.id, 'edited')
    return ok(testRun)
  }),

  // 软删测试单（§5 DELETE）：test_run_case 行连带失效；已回填的 reportId 不清。
  http.delete('*/api/v1/test-runs/:testRunId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([R.delete])) {
      return forbidden(R.delete)
    }
    const testRun = findTestRun(Number(params.testRunId))
    if (!testRun) {
      return notFound()
    }
    db.testRuns = db.testRuns.filter((item) => item.id !== testRun.id)
    db.testRunCases = db.testRunCases.filter((item) => item.testRunId !== testRun.id)
    record('testRun', testRun.id, 'deleted')
    return ok(null)
  }),

  // ── TestRun：start / block / activate（§4.3 四态五动作） ──

  ...(['start', 'block', 'activate'] as const).map((action) =>
    http.post(`*/api/v1/test-runs/:testRunId/${action}`, async ({ params, request }) => {
      if (!currentAccount()) {
        return unauthorized()
      }
      const rule = RUN_ACTIONS[action]
      if (!hasPerm([rule.perm])) {
        return forbidden(rule.perm)
      }
      const testRun = findTestRun(Number(params.testRunId))
      if (!testRun) {
        return notFound()
      }
      if (!rule.from.includes(testRun.status)) {
        return stateConflict(`当前状态不可${{ start: '开始', block: '阻塞', activate: '激活' }[action]}。`)
      }
      const body = (await request.json().catch(() => ({}))) as { comment?: string | null }
      runAction(testRun, action, body.comment ?? null)
      return ok(testRun)
    }),
  ),

  // ── TestRun：close（realFinishedAt 必填 + 日期守卫，§4.3） ──

  http.post('*/api/v1/test-runs/:testRunId/close', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([R.close])) {
      return forbidden(R.close)
    }
    const testRun = findTestRun(Number(params.testRunId))
    if (!testRun) {
      return notFound()
    }
    if (!['wait', 'doing', 'blocked'].includes(testRun.status)) {
      return stateConflict('仅未开始/进行中/被阻塞状态可关闭。')
    }
    const body = (await request.json().catch(() => ({}))) as { realFinishedAt?: string; comment?: string | null }
    const day = typeof body.realFinishedAt === 'string' ? body.realFinishedAt.slice(0, 10) : null
    const invalid = closeDateError(testRun.beginDate, testRun.endDate, day)
    if (invalid) {
      return validation(CLOSE_MESSAGES[invalid] ?? CLOSE_MESSAGES.required ?? '', { realFinishedAt: invalid })
    }
    testRun.status = 'done'
    testRun.realFinishedAt = body.realFinishedAt ?? null
    testRun.lockVersion += 1
    testRun.updatedBy = currentAccount()?.account ?? null
    testRun.updatedAt = now()
    record('testRun', testRun.id, 'closed', body.comment ?? null)
    for (const recipient of [testRun.owner, testRun.createdBy]) {
      if (recipient) {
        notify(recipient, 'testrun-closed', 'testRun', testRun.id, testRun.name)
      }
    }
    return ok(testRun)
  }),

  // ── TestRun：执行清单 / 关联 / 解除 / 登记 / 指派（§3.5、§4.3） ──

  http.get('*/api/v1/test-runs/:testRunId/cases', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([R.view])) {
      return forbidden(R.view)
    }
    const testRun = findTestRun(Number(params.testRunId))
    if (!testRun) {
      return notFound()
    }
    return ok(runCasePage(testRun.id, new URL(request.url)))
  }),

  http.post('*/api/v1/test-runs/:testRunId/cases', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([R.linkCase])) {
      return forbidden(R.linkCase)
    }
    const testRun = findTestRun(Number(params.testRunId))
    if (!testRun) {
      return notFound()
    }
    const body = (await request.json()) as { caseIds?: number[]; assignee?: string | null }
    const caseIds = [...new Set(body.caseIds ?? [])]
    if (caseIds.length === 0) {
      return validation('caseIds 必填。', { caseIds: 'required' })
    }
    const matched = caseIds.filter((caseId) =>
      db.testCases.some((item) => item.id === caseId && item.productId === testRun.productId && item.libraryId === 0),
    )
    if (matched.length !== caseIds.length) {
      return validation('用例必须属于该产品的用例库外用例。', { caseIds: 'crossProduct' })
    }
    for (const caseId of caseIds) {
      const existing = db.testRunCases.find((row) => row.testRunId === testRun.id && row.testCaseId === caseId)
      if (existing) {
        if (body.assignee !== undefined && body.assignee !== null) {
          existing.assignee = body.assignee // 幂等：已关联行只补指派
        }
        continue
      }
      db.testRunCases.push({
        id: mockId(),
        testRunId: testRun.id,
        testCaseId: caseId,
        version: 1,
        assignee: body.assignee ?? null,
        result: null,
        runner: null,
        runAt: null,
      })
    }
    testRun.updatedBy = currentAccount()?.account ?? null
    testRun.updatedAt = now()
    record('testRun', testRun.id, 'linked')
    return ok(runCasePage(testRun.id, new URL(request.url)))
  }),

  http.post('*/api/v1/test-runs/:testRunId/unlink-cases', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([R.linkCase])) {
      return forbidden(R.linkCase)
    }
    const testRun = findTestRun(Number(params.testRunId))
    if (!testRun) {
      return notFound()
    }
    const body = (await request.json()) as { caseIds?: number[] }
    const caseIds = body.caseIds ?? []
    for (let index = db.testRunCases.length - 1; index >= 0; index -= 1) {
      const row = db.testRunCases[index]
      if (row && row.testRunId === testRun.id && caseIds.includes(row.testCaseId)) {
        db.testRunCases.splice(index, 1)
      }
    }
    testRun.updatedBy = currentAccount()?.account ?? null
    testRun.updatedAt = now()
    record('testRun', testRun.id, 'unlinked')
    return ok(runCasePage(testRun.id, new URL(request.url)))
  }),

  /** 登记执行结果：仅 doing（42202）；同 (testRunId, testCaseId) 幂等 upsert 同行覆写 + 同步用例 lastRun 三字段。 */
  http.post('*/api/v1/test-runs/:testRunId/cases/:caseId/result', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([R.recordResult])) {
      return forbidden(R.recordResult)
    }
    const testRun = findTestRun(Number(params.testRunId))
    if (!testRun) {
      return notFound()
    }
    const caseId = Number(params.caseId)
    const testCase = db.testCases.find(
      (item) => item.id === caseId && item.productId === testRun.productId && item.libraryId === 0,
    )
    if (!testCase) {
      return validation('用例不存在或不属于该产品。', { caseId: 'notFound' })
    }
    const body = (await request.json()) as { result?: string; comment?: string | null }
    const result = String(body.result ?? '')
    if (!(TEST_RUN_RESULTS as readonly string[]).includes(result)) {
      return validation('result 取值 pass|fail|blocked|n/a。', { result: 'invalid' })
    }
    if (testRun.status !== 'doing') {
      return stateConflict('仅进行中的测试单可登记执行结果。')
    }
    const actor = currentAccount()?.account ?? 'system'
    const runAt = now()
    const recorded = result as NonNullable<ResultView['result']>
    let row = db.testRunCases.find((item) => item.testRunId === testRun.id && item.testCaseId === caseId)
    if (!row) {
      // upsert：行不存在时新建（UNIQUE(test_run_id, test_case_id) 同行不重复）
      row = {
        id: mockId(),
        testRunId: testRun.id,
        testCaseId: caseId,
        version: 1,
        assignee: null,
        result: null,
        runner: null,
        runAt: null,
      }
      db.testRunCases.push(row)
    }
    row.result = recorded
    row.runner = actor
    row.runAt = runAt
    // 同步用例 lastRun 三字段（§3.5 副作用）
    testCase.lastRunResult = recorded
    testCase.lastRunner = actor
    testCase.lastRunAt = runAt
    record('testRun', testRun.id, 'runCase', body.comment ?? null)
    return ok(runView(row))
  }),

  /** 指派执行人：行须已关联该测试单（否则 40401）。 */
  http.post('*/api/v1/test-runs/:testRunId/cases/:caseId/assign', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([R.assignCase])) {
      return forbidden(R.assignCase)
    }
    const testRun = findTestRun(Number(params.testRunId))
    if (!testRun) {
      return notFound()
    }
    const body = (await request.json().catch(() => ({}))) as { assignee?: string }
    if (!body.assignee) {
      return validation('assignee 必填。', { assignee: 'required' })
    }
    const row = db.testRunCases.find(
      (item) => item.testRunId === testRun.id && item.testCaseId === Number(params.caseId),
    )
    if (!row) {
      return notFound()
    }
    row.assignee = body.assignee
    record('testRun', testRun.id, 'assigned')
    return ok(runView(row))
  }),

  http.get('*/api/v1/test-runs/:testRunId/activities', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([R.view])) {
      return forbidden(R.view)
    }
    const testRun = findTestRun(Number(params.testRunId))
    if (!testRun) {
      return notFound()
    }
    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const beforeId = Number(url.searchParams.get('beforeId') ?? Number.MAX_SAFE_INTEGER)
    const items = db.activities
      .filter(
        (activity) => activity.objectType === 'testRun' && activity.objectId === testRun.id && activity.id < beforeId,
      )
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
    return ok({ items, hasMore: items.length === limit })
  }),

  // ── Report：执行面列表与创建（quality §5） ──

  http.get('*/api/v1/executions/:executionId/reports', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.view])) {
      return forbidden(P.view)
    }
    const executionId = Number(params.executionId)
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.reports.filter(
      (report) =>
        report.executionId === executionId &&
        reportVisible(report.productId) &&
        matchIn(report.id, url.searchParams.get('filters[id]')) &&
        matchIn(report.createdAt?.slice(0, 10), url.searchParams.get('filters[createdAt]')) &&
        matchAccount(report.owner, url.searchParams.get('filters[owner]')),
    )
    if (q) {
      items = items.filter((report) => report.title.toLowerCase().includes(q))
    }
    return ok(paginate(items, url))
  }),
  http.post('*/api/v1/executions/:executionId/reports', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.create])) {
      return forbidden(P.create)
    }
    const guarded = guardExecution(Number(params.executionId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const execution = guarded.execution
    const body = (await request.json()) as Record<string, unknown>
    const runIds = [...new Set((body.testRunIds as number[] | undefined) ?? [])]
    const invalidRuns = validateReportRuns(execution.id, runIds)
    if (invalidRuns) {
      return validation(invalidRuns, { testRunIds: 'notInExecution' })
    }
    const invalid = validateReportBody(body)
    if (invalid) {
      return validation(invalid, { title: 'invalid' })
    }
    // productId 冗余口径 = 首个关联测试单的产品（无单为 0，backend STATE 决策）
    const productId = db.testRuns.find((run) => run.id === runIds[0])?.productId ?? 0
    const report: ReportView = {
      id: mockId(),
      executionId: execution.id,
      projectId: execution.parentId,
      productId,
      title: String(body.title ?? '').trim(),
      testRunIds: runIds,
      beginDate: String(body.beginDate ?? ''),
      endDate: String(body.endDate ?? ''),
      owner: (body.owner as string | null | undefined) ?? null,
      content: (body.content as string | null | undefined) ?? null,
      createdBy: currentAccount()?.account ?? 'system',
      createdAt: now(),
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
    }
    db.reports.push(report)
    // 同事务回填各 TestRun.reportId（§3.6）
    for (const runId of runIds) {
      const testRun = db.testRuns.find((item) => item.id === runId)
      if (testRun) {
        testRun.reportId = report.id
      }
    }
    record('report', report.id, 'created')
    return ok(report)
  }),

  // ── Report：详情 / 部分更新（quality §5） ──

  http.get('*/api/v1/reports/:reportId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.view])) {
      return forbidden(P.view)
    }
    const report = db.reports.find((item) => item.id === Number(params.reportId))
    if (!report) {
      return notFound()
    }
    if (!reportVisible(report.productId)) {
      return hidden()
    }
    return ok(report)
  }),

  http.patch('*/api/v1/reports/:reportId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.edit])) {
      return forbidden(P.edit)
    }
    const report = db.reports.find((item) => item.id === Number(params.reportId))
    if (!report) {
      return notFound()
    }
    if (!reportVisible(report.productId)) {
      return hidden()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (REPORT_IMMUTABLE_FIELDS.some((key) => key in body)) {
      return badRequest('所属执行创建后不可修改。')
    }
    if (body.lockVersion === undefined || body.lockVersion !== report.lockVersion) {
      return lockConflict()
    }
    const invalid = validateReportBody(body, report)
    if (invalid) {
      return validation(invalid)
    }
    const runIds = body.testRunIds === undefined ? report.testRunIds : [...new Set(body.testRunIds as number[])]
    const invalidRuns = validateReportRuns(report.executionId, runIds)
    if (invalidRuns) {
      return validation(invalidRuns, { testRunIds: 'notInExecution' })
    }
    for (const key of REPORT_PATCH_KEYS) {
      if (key in body) {
        ;(report as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    report.testRunIds = runIds
    report.lockVersion += 1
    report.updatedBy = currentAccount()?.account ?? null
    report.updatedAt = now()
    // testRunIds 变更 → 重指回填（旧集合不再包含的清空，新集合落 reportId，§3.6）
    for (const testRun of db.testRuns.filter((item) => item.executionId === report.executionId)) {
      if (runIds.includes(testRun.id)) {
        testRun.reportId = report.id
      } else if (testRun.reportId === report.id) {
        testRun.reportId = null
      }
    }
    record('report', report.id, 'edited')
    return ok(report)
  }),

  // 软删报告（§5 DELETE）：关联测试单的 reportId 清空回写。
  http.delete('*/api/v1/reports/:reportId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.delete])) {
      return forbidden(P.delete)
    }
    const report = db.reports.find((item) => item.id === Number(params.reportId))
    if (!report) {
      return notFound()
    }
    if (!reportVisible(report.productId)) {
      return hidden()
    }
    for (const testRun of db.testRuns.filter((item) => item.executionId === report.executionId)) {
      if (testRun.reportId === report.id) {
        testRun.reportId = null
      }
    }
    db.reports = db.reports.filter((item) => item.id !== report.id)
    record('report', report.id, 'deleted')
    return ok(null)
  }),
]
