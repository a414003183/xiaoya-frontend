/**
 * workspace 域 MSW handlers（P5 · T-1）：22 端点，逐一对齐 contract/openapi.yaml（tag `workspace`）与 workspace.md §3–§5。
 * 待办（/todos 11 端点，含详情动态流 GET /todos/{id}/activities——B-WKS-05）：列表强制归属 assignee/finishedBy/closedBy=@me（§7）；写动作仅 createdBy/assignee（超管豁免）；
 *   状态机 start(wait→doing)/finish(wait|doing→done)/activate(done|closed→wait 并清 finished/closed 四列)/
 *   close(wait|doing|done→closed)/assign(任意非 closed，本人 → 42203，通知 assignee `todo-assign`)。
 * 我的地盘（/my 5 端点）：role→目标域过滤字段映射（§3.4）并与目标域 DataScope 取交集；非法 role → 40001。
 * 周报/报表（6 端点）：current 幂等重算整行覆写（date 归一到周一）；burn 懒算当日日行；四个固定报表按 §5 结构定型。
 */
import type { BugDistributionReport } from '@zentao/api-client/generated/model/bugDistributionReport'
import type { BurnReport } from '@zentao/api-client/generated/model/burnReport'
import type { CasePassRateReport } from '@zentao/api-client/generated/model/casePassRateReport'
import type { MySummaryView } from '@zentao/api-client/generated/model/mySummaryView'
import type { ProjectView } from '@zentao/api-client/generated/model/projectView'
import type { StorySummaryReport } from '@zentao/api-client/generated/model/storySummaryReport'
import type { TaskSummaryView } from '@zentao/api-client/generated/model/taskSummaryView'
import type { TaskView } from '@zentao/api-client/generated/model/taskView'
import type { TodoView } from '@zentao/api-client/generated/model/todoView'
import type { WeeklyReportView } from '@zentao/api-client/generated/model/weeklyReportView'
import { HttpResponse, http } from 'msw'
import type { TodoRow, WeeklyReportRow } from './db'
import { currentAccount, db, error, FORBIDDEN, mockId, NOT_FOUND, privilegesOf, UNAUTHENTICATED } from './db'
import {
  MY_BUG_ROLE_OPTIONS,
  MY_STORY_ROLE_OPTIONS,
  MY_TASK_ROLE_OPTIONS,
  PRIORITY_OPTIONS,
  TODO_STATUS_OPTIONS,
  TODO_TYPE_DICT_ITEMS,
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
const stateConflict = (message: string) => HttpResponse.json(error(42202, message), { status: 422 })
const conditionNotMet = (message: string) => HttpResponse.json(error(42203, message), { status: 422 })
const lockConflict = () => HttpResponse.json(error(40901, '数据已被他人修改，请刷新后重试。'), { status: 409 })
const notFound = () => HttpResponse.json(NOT_FOUND, { status: 404 })
const hidden = (message: string) => HttpResponse.json(error(40302, message), { status: 403 })

const W = {
  view: 'todo-view',
  create: 'todo-create',
  edit: 'todo-edit',
  start: 'todo-start',
  finish: 'todo-finish',
  activate: 'todo-activate',
  close: 'todo-close',
  assign: 'todo-assign',
  delete: 'todo-delete',
  my: 'my-view',
  weekly: 'weekly-report-view',
  report: 'report-view',
}

const TODO_TYPES = ['custom', 'bug', 'task', 'story', 'epic', 'requirement', 'testRun'] as const
const TODO_ACTIONS: Record<string, { from: string[]; perm: string; activity: string }> = {
  start: { from: ['wait'], perm: W.start, activity: 'started' },
  finish: { from: ['wait', 'doing'], perm: W.finish, activity: 'finished' },
  activate: { from: ['done', 'closed'], perm: W.activate, activity: 'activated' },
  close: { from: ['wait', 'doing', 'done'], perm: W.close, activity: 'closed' },
}
/** PATCH 不可直改字段（§5：status 走状态机、assignee 走 assign，动作落列字段由动作维护）。 */
const TODO_IMMUTABLE_KEYS = ['status', 'assignee', 'assignedBy', 'assignedAt', 'finishedBy', 'closedBy', 'deletedAt']
const TIME_PATTERN = /^\d{2}:\d{2}$/
const EXECUTION_TYPES = ['sprint', 'stage', 'kanban'] as const
const DAY_MS = 86_400_000

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

const now = () => new Date().toISOString()
const today = () => new Date().toISOString().slice(0, 10)
const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * meta 域 `todo`（platform `GET /meta/{domain}` 消费；字段/动作与 backend WorkspaceRegistrar + workflow/todo.yml 同源）。
 * 动作顺序 = YAML 声明顺序；allowedStatus = from 集（assign 为「任意非 closed」的补集）。
 */
export const WORKSPACE_META_BY_DOMAIN: Record<string, unknown> = {
  todo: {
    domain: 'todo',
    fields: [
      { key: 'title', type: 'text', required: true, maxLength: 150, i18n: 'todo.field.title' },
      {
        key: 'type',
        type: 'select',
        required: true,
        i18n: 'todo.field.type',
        source: 'todoType',
        options: TODO_TYPE_DICT_ITEMS,
      },
      { key: 'objectId', type: 'select', i18n: 'todo.field.object' },
      { key: 'date', type: 'date', i18n: 'todo.field.date' },
      { key: 'beginTime', type: 'text', maxLength: 5, i18n: 'todo.field.begin' },
      { key: 'endTime', type: 'text', maxLength: 5, i18n: 'todo.field.end' },
      { key: 'priority', type: 'select', required: true, i18n: 'common.priority', options: PRIORITY_OPTIONS },
      { key: 'status', type: 'select', i18n: 'common.field.status', options: TODO_STATUS_OPTIONS },
      { key: 'description', type: 'richtext', i18n: 'todo.field.description' },
      { key: 'isPrivate', type: 'checkbox', i18n: 'todo.field.isPrivate' },
      { key: 'assignee', type: 'account', required: true, i18n: 'todo.field.assignee', source: 'accounts' },
    ],
    list: { defaultColumns: ['id', 'title', 'type', 'priority', 'status', 'date', 'assignee'], defaultSort: '-id' },
    actions: [
      { code: 'todo-start', action: 'start', i18n: 'todo.action.start', allowedStatus: ['wait'] },
      { code: 'todo-finish', action: 'finish', i18n: 'todo.action.finish', allowedStatus: ['wait', 'doing'] },
      { code: 'todo-activate', action: 'activate', i18n: 'todo.action.activate', allowedStatus: ['done', 'closed'] },
      { code: 'todo-close', action: 'close', i18n: 'todo.action.close', allowedStatus: ['wait', 'doing', 'done'] },
      { code: 'todo-assign', action: 'assign', i18n: 'todo.action.assign', allowedStatus: ['wait', 'doing', 'done'] },
    ],
    statusVisuals: {
      wait: { tone: 'pending', i18n: 'todo.status.wait' },
      doing: { tone: 'active', i18n: 'todo.status.doing' },
      done: { tone: 'active', i18n: 'todo.status.done' },
      closed: { tone: 'closed', i18n: 'todo.status.closed' },
    },
  },
  // /my/* 的 role 值域（§3.4）：字段名 taskRole/bugRole/storyRole 对应 /my/tasks|bugs|stories。
  workspace: {
    domain: 'workspace',
    fields: [
      { key: 'taskRole', type: 'select', i18n: 'workspace.title.myTasks', options: MY_TASK_ROLE_OPTIONS },
      { key: 'bugRole', type: 'select', i18n: 'workspace.title.myBugs', options: MY_BUG_ROLE_OPTIONS },
      { key: 'storyRole', type: 'select', i18n: 'workspace.title.myStories', options: MY_STORY_ROLE_OPTIONS },
    ],
    list: { defaultColumns: [], defaultSort: '-id' },
    actions: [],
    statusVisuals: {},
  },
}

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

/** 日期过滤：单值精确匹配 / a..b 区间 / @null（待定日期，契约 filters[date]「日期或区间」）。 */
function matchDate(value: unknown, filter: string | null): boolean {
  if (!filter) {
    return true
  }
  if (filter === '@null' || filter === '@notNull') {
    return matchValue(value, filter)
  }
  if (filter.includes('..')) {
    return matchRange(value, filter)
  }
  return String(value ?? '') === filter
}

/** 布尔过滤：契约 filters[isPrivate] 传 1/0。 */
function matchBool(value: unknown, filter: string | null): boolean {
  if (!filter) {
    return true
  }
  return (filter === '1') === (value === true)
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

function deletedAtOf(item: unknown): string | null {
  return (item as { deletedAt?: string | null }).deletedAt ?? null
}

// ── Todo 视图、归属与写权（§7） ──

function objectTitleOf(todo: TodoRow): string | null {
  if (todo.type === 'custom' || todo.objectId === 0) {
    return null
  }
  if (todo.type === 'task') {
    return db.tasks.find((item) => item.id === todo.objectId)?.title ?? null
  }
  if (todo.type === 'bug') {
    return db.bugs.find((item) => item.id === todo.objectId)?.title ?? null
  }
  if (todo.type === 'epic' || todo.type === 'requirement' || todo.type === 'story') {
    return db.stories.find((item) => item.id === todo.objectId)?.title ?? null
  }
  return db.testRuns.find((item) => item.id === todo.objectId)?.name ?? null
}

function objectExists(type: string, objectId: number): boolean {
  if (type === 'task') {
    return db.tasks.some((item) => item.id === objectId)
  }
  if (type === 'bug') {
    return db.bugs.some((item) => item.id === objectId)
  }
  if (type === 'epic' || type === 'requirement' || type === 'story') {
    return db.stories.some((item) => item.id === objectId)
  }
  return db.testRuns.some((item) => item.id === objectId)
}

/** 详情可读：isPrivate=false 持码可读；isPrivate=true 仅 createdBy/assignee/超管（§7）。 */
function todoReadable(todo: TodoRow): boolean {
  const account = currentAccount()
  if (!account || todo.deletedAt) {
    return false
  }
  if (account.groupIds.includes(1)) {
    return true
  }
  const me = account.account
  if (!todo.isPrivate) {
    return true
  }
  return todo.createdBy === me || todo.assignee === me
}

/** 写动作（PATCH/状态机/assign）仅 createdBy/assignee 可发，其余 → 40302；超管豁免（§7）。 */
function todoWritable(todo: TodoRow): boolean {
  const account = currentAccount()
  if (!account || todo.deletedAt) {
    return false
  }
  if (account.groupIds.includes(1)) {
    return true
  }
  const me = account.account
  return todo.createdBy === me || todo.assignee === me
}

/** 列表归属（§7）：强制 (assignee OR finishedBy OR closedBy)=@me，不暴露他人待办枚举。 */
function ownedByMe(todo: TodoRow, me: string): boolean {
  return todo.assignee === me || todo.finishedBy === me || todo.closedBy === me
}

function todoView(todo: TodoRow): TodoView {
  const { deletedAt: _deletedAt, ...view } = todo
  return { ...view, objectTitle: objectTitleOf(todo) }
}

// ── Todo 入参校验（§3.1） ──

/** 合并当前值后逐字段校验；返回字段级错误，null 表示通过。 */
function validateTodo(body: Record<string, unknown>, current?: TodoRow): { message: string; field: string } | null {
  if (current === undefined && (body.title === undefined || body.title === null)) {
    return { message: '标题必填。', field: 'title' }
  }
  if (body.title !== undefined && body.title !== null) {
    const title = String(body.title).trim()
    if (title.length === 0 || title.length > 150) {
      return { message: '标题必填且不超过 150 字。', field: 'title' }
    }
  }
  const type = body.type === undefined || body.type === null ? (current?.type ?? 'custom') : String(body.type)
  if (!(TODO_TYPES as readonly string[]).includes(type)) {
    return { message: 'type 非法。', field: 'type' }
  }
  const objectId =
    body.objectId === undefined || body.objectId === null ? (current?.objectId ?? 0) : Number(body.objectId)
  if (type !== 'custom' && (objectId === 0 || !objectExists(type, objectId))) {
    return { message: 'type≠custom 时 objectId 必填且对象存在。', field: 'objectId' }
  }
  const priority =
    body.priority === undefined || body.priority === null ? (current?.priority ?? 3) : Number(body.priority)
  if (priority < 1 || priority > 4) {
    return { message: 'priority 取值 1–4。', field: 'priority' }
  }
  const beginTime = body.beginTime === undefined ? (current?.beginTime ?? null) : (body.beginTime as string | null)
  const endTime = body.endTime === undefined ? (current?.endTime ?? null) : (body.endTime as string | null)
  if (beginTime && !TIME_PATTERN.test(beginTime)) {
    return { message: 'beginTime 格式 HH:mm。', field: 'beginTime' }
  }
  if (endTime && !TIME_PATTERN.test(endTime)) {
    return { message: 'endTime 格式 HH:mm。', field: 'endTime' }
  }
  if (beginTime && endTime && endTime <= beginTime) {
    return { message: 'endTime 必须晚于 beginTime。', field: 'endTime' }
  }
  const assignee =
    body.assignee === undefined || body.assignee === null
      ? (current?.assignee ?? currentAccount()?.account ?? '')
      : String(body.assignee)
  if (!db.accounts.some((account) => account.account === assignee)) {
    return { message: 'assignee 账号不存在。', field: 'assignee' }
  }
  return null
}

function newTodo(body: Record<string, unknown>): TodoRow {
  const account = currentAccount()?.account ?? 'system'
  return {
    id: mockId(),
    title: String(body.title ?? '').trim(),
    type: (body.type as TodoRow['type'] | undefined) ?? 'custom',
    objectId: Number(body.objectId ?? 0),
    // date 缺省今天；显式 null = 待定日期（§3.1），不可被 ?? 吞掉
    date: body.date === undefined ? today() : (body.date as string | null),
    beginTime: (body.beginTime as string | null | undefined) ?? null,
    endTime: (body.endTime as string | null | undefined) ?? null,
    priority: Number(body.priority ?? 3),
    description: (body.description as string | null | undefined) ?? null,
    status: 'wait',
    isPrivate: body.isPrivate === true,
    assignee: (body.assignee as string | undefined) ?? account,
    assignedBy: null,
    assignedAt: null,
    finishedBy: null,
    finishedAt: null,
    closedBy: null,
    closedAt: null,
    createdBy: account,
    createdAt: now(),
    updatedBy: null,
    updatedAt: null,
    lockVersion: 0,
    deletedAt: null,
  }
}

/** 动作失败原因：code 用于批量逐项 error，message 用于单体响应。 */
type TodoActionFailure = { code: number; message: string; field?: string }

function todoActionFailureResponse(failure: TodoActionFailure): Response {
  if (failure.code === 40001) {
    return badRequest(failure.message)
  }
  if (failure.code === 42202) {
    return stateConflict(failure.message)
  }
  if (failure.code === 42203) {
    return conditionNotMet(failure.message)
  }
  return validation(failure.message, failure.field ? { [failure.field]: 'invalid' } : undefined)
}

/**
 * 状态机与 assign（§4）：逐项套用，单体与批量共用；返回 null 表示成功。
 * assign 通知 type 遵循 platform `<domain>-<action>` 约定（platform.md §4.2）→ todo-assign。
 */
function runTodoAction(todo: TodoRow, action: string, params: Record<string, unknown>): TodoActionFailure | null {
  const actor = currentAccount()?.account ?? 'system'
  const comment = (params.comment as string | null) ?? null
  if (action === 'assign') {
    const assignee = String(params.assignee ?? '')
    if (!assignee) {
      return { code: 42201, message: 'assignee 必填。', field: 'assignee' }
    }
    if (!db.accounts.some((account) => account.account === assignee)) {
      return { code: 42201, message: '账号不存在。', field: 'assignee' }
    }
    if (todo.status === 'closed') {
      return { code: 42202, message: '已关闭的待办不可指派。' }
    }
    if (assignee === actor) {
      return { code: 42203, message: '不能指派给当前账号。' }
    }
    todo.assignee = assignee
    todo.assignedBy = actor
    todo.assignedAt = now()
    todo.lockVersion += 1
    record('todo', todo.id, 'assigned', comment)
    notify(assignee, 'todo-assign', 'todo', todo.id, todo.title)
    return null
  }
  const rule = TODO_ACTIONS[action]
  if (!rule) {
    return { code: 40001, message: 'action 取值 start|finish|activate|close|assign。' }
  }
  if (!rule.from.includes(todo.status)) {
    return { code: 42202, message: `当前状态 ${todo.status} 不允许执行 ${action}。` }
  }
  if (action === 'start') {
    todo.status = 'doing'
  } else if (action === 'finish') {
    todo.status = 'done'
    todo.finishedBy = actor
    todo.finishedAt = now()
  } else if (action === 'activate') {
    // 激活清空 finished/closed 四列（§4 副作用）
    todo.status = 'wait'
    todo.finishedBy = null
    todo.finishedAt = null
    todo.closedBy = null
    todo.closedAt = null
  } else if (action === 'close') {
    todo.status = 'closed'
    todo.closedBy = actor
    todo.closedAt = now()
  }
  todo.lockVersion += 1
  record('todo', todo.id, rule.activity, comment)
  return null
}

// ── /my 聚合（§3.4、§7） ──

/** role → 目标域过滤字段映射真源（workspace §3.4）。 */
const MY_ROLE_FIELDS: Record<string, Record<string, string>> = {
  tasks: { assignee: 'assignee', creator: 'createdBy', finisher: 'finishedBy', closer: 'closedBy' },
  bugs: { assignee: 'assignee', creator: 'createdBy', resolver: 'resolvedBy', closer: 'closedBy' },
  // requirement 域视图无 reviewedBy 列，只有 reviewers 列表：reviewer 角色按列表包含判定
  stories: { assignee: 'assignee', creator: 'createdBy', reviewer: 'reviewers', closer: 'closedBy' },
}

function roleMatches(item: Record<string, unknown>, field: string, me: string): boolean {
  if (field === 'reviewers') {
    return ((item.reviewers as string[] | undefined) ?? []).includes(me)
  }
  return String(item[field] ?? '') === me
}

function resolveRole(kind: string, url: URL): { field: string } | { denied: Response } {
  const role = url.searchParams.get('role') ?? 'assignee'
  const field = MY_ROLE_FIELDS[kind]?.[role]
  if (!field) {
    return { denied: badRequest(`role 取值 ${Object.keys(MY_ROLE_FIELDS[kind] ?? {}).join('|')}。`) }
  }
  return { field }
}

function visibleExecutionOf(executionId: number): ProjectView | undefined {
  const execution = db.projects.find((item) => item.id === executionId)
  return execution && (EXECUTION_TYPES as readonly string[]).includes(execution.type) && canSeeProject(execution)
    ? execution
    : undefined
}

function guardProject(projectId: number): { project: ProjectView } | { denied: Response } {
  const project = db.projects.find((item) => item.id === projectId)
  if (!project) {
    return { denied: notFound() }
  }
  if (!canSeeProject(project)) {
    return { denied: hidden('无权访问该项目。') }
  }
  return { project }
}

// ── 周报 EVM / 燃尽（§3.2、§3.3、§5） ──

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** date 归一到所在周周一（缺省今天，§5 current）。 */
function mondayOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, day === 0 ? -6 : 1 - day)
}

/** 工作日口径：周一至周五（phase-5 前置 3：org 域节假日未定义前恒按工作日）。 */
function weekdayCount(from: string, to: string): number {
  if (to < from) {
    return 0
  }
  let count = 0
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay()
    if (day !== 0 && day !== 6) {
      count += 1
    }
  }
  return count
}

/** 项目下全部未删执行的非父任务（排除 status=cancel，§3.2 EVM 统计范围）。 */
function evmTasks(projectId: number): TaskView[] {
  const executionIds = db.projects
    .filter((item) => (EXECUTION_TYPES as readonly string[]).includes(item.type) && item.parentId === projectId)
    .map((item) => item.id)
  return db.tasks.filter(
    (task) => executionIds.includes(task.executionId) && !task.isParent && task.status !== 'cancel',
  )
}

function taskSummaryOf(task: TaskView): TaskSummaryView {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee ?? null,
    estimateHours: task.estimateHours ?? 0,
    consumedHours: task.consumedHours,
    leftHours: task.leftHours ?? 0,
    beginDate: task.estStartedDate ?? null,
    endDate: task.deadline ?? null,
  }
}

/** current 端点：幂等重算并整行覆写（同旧 dao replace 语义，§3.2）。 */
function recomputeWeekly(projectId: number, weekStart: string): WeeklyReportRow {
  const weekEnd = addDays(weekStart, 6)
  const tasks = evmTasks(projectId)
  let pv = 0
  let ev = 0
  const workload: Record<string, number> = {}
  for (const task of tasks) {
    const estimate = task.estimateHours ?? 0
    const beginDate = task.estStartedDate ?? null
    const endDate = task.deadline ?? null
    let planned = 0
    if (endDate && endDate <= weekEnd) {
      planned = estimate
    } else if (beginDate && beginDate <= weekEnd && endDate && endDate > weekEnd) {
      // 跨周任务按实际工作日占比折算：本周工作日数 / 全程工作日数
      const total = weekdayCount(beginDate, endDate)
      const elapsed = weekdayCount(beginDate > weekStart ? beginDate : weekStart, weekEnd)
      planned = total > 0 ? (elapsed / total) * estimate : 0
    }
    pv += planned
    if (planned > 0) {
      workload[task.type] = round2((workload[task.type] ?? 0) + planned)
    }
    if (task.status === 'done') {
      ev += estimate
    } else {
      const denominator = task.consumedHours + (task.leftHours ?? 0)
      const progress = denominator > 0 ? (task.consumedHours / denominator) * 100 : 0
      ev += (estimate * progress) / 100
    }
  }
  const executionIds = db.projects
    .filter((item) => (EXECUTION_TYPES as readonly string[]).includes(item.type) && item.parentId === projectId)
    .map((item) => item.id)
  const efforts = db.efforts.filter((effort) => executionIds.includes(effort.executionId) && effort.workDate <= weekEnd)
  const ac = efforts.reduce((sum, effort) => sum + effort.consumedHours, 0)
  const staff = new Set(efforts.filter((effort) => effort.workDate >= weekStart).map((effort) => effort.account)).size
  return {
    id: 0,
    projectId,
    weekStart,
    pv: round2(pv),
    ev: round2(ev),
    ac: round2(ac),
    sv: pv === 0 ? 0 : round2(-(1 - ev / pv) * 100),
    cv: ac === 0 ? 0 : round2(-(1 - ev / ac) * 100),
    staff,
    workload,
    updatedAt: now(),
  }
}

/** 结论纯文本（\n 分隔，前端禁 HTML 注入）；阈值 −10/10 为本期固定口径。 */
function analysisText(sv: number, cv: number): string {
  const lines = [`进度偏差 ${sv.toFixed(1)}%，成本偏差 ${cv.toFixed(1)}%。`]
  if (sv <= -10) {
    lines.push('进度落后于计划，请关注延期任务。')
  } else if (sv >= 10) {
    lines.push('进度领先于计划。')
  }
  if (cv <= -10) {
    lines.push('成本超支，请核对工时投入。')
  } else if (cv >= 10) {
    lines.push('成本节余。')
  }
  return lines.join('\n')
}

/** 读侧现算视图（§3.2）：weekSN/weekEnd/analysis + 三张任务摘要表。 */
function weeklyView(row: WeeklyReportRow): WeeklyReportView {
  const project = db.projects.find((item) => item.id === row.projectId)
  const weekEnd = addDays(row.weekStart, 6)
  const nextWeekEnd = addDays(weekEnd, 7)
  const tasks = evmTasks(row.projectId)
  const inWeek = (date: string | null | undefined): boolean =>
    date !== null && date !== undefined && date >= row.weekStart && date <= weekEnd
  const live = (task: TaskView) => !['done', 'closed', 'cancel'].includes(task.status)
  const finished = tasks.filter((task) => task.status === 'done' && inWeek(task.finishedAt?.slice(0, 10)))
  const postponed = tasks.filter((task) => live(task) && inWeek(task.deadline))
  const nextWeek = tasks.filter(
    (task) =>
      live(task) &&
      task.deadline !== null &&
      task.deadline !== undefined &&
      task.deadline > weekEnd &&
      task.deadline <= nextWeekEnd,
  )
  const weekSN = project?.beginDate
    ? Math.max(
        Math.floor(
          (Date.parse(`${row.weekStart}T00:00:00Z`) - Date.parse(`${project.beginDate}T00:00:00Z`)) / (7 * DAY_MS),
        ) + 1,
        1,
      )
    : 1
  return {
    ...row,
    weekSN,
    weekEnd,
    analysis: analysisText(row.sv, row.cv),
    finished: finished.map(taskSummaryOf),
    postponed: postponed.map(taskSummaryOf),
    nextWeek: nextWeek.map(taskSummaryOf),
  }
}

function guardExecution(executionId: number): { execution: ProjectView } | { denied: Response } {
  const execution = db.projects.find((item) => item.id === executionId)
  if (!execution || !(EXECUTION_TYPES as readonly string[]).includes(execution.type)) {
    return { denied: notFound() }
  }
  if (!canSeeProject(execution)) {
    return { denied: hidden('无权访问该执行。') }
  }
  return { execution }
}

/** 当日执行级日行缺失时懒算落库（逐任务 + taskId=0 汇总行，§3.3）。 */
function ensureTodayBurnRows(executionId: number, date: string): void {
  if (db.burns.some((row) => row.executionId === executionId && row.burnDate === date && row.taskId === 0)) {
    return
  }
  const tasks = db.tasks.filter((task) => task.executionId === executionId)
  let estimateHours = 0
  let consumedHours = 0
  let leftHours = 0
  for (const task of tasks) {
    estimateHours += task.estimateHours ?? 0
    consumedHours += task.consumedHours
    leftHours += task.leftHours ?? 0
    if (!db.burns.some((row) => row.executionId === executionId && row.burnDate === date && row.taskId === task.id)) {
      db.burns.push({
        id: mockId(),
        executionId,
        burnDate: date,
        taskId: task.id,
        estimateHours: round2(task.estimateHours ?? 0),
        consumedHours: round2(task.consumedHours),
        leftHours: round2(task.leftHours ?? 0),
        storyPoint: 0,
      })
    }
  }
  db.burns.push({
    id: mockId(),
    executionId,
    burnDate: date,
    taskId: 0,
    estimateHours: round2(estimateHours),
    consumedHours: round2(consumedHours),
    leftHours: round2(leftHours),
    storyPoint: 0,
  })
}

function burnReport(execution: ProjectView): BurnReport {
  const beginDate = execution.beginDate ?? today()
  let endDate = execution.endDate ?? today()
  if (endDate < beginDate) {
    endDate = beginDate
  }
  // 窗口 = 执行起止日；上限 400 天防御异常长执行（ponytail：不做分页，超长执行截断）
  const dates: string[] = []
  for (let date = beginDate; date <= endDate && dates.length < 400; date = addDays(date, 1)) {
    dates.push(date)
  }
  if (dates.includes(today())) {
    ensureTodayBurnRows(execution.id, today())
  }
  const rows = dates.map((date) =>
    db.burns.find((row) => row.executionId === execution.id && row.burnDate === date && row.taskId === 0),
  )
  const firstRow = rows.find((row) => row !== undefined)
  const currentLeft = db.tasks
    .filter((task) => task.executionId === execution.id)
    .reduce((sum, task) => sum + (task.leftHours ?? 0), 0)
  let last = firstRow?.leftHours ?? currentLeft
  // 缺失日沿用上值（§5）
  const remaining = dates.map((_, index) => {
    const row = rows[index]
    if (row) {
      last = row.leftHours
    }
    return round2(last)
  })
  const total = remaining[0] ?? 0
  const ideal = dates.map((_, index) => (dates.length === 1 ? 0 : round2(total * (1 - index / (dates.length - 1)))))
  return { beginDate, endDate, dates, ideal, remaining }
}

function groupCount<K extends string | number, T>(items: T[], keyOf: (item: T) => K): { key: K; count: number }[] {
  const map = new Map<K, number>()
  for (const item of items) {
    const key = keyOf(item)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()].map(([key, count]) => ({ key, count }))
}

// ── handlers ──

export const workspaceHandlers = [
  // ── 待办：列表 / 创建 / 批量（workspace §5 /todos 族） ──

  http.get('*/api/v1/todos', ({ request }) => {
    const account = currentAccount()
    if (!account) {
      return unauthorized()
    }
    if (!hasPerm([W.view])) {
      return forbidden(W.view)
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const me = account.account
    let items = db.todos.filter(
      (todo) =>
        !todo.deletedAt &&
        ownedByMe(todo, me) && // 归属强制（§7）
        matchIn(todo.status, url.searchParams.get('filters[status]')) &&
        matchIn(todo.type, url.searchParams.get('filters[type]')) &&
        matchIn(todo.priority, url.searchParams.get('filters[priority]')) &&
        matchDate(todo.date, url.searchParams.get('filters[date]')) &&
        matchAccount(todo.assignee, url.searchParams.get('filters[assignee]')) &&
        matchAccount(todo.createdBy, url.searchParams.get('filters[createdBy]')) &&
        matchBool(todo.isPrivate, url.searchParams.get('filters[isPrivate]')) &&
        matchIn(todo.id, url.searchParams.get('filters[id]')),
    )
    if (q) {
      items = items.filter((todo) => todo.title.toLowerCase().includes(q))
    }
    const sorted = sortBy(
      items as unknown as Record<string, unknown>[],
      url.searchParams.get('sort'),
      ['id', 'date', 'priority', 'beginTime', 'createdAt'],
      (a, b) => {
        const left = (a as unknown as TodoRow).date ?? ''
        const right = (b as unknown as TodoRow).date ?? ''
        return left.localeCompare(right) || Number((a as unknown as TodoRow).id) - Number((b as unknown as TodoRow).id)
      },
    ) as unknown as TodoRow[]
    return ok(paginate(sorted.map(todoView), url))
  }),

  http.post('*/api/v1/todos', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([W.create])) {
      return forbidden(W.create)
    }
    const body = (await request.json()) as Record<string, unknown>
    const invalid = validateTodo(body)
    if (invalid) {
      return validation(invalid.message, { [invalid.field]: 'invalid' })
    }
    const todo = newTodo(body)
    db.todos.push(todo)
    record('todo', todo.id, 'created')
    return ok(todoView(todo))
  }),

  http.post('*/api/v1/todos/batch', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    const body = (await request.json()) as {
      items?: Record<string, unknown>[]
      ids?: number[]
      action?: string
      params?: Record<string, unknown>
    }
    // 批量创建：items ≤50，逐项校验（§5）
    if (body.items) {
      if (!hasPerm([W.create])) {
        return forbidden(W.create)
      }
      if (body.items.length > 50) {
        return badRequest('批量创建上限 50 条。')
      }
      const results = body.items.map((item, index) => {
        const invalid = validateTodo(item)
        if (invalid) {
          return { index, id: null, ok: false, error: '42201' }
        }
        const todo = newTodo(item)
        db.todos.push(todo)
        record('todo', todo.id, 'created')
        return { index, id: todo.id, ok: true, error: null }
      })
      return ok({ results })
    }
    // 批量动作：ids + action + params，逐项套用 §4 门禁与 §7 写权；逐项成败互不影响
    const action = String(body.action ?? '')
    const perm = action === 'assign' ? W.assign : TODO_ACTIONS[action]?.perm
    if (!perm) {
      return badRequest('action 取值 start|finish|activate|close|assign。')
    }
    if (!hasPerm([perm])) {
      return forbidden(perm)
    }
    const params = body.params ?? {}
    const results = (body.ids ?? []).map((id) => {
      const todo = db.todos.find((item) => item.id === id && !item.deletedAt)
      if (!todo) {
        return { id, ok: false, error: '40401' }
      }
      if (!todoWritable(todo)) {
        return { id, ok: false, error: '40302' }
      }
      const failure = runTodoAction(todo, action, params)
      return failure ? { id, ok: false, error: String(failure.code) } : { id, ok: true, error: null }
    })
    return ok({ results })
  }),

  // ── 待办：详情 / 部分更新（§5） ──

  http.get('*/api/v1/todos/:todoId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([W.view])) {
      return forbidden(W.view)
    }
    const todo = db.todos.find((item) => item.id === Number(params.todoId))
    if (!todo || todo.deletedAt) {
      return notFound()
    }
    if (!todoReadable(todo)) {
      return hidden('无权访问该待办。')
    }
    return ok(todoView(todo))
  }),

  // 待办动态流（B-WKS-05 / workspace §5：游标倒序；可见性与详情同门禁）
  http.get('*/api/v1/todos/:todoId/activities', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([W.view])) {
      return forbidden(W.view)
    }
    const todo = db.todos.find((item) => item.id === Number(params.todoId))
    if (!todo || todo.deletedAt) {
      return notFound()
    }
    if (!todoReadable(todo)) {
      return hidden('无权访问该待办。')
    }
    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const beforeId = Number(url.searchParams.get('beforeId') ?? Number.MAX_SAFE_INTEGER)
    const items = db.activities
      .filter((activity) => activity.objectType === 'todo' && activity.objectId === todo.id && activity.id < beforeId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
    return ok({ items, hasMore: items.length === limit })
  }),

  http.patch('*/api/v1/todos/:todoId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([W.edit])) {
      return forbidden(W.edit)
    }
    const todo = db.todos.find((item) => item.id === Number(params.todoId))
    if (!todo || todo.deletedAt) {
      return notFound()
    }
    if (!todoWritable(todo)) {
      return hidden('仅创建人/执行人可修改该待办。')
    }
    const body = (await request.json()) as Record<string, unknown>
    if (TODO_IMMUTABLE_KEYS.some((key) => key in body)) {
      return badRequest('status/assignee 由状态机与指派动作维护，不可直改。')
    }
    if (body.lockVersion !== undefined && body.lockVersion !== todo.lockVersion) {
      return lockConflict()
    }
    const invalid = validateTodo(body, todo)
    if (invalid) {
      return validation(invalid.message, { [invalid.field]: 'invalid' })
    }
    for (const key of [
      'title',
      'type',
      'objectId',
      'date',
      'beginTime',
      'endTime',
      'priority',
      'description',
      'isPrivate',
    ]) {
      if (key in body) {
        ;(todo as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    todo.title = todo.title.trim()
    todo.updatedBy = currentAccount()?.account ?? null
    todo.updatedAt = now()
    todo.lockVersion += 1
    record('todo', todo.id, 'edited')
    return ok(todoView(todo))
  }),

  // 软删待办（§5 DELETE）：仅 createdBy/assignee/超管，他人 → 40302。
  http.delete('*/api/v1/todos/:todoId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([W.delete])) {
      return forbidden(W.delete)
    }
    const todo = db.todos.find((item) => item.id === Number(params.todoId))
    if (!todo || todo.deletedAt) {
      return notFound()
    }
    if (!todoWritable(todo)) {
      return hidden('仅待办的创建人或负责人可操作。')
    }
    todo.deletedAt = now()
    record('todo', todo.id, 'deleted')
    return ok(null)
  }),

  // ── 待办：start / finish / activate / close（§4 五动作） ──

  ...(['start', 'finish', 'activate', 'close'] as const).map((action) =>
    http.post(`*/api/v1/todos/:todoId/${action}`, async ({ params, request }) => {
      if (!currentAccount()) {
        return unauthorized()
      }
      if (!hasPerm([TODO_ACTIONS[action]?.perm ?? W.edit])) {
        return forbidden(TODO_ACTIONS[action]?.perm ?? W.edit)
      }
      const todo = db.todos.find((item) => item.id === Number(params.todoId))
      if (!todo || todo.deletedAt) {
        return notFound()
      }
      if (!todoWritable(todo)) {
        return hidden('仅创建人/执行人可执行该动作。')
      }
      const body = (await request.json().catch(() => ({}))) as { comment?: string | null }
      const failure = runTodoAction(todo, action, body)
      return failure ? todoActionFailureResponse(failure) : ok(todoView(todo))
    }),
  ),

  // ── 待办：assign（§4；本人 → 42203，通知 assignee） ──

  http.post('*/api/v1/todos/:todoId/assign', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([W.assign])) {
      return forbidden(W.assign)
    }
    const todo = db.todos.find((item) => item.id === Number(params.todoId))
    if (!todo || todo.deletedAt) {
      return notFound()
    }
    if (!todoWritable(todo)) {
      return hidden('仅创建人/执行人可指派该待办。')
    }
    const body = (await request.json()) as { assignee?: string; comment?: string | null }
    const failure = runTodoAction(todo, 'assign', body)
    return failure ? todoActionFailureResponse(failure) : ok(todoView(todo))
  }),

  // ── 我的地盘：计数与四类列表（§3.4、§5 /my 族） ──

  http.get('*/api/v1/my/summary', () => {
    const account = currentAccount()
    if (!account) {
      return unauthorized()
    }
    if (!hasPerm([W.my])) {
      return forbidden(W.my)
    }
    const me = account.account
    // 四计数固定 role=assignee 口径（§3.4），并与目标域 DataScope 取交集
    const summary: MySummaryView = {
      todoCount: db.todos.filter(
        (todo) => !todo.deletedAt && todo.assignee === me && ['wait', 'doing'].includes(todo.status),
      ).length,
      taskCount: db.tasks.filter(
        (task) =>
          task.assignee === me &&
          !['done', 'closed', 'cancel'].includes(task.status) &&
          visibleExecutionOf(task.executionId) !== undefined,
      ).length,
      bugCount: db.bugs.filter(
        (bug) => bug.assignee === me && bug.status === 'active' && visibleProduct(bug.productId) !== undefined,
      ).length,
      storyCount: db.stories.filter(
        (story) =>
          story.assignee === me &&
          !['closed', 'draft'].includes(story.status) &&
          visibleProduct(story.productId) !== undefined,
      ).length,
    }
    return ok(summary)
  }),

  http.get('*/api/v1/my/tasks', ({ request }) => {
    const account = currentAccount()
    if (!account) {
      return unauthorized()
    }
    if (!hasPerm([W.my])) {
      return forbidden(W.my)
    }
    const url = new URL(request.url)
    const resolved = resolveRole('tasks', url)
    if ('denied' in resolved) {
      return resolved.denied
    }
    const me = account.account
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.tasks.filter(
      (task) =>
        visibleExecutionOf(task.executionId) !== undefined && // 与 task 域 DataScope 交集
        roleMatches(task as unknown as Record<string, unknown>, resolved.field, me) &&
        matchIn(task.status, url.searchParams.get('filters[status]')) &&
        matchValue(task.executionId, url.searchParams.get('filters[executionId]')) &&
        matchValue(task.projectId, url.searchParams.get('filters[projectId]')) &&
        matchIn(task.priority, url.searchParams.get('filters[priority]')) &&
        matchIn(task.type, url.searchParams.get('filters[type]')) &&
        matchRange(task.deadline, url.searchParams.get('filters[deadline]')),
    )
    if (q) {
      items = items.filter((task) => `${task.title}${task.keywords ?? ''}`.toLowerCase().includes(q))
    }
    const sorted = sortBy(
      items as unknown as Record<string, unknown>[],
      url.searchParams.get('sort'),
      ['id', 'priority', 'deadline', 'createdAt', 'title'],
      (a, b) => Number((a as unknown as TaskView).id) - Number((b as unknown as TaskView).id),
    ) as unknown as TaskView[]
    return ok(paginate(sorted, url))
  }),

  http.get('*/api/v1/my/bugs', ({ request }) => {
    const account = currentAccount()
    if (!account) {
      return unauthorized()
    }
    if (!hasPerm([W.my])) {
      return forbidden(W.my)
    }
    const url = new URL(request.url)
    const resolved = resolveRole('bugs', url)
    if ('denied' in resolved) {
      return resolved.denied
    }
    const me = account.account
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.bugs.filter(
      (bug) =>
        visibleProduct(bug.productId) !== undefined &&
        roleMatches(bug as unknown as Record<string, unknown>, resolved.field, me) &&
        matchIn(bug.status, url.searchParams.get('filters[status]')) &&
        matchIn(bug.severity, url.searchParams.get('filters[severity]')) &&
        matchIn(bug.priority, url.searchParams.get('filters[priority]')) &&
        matchValue(bug.productId, url.searchParams.get('filters[productId]')) &&
        matchValue(bug.executionId, url.searchParams.get('filters[executionId]')) &&
        matchRange(bug.createdAt?.slice(0, 10), url.searchParams.get('filters[createdAt]')),
    )
    if (q) {
      items = items.filter((bug) => `${bug.title}${bug.keywords ?? ''}`.toLowerCase().includes(q))
    }
    const sorted = sortBy(
      items as unknown as Record<string, unknown>[],
      url.searchParams.get('sort'),
      ['id', 'severity', 'priority', 'status', 'createdAt'],
      (a, b) => Number((b as unknown as { id: number }).id) - Number((a as unknown as { id: number }).id),
    )
    return ok(paginate(sorted, url))
  }),

  http.get('*/api/v1/my/stories', ({ request }) => {
    const account = currentAccount()
    if (!account) {
      return unauthorized()
    }
    if (!hasPerm([W.my])) {
      return forbidden(W.my)
    }
    const url = new URL(request.url)
    const resolved = resolveRole('stories', url)
    if ('denied' in resolved) {
      return resolved.denied
    }
    const me = account.account
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.stories.filter(
      (story) =>
        visibleProduct(story.productId) !== undefined &&
        roleMatches(story as unknown as Record<string, unknown>, resolved.field, me) &&
        matchIn(story.status, url.searchParams.get('filters[status]')) &&
        matchIn(story.stage, url.searchParams.get('filters[stage]')) &&
        matchIn(story.priority, url.searchParams.get('filters[priority]')) &&
        matchValue(story.productId, url.searchParams.get('filters[productId]')) &&
        matchIn(story.type, url.searchParams.get('filters[type]')),
    )
    if (q) {
      items = items.filter((story) => `${story.title}${story.keywords ?? ''}`.toLowerCase().includes(q))
    }
    const sorted = sortBy(
      items as unknown as Record<string, unknown>[],
      url.searchParams.get('sort'),
      ['id', 'priority', 'status', 'createdAt'],
      (a, b) => Number((b as unknown as { id: number }).id) - Number((a as unknown as { id: number }).id),
    )
    return ok(paginate(sorted, url))
  }),

  http.get('*/api/v1/my/activities', ({ request }) => {
    const account = currentAccount()
    if (!account) {
      return unauthorized()
    }
    if (!hasPerm([W.my])) {
      return forbidden(W.my)
    }
    // 游标分页倒序：actor=@me（§5；无 role 参数）
    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const beforeId = Number(url.searchParams.get('beforeId') ?? Number.MAX_SAFE_INTEGER)
    const items = db.activities
      .filter((activity) => activity.actor === account.account && activity.id < beforeId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
    return ok({ items, hasMore: items.length === limit })
  }),

  // ── 周报：历史列表 / 指定周幂等重算（§5） ──

  http.get('*/api/v1/projects/:projectId/weekly-reports', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([W.weekly])) {
      return forbidden(W.weekly)
    }
    const guarded = guardProject(Number(params.projectId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    // 仅返回已落库快照，不触发重算（§5）
    const url = new URL(request.url)
    const items = db.weeklyReports.filter(
      (row) =>
        row.projectId === guarded.project.id && matchDate(row.weekStart, url.searchParams.get('filters[weekStart]')),
    )
    const sorted = sortBy(
      items as unknown as Record<string, unknown>[],
      url.searchParams.get('sort') ?? '-weekStart',
      ['weekStart'],
      (a, b) =>
        String((b as unknown as WeeklyReportRow).weekStart).localeCompare(
          String((a as unknown as WeeklyReportRow).weekStart),
        ),
    ) as unknown as WeeklyReportRow[]
    return ok(paginate(sorted.map(weeklyView), url))
  }),

  http.get('*/api/v1/projects/:projectId/weekly-reports/current', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([W.weekly])) {
      return forbidden(W.weekly)
    }
    const guarded = guardProject(Number(params.projectId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    const url = new URL(request.url)
    const date = url.searchParams.get('date') ?? today()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return validation('date 需为 YYYY-MM-DD。', { date: 'invalid' })
    }
    const weekStart = mondayOf(date)
    const existing = db.weeklyReports.find((row) => row.projectId === guarded.project.id && row.weekStart === weekStart)
    // 幂等：同 (projectId, weekStart) 只留一行，重算整行覆写（§3.2）
    const fresh = { ...recomputeWeekly(guarded.project.id, weekStart), id: existing?.id ?? mockId() }
    if (existing) {
      Object.assign(existing, fresh)
    } else {
      db.weeklyReports.push(fresh)
    }
    return ok(weeklyView(existing ?? fresh))
  }),

  // ── 固定报表：需求统计 / Bug 分布 / 燃尽 / 用例通过率（§5） ──

  http.get('*/api/v1/products/:productId/reports/story-summary', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([W.report])) {
      return forbidden(W.report)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden('无权访问该产品。')
    }
    // 排除已删（§5 StorySummaryReport）
    const stories = db.stories.filter((story) => story.productId === product.id && deletedAtOf(story) === null)
    const report: StorySummaryReport = {
      total: stories.length,
      byStatus: groupCount(stories, (story) => story.status).map(({ key, count }) => ({ status: key, count })),
      byPriority: groupCount(stories, (story) => story.priority).map(({ key, count }) => ({ priority: key, count })),
      byStage: groupCount(stories, (story) => story.stage).map(({ key, count }) => ({ stage: key, count })),
      byType: groupCount(stories, (story) => story.type).map(({ key, count }) => ({ type: key, count })),
    }
    return ok(report)
  }),

  http.get('*/api/v1/products/:productId/reports/bug-distribution', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([W.report])) {
      return forbidden(W.report)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden('无权访问该产品。')
    }
    const bugs = db.bugs.filter((bug) => bug.productId === product.id && deletedAtOf(bug) === null)
    const report: BugDistributionReport = {
      total: bugs.length,
      bySeverity: groupCount(bugs, (bug) => bug.severity).map(({ key, count }) => ({ severity: key, count })),
      byStatus: groupCount(bugs, (bug) => bug.status).map(({ key, count }) => ({ status: key, count })),
      // resolution 为空计入 unresolved 桶（§5）
      byResolution: groupCount(bugs, (bug) => bug.resolution ?? 'unresolved').map(({ key, count }) => ({
        resolution: key,
        count,
      })),
    }
    return ok(report)
  }),

  http.get('*/api/v1/executions/:executionId/reports/burn', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([W.report])) {
      return forbidden(W.report)
    }
    const guarded = guardExecution(Number(params.executionId))
    if ('denied' in guarded) {
      return guarded.denied
    }
    return ok(burnReport(guarded.execution))
  }),

  http.get('*/api/v1/test-runs/:testRunId/reports/case-pass-rate', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([W.report])) {
      return forbidden(W.report)
    }
    const testRun = db.testRuns.find((item) => item.id === Number(params.testRunId))
    if (!testRun || !visibleProduct(testRun.productId)) {
      return notFound()
    }
    const rows = db.testRunCases.filter((row) => row.testRunId === testRun.id)
    const passed = rows.filter((row) => row.result === 'pass').length
    const failed = rows.filter((row) => row.result === 'fail').length
    const blocked = rows.filter((row) => row.result === 'blocked').length
    const na = rows.filter((row) => row.result === 'n/a').length
    const denominator = rows.length - na
    // passRate = passed/(total−na)×100，分母为 0 → null（§5）
    const report: CasePassRateReport = {
      total: rows.length,
      passed,
      failed,
      blocked,
      na,
      passRate: denominator === 0 ? null : round2((passed / denominator) * 100),
    }
    return ok(report)
  }),
]
