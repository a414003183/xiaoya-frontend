import type { EffortView } from '@zentao/api-client/generated/model/effortView'
import type { ProjectView } from '@zentao/api-client/generated/model/projectView'
import type { TaskChildSummary } from '@zentao/api-client/generated/model/taskChildSummary'
import type { TaskView } from '@zentao/api-client/generated/model/taskView'
import type { TaskViewClosedReason } from '@zentao/api-client/generated/model/taskViewClosedReason'
import { HttpResponse, http } from 'msw'
import { currentAccount, db, error, FORBIDDEN, mockId, NOT_FOUND, privilegesOf, UNAUTHENTICATED } from './db'
import { PRIORITY_OPTIONS, TASK_CLOSE_REASON_OPTIONS, TASK_STATUS_OPTIONS, TASK_TYPE_OPTIONS } from './meta-options'
import { notify, record } from './product-handlers'
import { canSeeProject } from './project-handlers'

/**
 * task 域 MSW handlers（T-10/T-11）：任务 CRUD/八动作/批量 + 工时登记与回算，
 * 路径与载荷形状同 contract/openapi.yaml（task §5），状态机守卫同 backend workflow/task.yml。
 */

const ok = (data: unknown) => HttpResponse.json({ data })
const unauthorized = () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })
const forbidden = (perm: string) => HttpResponse.json(FORBIDDEN(perm), { status: 403 })
const hidden = () => HttpResponse.json(error(40302, '无权访问该任务的执行。'), { status: 403 })
const validation = (message: string, fields?: Record<string, string>) =>
  HttpResponse.json(
    { error: { code: 42201, message, traceId: 'mock', ...(fields ? { fields } : {}) } },
    { status: 422 },
  )
const stateConflict = (message: string) => HttpResponse.json(error(42202, message), { status: 422 })
const conditionNotMet = (message: string) => HttpResponse.json(error(42203, message), { status: 422 })
const lockConflict = () => HttpResponse.json(error(40901, '数据已被他人修改，请刷新后重试。'), { status: 409 })
const notFound = () => HttpResponse.json(NOT_FOUND, { status: 404 })

const T = {
  view: 'task-view',
  create: 'task-create',
  edit: 'task-edit',
  start: 'task-start',
  finish: 'task-finish',
  pause: 'task-pause',
  resume: 'task-resume',
  cancel: 'task-cancel',
  close: 'task-close',
  activate: 'task-activate',
  assign: 'task-assign',
  effort: 'task-effort',
  effortEdit: 'task-effort-edit',
  effortDelete: 'task-effort-delete',
  delete: 'task-delete',
}

const EXECUTION_TYPES = ['sprint', 'stage', 'kanban'] as const
const ACTION_RULES: Record<string, { from: string[]; perm: string; activity: string }> = {
  start: { from: ['wait'], perm: T.start, activity: 'started' },
  finish: { from: ['wait', 'doing', 'pause'], perm: T.finish, activity: 'finished' },
  pause: { from: ['doing'], perm: T.pause, activity: 'paused' },
  resume: { from: ['pause'], perm: T.resume, activity: 'resumed' },
  cancel: { from: ['wait', 'doing', 'pause'], perm: T.cancel, activity: 'canceled' },
  close: { from: ['done', 'cancel', 'wait', 'doing', 'pause'], perm: T.close, activity: 'closed' },
  activate: { from: ['done', 'cancel', 'closed'], perm: T.activate, activity: 'activated' },
  assign: { from: ['wait', 'doing', 'done', 'pause'], perm: T.assign, activity: 'assigned' },
}
const BATCH_ACTIONS = ['edit', 'assign', 'start', 'pause', 'resume', 'cancel', 'close'] as const

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

const today = () => new Date().toISOString().slice(0, 10)
const now = () => new Date().toISOString()

// ── 数据权限（task §7：任务可见性由所属执行 ACL 决定；执行已关闭 → 写端点 42203） ──

function executionOf(executionId: number): ProjectView | undefined {
  const execution = db.projects.find((item) => item.id === executionId)
  if (!execution || !(EXECUTION_TYPES as readonly string[]).includes(execution.type)) {
    return undefined
  }
  return canSeeProject(execution) ? execution : undefined
}

/** 写闸门：执行已关闭时其下任务整体只读（旧 canModify 语义）。 */
function executionClosed(task: TaskView): boolean {
  return db.projects.find((item) => item.id === task.executionId)?.status === 'closed'
}

function findTask(taskId: number): TaskView | undefined {
  const task = db.tasks.find((item) => item.id === taskId)
  if (!task || !executionOf(task.executionId)) {
    return undefined
  }
  return task
}

function taskDetail(task: TaskView): TaskView {
  const children: TaskChildSummary[] = db.tasks
    .filter((item) => item.parentId === task.id)
    .map((child) => ({ id: child.id, title: child.title, status: child.status, assignee: child.assignee ?? null }))
  return {
    ...task,
    children,
    storyTitle: db.stories.find((story) => story.id === task.storyId)?.title ?? null,
  }
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

/** 列表过滤（§3 filterable 汇总）：filters[id] 供批量页按 ids 取行。 */
function taskListOf(url: URL, executionId: number): TaskView[] {
  const account = currentAccount()
  const q = url.searchParams.get('q')?.toLowerCase()
  let items = db.tasks.filter((task) => task.executionId === executionId)
  items = items.filter(
    (task) =>
      matchIn(task.status, url.searchParams.get('filters[status]')) &&
      matchIn(task.type, url.searchParams.get('filters[type]')) &&
      matchIn(task.priority, url.searchParams.get('filters[priority]')) &&
      matchIn(task.id, url.searchParams.get('filters[id]')) &&
      matchIn(task.closedReason, url.searchParams.get('filters[closedReason]')) &&
      matchValue(task.parentId, url.searchParams.get('filters[parentId]')) &&
      matchValue(task.storyId, url.searchParams.get('filters[storyId]')) &&
      matchValue(task.createdBy, url.searchParams.get('filters[createdBy]')) &&
      matchRange(task.deadline, url.searchParams.get('filters[deadline]')) &&
      matchAssignee(task, url.searchParams.get('filters[assignee]'), account?.account ?? ''),
  )
  if (q) {
    items = items.filter((task) => `${task.title}${task.keywords ?? ''}`.toLowerCase().includes(q))
  }
  const sort = url.searchParams.get('sort')
  const desc = (sort ?? '').startsWith('-')
  const key = (sort ?? '-id').replace(/^-/, '')
  const field = key === 'id' ? 'id' : key
  return [...items].sort((a, b) => {
    const left = String((a as unknown as Record<string, unknown>)[field] ?? '')
    const right = String((b as unknown as Record<string, unknown>)[field] ?? '')
    const compared = left === right ? 0 : left > right ? 1 : -1
    return (desc ? -compared : compared) || b.id - a.id
  })
}

function matchAssignee(task: TaskView, filter: string | null, me: string): boolean {
  if (!filter) {
    return true
  }
  if (filter === '@me') {
    return task.assignee === me
  }
  if (filter === '@notNull') {
    return task.assignee !== null && task.assignee !== undefined
  }
  return matchValue(task.assignee, filter)
}

// ── 八动作（§4 + backend workflow/task.yml：状态外 42202、守卫不满足 42203） ──

function applyAction(task: TaskView, action: string, body: Record<string, unknown>): Response | null {
  const rule = ACTION_RULES[action]
  if (!rule) {
    return stateConflict(`未知动作 ${action}。`)
  }
  const comment = (body.comment as string | null) ?? null
  const previousAssignee = task.assignee ?? null
  // 请求体校验先于状态闸门（同 backend：动作级校验在 fire 前执行 → 42201）
  if ((action === 'start' || action === 'finish') && body.consumedHours !== undefined && body.consumedHours !== null) {
    if (!(Number(body.consumedHours) > 0)) {
      return validation('本次消耗必须大于 0。', { consumedHours: 'invalid' })
    }
  }
  if (action === 'activate' && !(Number(body.leftHours) > 0)) {
    return validation('激活必须填写大于 0 的剩余工时。', { leftHours: 'required' })
  }
  if (action === 'assign') {
    const assignee = body.assignee as string | undefined
    if (!assignee) {
      return validation('assignee 必填。', { assignee: 'required' })
    }
    if (!db.accounts.some((account) => account.account === assignee)) {
      return validation('账号不存在。', { assignee: 'notFound' })
    }
  }
  const closeReason = (body.closedReason as TaskViewClosedReason | undefined) ?? null
  if (
    action === 'close' &&
    task.status !== 'done' &&
    task.status !== 'cancel' &&
    closeReason !== 'done' &&
    closeReason !== 'cancel'
  ) {
    return validation('非完成/取消来源关闭必须填写 closedReason。', { closedReason: 'required' })
  }
  // 状态闸门（42202）与守卫（42203）
  if (!rule.from.includes(task.status)) {
    return stateConflict(`当前状态 ${task.status} 不允许执行 ${action}。`)
  }
  if ((action === 'start' || action === 'finish') && task.isParent) {
    return conditionNotMet('父任务由子任务承载工时，不可直接开始或完成。')
  }
  if (action === 'start') {
    if (body.assignee) {
      task.assignee = String(body.assignee)
      task.assignedAt = now()
    }
    task.startedAt = now()
    if (body.leftHours !== undefined && body.leftHours !== null) {
      task.leftHours = Number(body.leftHours)
    } else if (task.leftHours === null || task.leftHours === undefined) {
      // 缺省 = estimateHours − consumedHours（本次消耗在初始化之后累计，同 backend）
      task.leftHours = Math.max((task.estimateHours ?? 0) - task.consumedHours, 0)
    }
    const spent = Number(body.consumedHours ?? 0)
    if (spent > 0) {
      task.consumedHours += spent
      pushEffort(task, spent, null)
    }
  }
  if (action === 'finish') {
    const spent = Number(body.consumedHours ?? 0)
    task.consumedHours += spent
    if (task.consumedHours <= 0) {
      return conditionNotMet('本次消耗与累计消耗均为 0，无法完成。')
    }
    task.startedAt = task.startedAt ?? now()
    task.leftHours = body.leftHours !== undefined && body.leftHours !== null ? Number(body.leftHours) : 0
    task.finishedBy = currentAccount()?.account ?? 'system'
    task.finishedAt = now()
    if (spent > 0) {
      pushEffort(task, spent, 0)
    }
  }
  if (action === 'cancel') {
    task.canceledBy = currentAccount()?.account ?? 'system'
    task.canceledAt = now()
    task.assignee = task.createdBy
  }
  if (action === 'close') {
    if (task.status === 'done' || task.status === 'cancel') {
      task.closedReason = closeReason === 'cancel' ? 'cancel' : 'done'
    } else if (!task.isParent) {
      return conditionNotMet('仅父任务可从进行中状态关闭。')
    } else {
      task.closedReason = closeReason
    }
    task.assignee = null
    task.closedBy = currentAccount()?.account ?? 'system'
    task.closedAt = now()
  }
  if (action === 'activate') {
    task.leftHours = Number(body.leftHours)
    if (body.assignee) {
      task.assignee = String(body.assignee)
      task.assignedAt = now()
    }
    task.finishedBy = null
    task.finishedAt = null
    task.canceledBy = null
    task.canceledAt = null
    task.closedBy = null
    task.closedAt = null
    task.closedReason = null
    task.activatedAt = now()
  }
  if (action === 'assign') {
    task.assignee = String(body.assignee)
    task.assignedAt = now()
    if (body.leftHours !== undefined && body.leftHours !== null) {
      task.leftHours = Number(body.leftHours)
    }
  }
  if (action !== 'assign') {
    task.status = statusAfter(action)
  }
  task.lockVersion += 1
  task.updatedAt = now()
  record('task', task.id, rule.activity, comment)
  if (action === 'assign' && task.assignee) {
    notify(task.assignee, 'task-assigned', 'task', task.id, task.title)
  }
  if (action === 'start' && task.assignee) {
    notify(task.assignee, 'task-started', 'task', task.id, task.title)
  }
  if (action === 'finish') {
    notify(task.createdBy, 'task-finished', 'task', task.id, task.title)
  }
  if (action === 'cancel' && previousAssignee) {
    notify(previousAssignee, 'task-canceled', 'task', task.id, task.title)
  }
  if (action === 'activate' && task.assignee) {
    notify(task.assignee, 'task-activated', 'task', task.id, task.title)
  }
  return null
}

function statusAfter(action: string): TaskView['status'] {
  if (action === 'start' || action === 'resume' || action === 'activate') {
    return 'doing'
  }
  if (action === 'finish') {
    return 'done'
  }
  if (action === 'pause') {
    return 'pause'
  }
  if (action === 'cancel') {
    return 'cancel'
  }
  return 'closed'
}

/** start/finish 的本次消耗自动落一条 effort（§4；finish 落 leftHours=0）。 */
function pushEffort(task: TaskView, consumedHours: number, leftHours: number | null): void {
  db.efforts.push({
    id: mockId(),
    taskId: task.id,
    executionId: task.executionId,
    projectId: task.projectId,
    account: currentAccount()?.account ?? 'system',
    workDate: today(),
    consumedHours,
    leftHours,
    work: null,
    createdBy: currentAccount()?.account ?? 'system',
    createdAt: now(),
  })
}

/** 工时回算（§4）：consumedHours = 未删流水合计；leftHours 取最近一条覆写值；状态不回退。 */
function recalcTask(taskId: number): void {
  const task = db.tasks.find((item) => item.id === taskId)
  if (!task) {
    return
  }
  const efforts = db.efforts.filter((item) => item.taskId === taskId)
  task.consumedHours = efforts.reduce((total, item) => total + item.consumedHours, 0)
  const latest = [...efforts]
    .filter((item) => item.leftHours !== null && item.leftHours !== undefined)
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.id - b.id)
    .pop()
  if (latest && latest.leftHours !== null && latest.leftHours !== undefined) {
    task.leftHours = latest.leftHours
  }
}

// ── meta（与 workflow/task.yml 同源，03 §6） ──

export const TASK_META = {
  domain: 'task',
  fields: [
    { key: 'title', type: 'text', required: true, maxLength: 255, i18n: 'task.field.title' },
    { key: 'type', type: 'select', i18n: 'task.field.type', options: TASK_TYPE_OPTIONS },
    { key: 'priority', type: 'select', required: true, i18n: 'common.priority', options: PRIORITY_OPTIONS },
    { key: 'status', type: 'select', i18n: 'task.field.status', options: TASK_STATUS_OPTIONS },
    { key: 'closedReason', type: 'select', i18n: 'task.field.closedReason', options: TASK_CLOSE_REASON_OPTIONS },
    { key: 'storyId', type: 'select', i18n: 'task.field.story' },
    { key: 'parentId', type: 'select', i18n: 'task.field.parent' },
    { key: 'estimateHours', type: 'number', i18n: 'task.field.estimate' },
    { key: 'estStartedDate', type: 'date', i18n: 'task.field.estStarted' },
    { key: 'deadline', type: 'date', i18n: 'task.field.deadline' },
    { key: 'assignee', type: 'select', source: 'accounts', i18n: 'task.field.assignee' },
    { key: 'keywords', type: 'text', maxLength: 255, i18n: 'task.field.keywords' },
    { key: 'notifyAccounts', type: 'multiselect', source: 'accounts', i18n: 'task.field.notify' },
  ],
  list: {
    defaultColumns: [
      'id',
      'title',
      'priority',
      'status',
      'assignee',
      'estimateHours',
      'consumedHours',
      'leftHours',
      'deadline',
    ],
    defaultSort: '-id',
  },
  actions: [
    { code: T.start, action: 'start', i18n: 'task.action.start', allowedStatus: ['wait'] },
    { code: T.finish, action: 'finish', i18n: 'task.action.finish', allowedStatus: ['wait', 'doing', 'pause'] },
    { code: T.pause, action: 'pause', i18n: 'task.action.pause', allowedStatus: ['doing'] },
    { code: T.resume, action: 'resume', i18n: 'task.action.resume', allowedStatus: ['pause'] },
    { code: T.cancel, action: 'cancel', i18n: 'task.action.cancel', allowedStatus: ['wait', 'doing', 'pause'] },
    {
      code: T.close,
      action: 'close',
      i18n: 'task.action.close',
      allowedStatus: ['done', 'cancel', 'wait', 'doing', 'pause'],
    },
    { code: T.activate, action: 'activate', i18n: 'task.action.activate', allowedStatus: ['done', 'cancel', 'closed'] },
    { code: T.assign, action: 'assign', i18n: 'task.action.assign', allowedStatus: ['wait', 'doing', 'done', 'pause'] },
    { code: T.edit, action: 'edit', i18n: 'common.action.edit' },
  ],
  statusVisuals: {
    wait: { tone: 'pending', i18n: 'task.status.wait' },
    doing: { tone: 'active', i18n: 'task.status.doing' },
    done: { tone: 'closed', i18n: 'task.status.done' },
    pause: { tone: 'warning', i18n: 'task.status.pause' },
    cancel: { tone: 'neutral', i18n: 'task.status.cancel' },
    closed: { tone: 'closed', i18n: 'task.status.closed' },
  },
}

export const EFFORT_META = {
  domain: 'effort',
  fields: [
    { key: 'workDate', type: 'date', required: true, i18n: 'effort.field.workDate' },
    { key: 'consumedHours', type: 'number', required: true, i18n: 'effort.field.consumed' },
    { key: 'leftHours', type: 'number', i18n: 'effort.field.left' },
    { key: 'work', type: 'text', maxLength: 255, i18n: 'effort.field.work' },
  ],
  list: {
    defaultColumns: ['id', 'account', 'workDate', 'consumedHours', 'leftHours', 'work'],
    defaultSort: '-workDate,-id',
  },
  actions: [],
  statusVisuals: {},
}

export const TASK_META_BY_DOMAIN: Record<string, unknown> = {
  task: TASK_META,
  effort: EFFORT_META,
}

// ── handlers ──

/** 执行可见性闸门：不可见 40302、不存在 40401。 */
function guardExecution(executionId: number): { execution: ProjectView } | { denied: Response } {
  const execution = db.projects.find((item) => item.id === executionId)
  if (!execution || !(EXECUTION_TYPES as readonly string[]).includes(execution.type)) {
    return { denied: notFound() }
  }
  if (!canSeeProject(execution)) {
    return { denied: hidden() }
  }
  return { execution }
}

function guardTask(taskId: number): { task: TaskView } | { denied: Response } {
  const task = db.tasks.find((item) => item.id === taskId)
  if (!task) {
    return { denied: notFound() }
  }
  if (!executionOf(task.executionId)) {
    return { denied: hidden() }
  }
  return { task }
}

/** 创建校验（§3 创建约束）：标题必填、父任务同执行且自身不可再作父 → 42203；失败返回逐项 error 码。 */
type CreateResult = { task: TaskView } | { code: string; message: string; field: string }

function createValues(execution: ProjectView, body: Record<string, unknown>): CreateResult {
  const title = String(body.title ?? '').trim()
  if (title.length === 0) {
    return { code: '42201', message: '任务名称必填。', field: 'title' }
  }
  if (title.length > 255) {
    return { code: '42201', message: '任务名称最多 255 个字符。', field: 'title' }
  }
  const parentId = Number(body.parentId ?? 0)
  const parent = parentId === 0 ? undefined : db.tasks.find((item) => item.id === parentId)
  if (parentId !== 0 && (!parent || parent.executionId !== execution.id)) {
    return { code: '42201', message: '父任务必须属于同一执行。', field: 'parentId' }
  }
  if (parent && parent.parentId !== 0) {
    return { code: '42203', message: '子任务不可再挂子任务（父子仅一层）。', field: 'parentId' }
  }
  return {
    task: {
      id: mockId(),
      executionId: execution.id,
      projectId: execution.parentId,
      storyId: Number(body.storyId ?? 0),
      parentId,
      categoryId: Number(body.categoryId ?? 0),
      title,
      type: (body.type as TaskView['type']) ?? 'devel',
      priority: Number(body.priority ?? 3),
      status: 'wait',
      estimateHours:
        body.estimateHours === undefined || body.estimateHours === null ? null : Number(body.estimateHours),
      consumedHours: 0,
      leftHours: null,
      estStartedDate: (body.estStartedDate as string | null) ?? null,
      deadline: (body.deadline as string | null) ?? null,
      assignee: (body.assignee as string | null) ?? null,
      assignedAt: body.assignee ? now() : null,
      keywords: (body.keywords as string | null) ?? null,
      description: (body.description as string | null) ?? null,
      isParent: false,
      notifyAccounts: (body.notifyAccounts as string[] | undefined) ?? [],
      createdBy: currentAccount()?.account ?? 'system',
      createdAt: now(),
      lockVersion: 0,
    },
  }
}

/** 创建失败 → 单条端点的错误响应（42201 校验 / 42203 条件不满足，03 §6）。 */
function createDenied(result: { code: string; message: string; field: string }): Response {
  return result.code === '42203'
    ? conditionNotMet(result.message)
    : validation(result.message, { [result.field]: 'invalid' })
}

function persistTask(task: TaskView): TaskView {
  db.tasks.push(task)
  if (task.parentId !== 0) {
    const parent = db.tasks.find((item) => item.id === task.parentId)
    if (parent) {
      parent.isParent = true
      parent.updatedAt = now()
    }
  }
  record('task', task.id, 'created')
  return taskDetail(task)
}

function effortPage(taskId: number, url: URL) {
  const q = url.searchParams.get('q')?.toLowerCase()
  const account = url.searchParams.get('filters[account]')
  const me = currentAccount()?.account ?? ''
  let items = db.efforts.filter(
    (effort) =>
      effort.taskId === taskId &&
      matchIn(effort.id, url.searchParams.get('filters[id]')) &&
      matchRange(effort.workDate, url.searchParams.get('filters[workDate]')) &&
      (account === null || (account === '@me' ? effort.account === me : effort.account === account)),
  )
  if (q) {
    items = items.filter((effort) => (effort.work ?? '').toLowerCase().includes(q))
  }
  items = [...items].sort((a, b) => b.workDate.localeCompare(a.workDate) || b.id - a.id)
  return ok(paginate(items, url))
}

export const taskHandlers = [
  // ── 任务列表 / 创建 / 批量创建（执行维度） ──
  http.get('*/api/v1/executions/:executionId/tasks', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([T.view])) {
      return forbidden(T.view)
    }
    const guard = guardExecution(Number(params.executionId))
    if ('denied' in guard) {
      return guard.denied
    }
    const items = taskListOf(new URL(request.url), guard.execution.id).map((task) => ({ ...task, children: null }))
    return ok(paginate(items, new URL(request.url)))
  }),

  http.post('*/api/v1/executions/:executionId/tasks', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([T.create])) {
      return forbidden(T.create)
    }
    const guard = guardExecution(Number(params.executionId))
    if ('denied' in guard) {
      return guard.denied
    }
    if (guard.execution.status === 'closed') {
      return conditionNotMet('执行已关闭，任务只读。')
    }
    const values = createValues(guard.execution, (await request.json()) as Record<string, unknown>)
    if ('code' in values) {
      return createDenied(values)
    }
    return ok(persistTask(values.task))
  }),

  http.post('*/api/v1/executions/:executionId/tasks/batch', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([T.create])) {
      return forbidden(T.create)
    }
    const guard = guardExecution(Number(params.executionId))
    if ('denied' in guard) {
      return guard.denied
    }
    if (guard.execution.status === 'closed') {
      return conditionNotMet('执行已关闭，任务只读。')
    }
    const body = (await request.json()) as { items?: Record<string, unknown>[] }
    const items = body.items ?? []
    if (items.length > 50) {
      return validation('批量创建上限 50 条。')
    }
    const created: (TaskView | null)[] = []
    const results = items.map((item, index) => {
      const parentIndex = item.parentIndex === undefined || item.parentIndex === null ? null : Number(item.parentIndex)
      if (parentIndex !== null && !created[parentIndex]) {
        created.push(null)
        return { index, ok: false, id: null, error: '42203' }
      }
      const values = createValues(guard.execution, {
        ...item,
        parentId: parentIndex === null ? Number(item.parentId ?? 0) : (created[parentIndex]?.id ?? 0),
      })
      if ('code' in values) {
        created.push(null)
        return { index, ok: false, id: null, error: values.code }
      }
      created.push(values.task)
      persistTask(values.task)
      return { index, ok: true, id: values.task.id, error: null }
    })
    return ok({ results })
  }),

  // ── 批量动作（先于 :taskId/:action 注册，避免 /tasks/batch 被动作路由截获） ──
  http.post('*/api/v1/tasks/batch', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    const body = (await request.json()) as { ids?: number[]; action?: string; params?: Record<string, unknown> }
    const action = String(body.action ?? '')
    if (!(BATCH_ACTIONS as readonly string[]).includes(action)) {
      return validation('批量动作不支持 finish/activate。', { action: 'invalid' })
    }
    const perm = action === 'edit' ? T.edit : ACTION_RULES[action]?.perm
    if (!perm || !hasPerm([perm])) {
      return forbidden(perm ?? T.edit)
    }
    const results = (body.ids ?? []).map((id) => {
      const task = findTask(id)
      if (!task) {
        return { id, ok: false, error: '40301' }
      }
      if (executionClosed(task)) {
        return { id, ok: false, error: '42203' }
      }
      if (action === 'edit') {
        const params = body.params ?? {}
        for (const key of [
          'title',
          'type',
          'priority',
          'estimateHours',
          'estStartedDate',
          'deadline',
          'keywords',
          'description',
        ]) {
          if (key in params) {
            ;(task as unknown as Record<string, unknown>)[key] = params[key]
          }
        }
        task.lockVersion += 1
        task.updatedAt = now()
        record('task', id, 'edited')
        return { id, ok: true, error: null }
      }
      const denied = applyAction(task, action, body.params ?? {})
      return denied
        ? { id, ok: false, error: denied.status === 422 ? '42202' : '40301' }
        : { id, ok: true, error: null }
    })
    return ok({ results })
  }),

  // ── 详情 / PATCH ──
  http.get('*/api/v1/tasks/:taskId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([T.view])) {
      return forbidden(T.view)
    }
    const guard = guardTask(Number(params.taskId))
    return 'denied' in guard ? guard.denied : ok(taskDetail(guard.task))
  }),

  http.patch('*/api/v1/tasks/:taskId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([T.edit])) {
      return forbidden(T.edit)
    }
    const guard = guardTask(Number(params.taskId))
    if ('denied' in guard) {
      return guard.denied
    }
    const task = guard.task
    if (executionClosed(task)) {
      return conditionNotMet('执行已关闭，任务只读。')
    }
    const body = (await request.json()) as Record<string, unknown>
    if (body.lockVersion !== undefined && body.lockVersion !== task.lockVersion) {
      return lockConflict()
    }
    if ('consumedHours' in body) {
      return validation('已消耗工时由动作/工时回写，不开放直改。', { consumedHours: 'readonly' })
    }
    const title = body.title === undefined ? task.title : String(body.title).trim()
    if (title.length === 0) {
      return validation('任务名称必填。', { title: 'required' })
    }
    for (const key of [
      'type',
      'priority',
      'categoryId',
      'storyId',
      'estimateHours',
      'estStartedDate',
      'deadline',
      'keywords',
      'description',
      'notifyAccounts',
    ]) {
      if (key in body) {
        ;(task as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    task.title = title
    task.lockVersion += 1
    task.updatedBy = currentAccount()?.account ?? null
    task.updatedAt = now()
    record('task', task.id, 'edited')
    return ok(taskDetail(task))
  }),

  // 软删任务（§5 DELETE）：父任务存在未删子任务 → 42203；删子任务后父已无未删子任务 → 复位 isParent。
  http.delete('*/api/v1/tasks/:taskId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([T.delete])) {
      return forbidden(T.delete)
    }
    const guard = guardTask(Number(params.taskId))
    if ('denied' in guard) {
      return guard.denied
    }
    const task = guard.task
    if (executionClosed(task)) {
      return conditionNotMet('执行已关闭，任务只读。')
    }
    if (db.tasks.some((item) => item.parentId === task.id)) {
      return conditionNotMet('父任务存在未删除的子任务，不能删除。')
    }
    db.tasks = db.tasks.filter((item) => item.id !== task.id)
    if (task.parentId !== 0) {
      const parent = db.tasks.find((item) => item.id === task.parentId)
      if (parent && !db.tasks.some((item) => item.parentId === parent.id)) {
        parent.isParent = false
        parent.updatedAt = now()
      }
    }
    record('task', task.id, 'deleted')
    return ok(null)
  }),

  // ── 工时（先于动作通配注册：/tasks/{id}/efforts 亦为三段路径） ──
  http.get('*/api/v1/tasks/:taskId/efforts', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([T.view])) {
      return forbidden(T.view)
    }
    const guard = guardTask(Number(params.taskId))
    return 'denied' in guard ? guard.denied : effortPage(guard.task.id, new URL(request.url))
  }),

  http.post('*/api/v1/tasks/:taskId/efforts', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([T.effort])) {
      return forbidden(T.effort)
    }
    const guard = guardTask(Number(params.taskId))
    if ('denied' in guard) {
      return guard.denied
    }
    const task = guard.task
    if (executionClosed(task)) {
      return conditionNotMet('执行已关闭，任务只读。')
    }
    if (task.isParent) {
      return stateConflict('父任务工时由子任务合计承载，不可直接登记。')
    }
    if (task.status === 'closed' || task.status === 'cancel') {
      return stateConflict('已关闭/已取消任务不可登记工时。')
    }
    const body = (await request.json()) as Record<string, unknown>
    const consumedHours = Number(body.consumedHours ?? 0)
    if (!(consumedHours > 0)) {
      return validation('本次消耗必须大于 0。', { consumedHours: 'required' })
    }
    const workDate = (body.workDate as string | null) ?? today()
    if (workDate > today()) {
      return validation('工时日期不能晚于今天。', { workDate: 'future' })
    }
    const leftHours = body.leftHours === undefined || body.leftHours === null ? null : Number(body.leftHours)
    const effort: EffortView = {
      id: mockId(),
      taskId: task.id,
      executionId: task.executionId,
      projectId: task.projectId,
      account: currentAccount()?.account ?? 'system',
      workDate,
      consumedHours,
      leftHours,
      work: (body.work as string | null) ?? null,
      createdBy: currentAccount()?.account ?? 'system',
      createdAt: now(),
    }
    db.efforts.push(effort)
    task.consumedHours += consumedHours
    if (leftHours !== null) {
      task.leftHours = leftHours
    }
    task.lockVersion += 1
    task.updatedAt = now()
    record('task', task.id, 'effortRecorded')
    if (leftHours !== null && leftHours <= 0) {
      // leftHours=0 → 自动按 finish 副作用完成（动态流顺序 effortRecorded 在前）
      if (!['done', 'closed', 'cancel'].includes(task.status)) {
        task.status = 'done'
        task.finishedBy = currentAccount()?.account ?? 'system'
        task.finishedAt = now()
        task.startedAt = task.startedAt ?? now()
        task.leftHours = 0
        record('task', task.id, 'finished')
      }
    } else if (task.status === 'wait' && leftHours !== null && leftHours > 0) {
      // wait 任务登记后自动 doing（§4：leftHours>0 时）
      task.status = 'doing'
      task.startedAt = task.startedAt ?? now()
      record('task', task.id, 'started')
    }
    return ok(effort)
  }),

  http.patch('*/api/v1/efforts/:effortId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    const effort = db.efforts.find((item) => item.id === Number(params.effortId))
    if (!effort) {
      return notFound()
    }
    const account = currentAccount()
    if (!hasPerm([T.effortEdit])) {
      return forbidden(T.effortEdit)
    }
    if (effort.account !== account?.account && !account?.groupIds.includes(1)) {
      return forbidden(T.effortEdit)
    }
    const task = findTask(effort.taskId)
    if (!task) {
      return notFound()
    }
    if (executionClosed(task)) {
      return conditionNotMet('执行已关闭，工时只读。')
    }
    const body = (await request.json()) as Record<string, unknown>
    const consumedHours =
      body.consumedHours === undefined || body.consumedHours === null
        ? effort.consumedHours
        : Number(body.consumedHours)
    if (!(consumedHours > 0)) {
      return validation('本次消耗必须大于 0。', { consumedHours: 'required' })
    }
    const workDate = (body.workDate as string | null) ?? effort.workDate
    if (workDate > today()) {
      return validation('工时日期不能晚于今天。', { workDate: 'future' })
    }
    effort.workDate = workDate
    effort.consumedHours = consumedHours
    if ('leftHours' in body) {
      effort.leftHours = body.leftHours === null ? null : Number(body.leftHours)
    }
    if ('work' in body) {
      effort.work = (body.work as string | null) ?? null
    }
    effort.updatedBy = account?.account ?? null
    effort.updatedAt = now()
    recalcTask(task.id)
    record('task', task.id, 'effortEdited')
    return ok(effort)
  }),

  http.delete('*/api/v1/efforts/:effortId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    const effort = db.efforts.find((item) => item.id === Number(params.effortId))
    if (!effort) {
      return notFound()
    }
    const account = currentAccount()
    if (!hasPerm([T.effortDelete])) {
      return forbidden(T.effortDelete)
    }
    if (effort.account !== account?.account && !account?.groupIds.includes(1)) {
      return forbidden(T.effortDelete)
    }
    const task = findTask(effort.taskId)
    if (!task) {
      return notFound()
    }
    if (executionClosed(task)) {
      return conditionNotMet('执行已关闭，工时只读。')
    }
    db.efforts = db.efforts.filter((item) => item.id !== effort.id)
    recalcTask(task.id)
    record('task', task.id, 'effortDeleted')
    return ok(null)
  }),

  // ── 八动作（动作端点不校验 lockVersion；状态外 42202、守卫不满足 42203） ──
  http.post('*/api/v1/tasks/:taskId/:action', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    const action = String(params.action)
    const rule = ACTION_RULES[action]
    if (!rule) {
      return notFound()
    }
    if (!hasPerm([rule.perm])) {
      return forbidden(rule.perm)
    }
    const guard = guardTask(Number(params.taskId))
    if ('denied' in guard) {
      return guard.denied
    }
    if (executionClosed(guard.task)) {
      return conditionNotMet('执行已关闭，任务只读。')
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const denied = applyAction(guard.task, action, body)
    if (denied) {
      return denied
    }
    if (guard.task.parentId !== 0) {
      rollUpParent(guard.task.parentId)
    }
    return ok(taskDetail(guard.task))
  }),

  http.get('*/api/v1/tasks/:taskId/activities', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([T.view])) {
      return forbidden(T.view)
    }
    const guard = guardTask(Number(params.taskId))
    if ('denied' in guard) {
      return guard.denied
    }
    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const beforeId = Number(url.searchParams.get('beforeId') ?? Number.MAX_SAFE_INTEGER)
    const items = db.activities
      .filter(
        (activity) => activity.objectType === 'task' && activity.objectId === guard.task.id && activity.id < beforeId,
      )
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
    return ok({ items, hasMore: items.length === limit })
  }),
]

/** 父子联动（§4）：未取消子任务 doing → 父 doing；全部 done → 父 done；父三件套 = 子合计（cancel 排除）。 */
function rollUpParent(parentId: number): void {
  const parent = db.tasks.find((item) => item.id === parentId)
  if (!parent) {
    return
  }
  const children = db.tasks.filter((item) => item.parentId === parentId)
  const active = children.filter((child) => child.status !== 'cancel')
  const consumed = children
    .filter((child) => child.status !== 'cancel')
    .reduce((sum, child) => sum + child.consumedHours, 0)
  parent.consumedHours = consumed
  parent.estimateHours = children
    .filter((child) => child.status !== 'cancel')
    .reduce((sum, child) => sum + (child.estimateHours ?? 0), 0)
  parent.leftHours = children
    .filter((child) => child.status !== 'cancel' && child.status !== 'closed')
    .reduce((sum, child) => sum + (child.leftHours ?? 0), 0)
  const next: TaskView['status'] = active.some((child) => child.status === 'doing')
    ? 'doing'
    : active.length > 0 && active.every((child) => child.status === 'done')
      ? 'done'
      : parent.status
  if (next !== parent.status) {
    parent.status = next
    record('task', parent.id, 'autoUpdated')
  }
}
