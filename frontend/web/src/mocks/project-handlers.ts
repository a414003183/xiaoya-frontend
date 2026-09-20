import type { ProductView } from '@zentao/api-client/generated/model/productView'
import type { ProjectView } from '@zentao/api-client/generated/model/projectView'
import type { StakeholderView } from '@zentao/api-client/generated/model/stakeholderView'
import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import { HttpResponse, http } from 'msw'
import { currentAccount, db, error, FORBIDDEN, mockId, NOT_FOUND, privilegesOf, UNAUTHENTICATED } from './db'
import {
  EXECUTION_TYPE_OPTIONS,
  type MockMetaOption,
  PRIORITY_OPTIONS,
  PROGRAM_TYPE_OPTIONS,
  PROJECT_ACL_OPTIONS,
  PROJECT_BUDGET_UNIT_OPTIONS,
  PROJECT_MODEL_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  STAKEHOLDER_TYPE_OPTIONS,
} from './meta-options'
import { record, visibleProduct } from './product-handlers'

const ok = (data: unknown) => HttpResponse.json({ data })
const unauthorized = () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })
const forbidden = (perm: string) => HttpResponse.json(FORBIDDEN(perm), { status: 403 })
const hidden = () => HttpResponse.json(error(40302, '无权访问该项目。'), { status: 403 })
const validation = (message: string, fields?: Record<string, string>) =>
  HttpResponse.json(
    { error: { code: 42201, message, traceId: 'mock', ...(fields ? { fields } : {}) } },
    { status: 422 },
  )
const stateConflict = (message: string) => HttpResponse.json(error(42202, message), { status: 422 })
const referenced = (message: string) => HttpResponse.json(error(42203, message), { status: 422 })
const lockConflict = () => HttpResponse.json(error(40901, '数据已被他人修改，请刷新后重试。'), { status: 409 })
const notFound = () => HttpResponse.json(NOT_FOUND, { status: 404 })

/**
 * project 域 MSW handlers（T-3/T-5）：三型（program/project/execution）一表三义 +
 * 关联产品/需求 + 成员/干系人/白名单；路径与载荷形状同 contract/openapi.yaml（project §5）。
 */

const ENTITY_TYPES = ['program', 'project', 'sprint', 'stage', 'kanban'] as const
const EXECUTION_TYPES = ['sprint', 'stage', 'kanban'] as const
const PROJECT_ACTIONS = ['start', 'suspend', 'resume', 'delay', 'close', 'activate'] as const
type ProjectAction = (typeof PROJECT_ACTIONS)[number]
const ACTION_RULES: Record<ProjectAction, { from: string[]; to: string; activity: string }> = {
  start: { from: ['wait'], to: 'doing', activity: 'started' },
  suspend: { from: ['doing'], to: 'suspended', activity: 'suspended' },
  resume: { from: ['suspended'], to: 'doing', activity: 'resumed' },
  delay: { from: ['doing'], to: 'delay', activity: 'delayed' },
  close: { from: ['doing', 'suspended', 'delay'], to: 'closed', activity: 'closed' },
  activate: { from: ['closed'], to: 'doing', activity: 'activated' },
}

type MemberInput = {
  account: string
  role?: string | null
  joinDate?: string | null
  days?: number | null
  hours?: number | null
  sort?: number | null
}

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

function defined<T>(value: T | undefined): value is T {
  return value !== undefined
}

// ── 数据权限（project §7：open / private / program 继承，执行继承项目 + 自身团队） ──

function teamAccounts(objectType: 'project' | 'execution', objectId: number): string[] {
  return db.teamMembers
    .filter((item) => item.objectType === objectType && item.objectId === objectId)
    .map((item) => item.account)
}

function stakeholderAccounts(objectType: 'program' | 'project', objectId: number): string[] {
  return db.stakeholders
    .filter((item) => item.objectType === objectType && item.objectId === objectId)
    .map((item) => item.account)
}

function canSee(item: ProjectView): boolean {
  const account = currentAccount()
  if (!account) {
    return false
  }
  if (account.groupIds.includes(1)) {
    return true
  }
  const me = account.account
  if ((item.whitelist ?? []).includes(me)) {
    return true
  }
  if (item.type !== 'program' && item.type !== 'project') {
    if (teamAccounts('execution', item.id).includes(me)) {
      return true
    }
    const parent = db.projects.find((project) => project.id === item.parentId)
    return parent !== undefined && canSee(parent)
  }
  if (item.acl === 'open') {
    return true
  }
  if (item.acl === 'private') {
    if ([item.pm, item.po, item.qd, item.rd, item.createdBy].includes(me)) {
      return true
    }
    if (item.type === 'project' && teamAccounts('project', item.id).includes(me)) {
      return true
    }
    return stakeholderAccounts(item.type, item.id).includes(me)
  }
  // acl=program：继承所属项目集可见性（仅 project 型可用，§3.1）
  const program = db.projects.find((parent) => parent.id === item.parentId)
  return program !== undefined && canSee(program)
}

/** 读路径统一入口：不存在 → 40401，不可见 → 40302（§7）。 */
function guardProject(id: number): { item: ProjectView } | { denied: Response } {
  const item = db.projects.find((project) => project.id === id)
  if (!item) {
    return { denied: notFound() }
  }
  if (!canSee(item)) {
    return { denied: hidden() }
  }
  return { item }
}

/** 数据权限复用出口（board-handlers 的执行需求看板按执行可见性放行，§7）。 */
export function canSeeProject(item: ProjectView): boolean {
  return canSee(item)
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

function filterParam(url: URL, key: string): string | null {
  return url.searchParams.get(`filters[${key}]`)
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

/** 三型列表公共过滤（§3.1 filterable 汇总）：type 固定传参或经 filters[type] 下发。 */
function projectListOf(url: URL, type?: (typeof ENTITY_TYPES)[number]): ProjectView[] {
  const q = url.searchParams.get('q')?.toLowerCase()
  // filters[productId]：project_product 反查（B-PRD-01 产品下项目页）
  const productIdFilter = filterParam(url, 'productId')
  let items = db.projects.filter(canSee)
  items = items.filter(
    (item) =>
      (type === undefined || item.type === type) &&
      matchIn(item.type, filterParam(url, 'type')) &&
      matchIn(item.status, filterParam(url, 'status')) &&
      matchIn(item.model, filterParam(url, 'model')) &&
      matchIn(item.priority, filterParam(url, 'priority')) &&
      matchIn(item.acl, filterParam(url, 'acl')) &&
      matchValue(item.pm, filterParam(url, 'pm')) &&
      matchValue(item.parentId, filterParam(url, 'parentId')) &&
      matchRange(item.beginDate, filterParam(url, 'beginDate')) &&
      matchRange(item.endDate, filterParam(url, 'endDate')) &&
      matchValue(item.createdBy, filterParam(url, 'createdBy')) &&
      matchIn(item.id, filterParam(url, 'id')) &&
      (productIdFilter === null ||
        db.projectProducts.some((link) => link.projectId === item.id && matchIn(link.productId, productIdFilter))),
  )
  if (q) {
    items = items.filter((item) => `${item.name}${item.code ?? ''}`.toLowerCase().includes(q))
  }
  return sortBy(
    items as unknown as Record<string, unknown>[],
    url.searchParams.get('sort'),
    (a, b) => Number(a.sort) - Number(b.sort) || Number(a.id) - Number(b.id),
  ) as unknown as ProjectView[]
}

// ── 六动作（§4 状态机） ──

function runAction(item: ProjectView, action: ProjectAction, body: Record<string, unknown>, perm: string) {
  if (!currentAccount()) {
    return unauthorized()
  }
  if (!hasPerm([perm])) {
    return forbidden(perm)
  }
  const rule = ACTION_RULES[action]
  if (!rule.from.includes(item.status)) {
    return stateConflict(`当前状态 ${item.status} 不允许执行 ${action}。`)
  }
  const comment = (body.comment as string | null) ?? null
  if (action === 'activate') {
    const beginDate = String(body.beginDate ?? '')
    const endDate = String(body.endDate ?? '')
    if (beginDate === '' || endDate === '') {
      return validation('激活需填写开始与结束日期。', { beginDate: 'required' })
    }
    if (beginDate > endDate) {
      return referenced('开始日期不能晚于结束日期。')
    }
    item.beginDate = beginDate
    item.endDate = endDate
  }
  if (action === 'start') {
    item.realBeganDate = ((body.realBeganDate as string | null) ?? '') || new Date().toISOString().slice(0, 10)
  }
  if (action === 'close') {
    item.realEndDate = ((body.realEndDate as string | null) ?? '') || new Date().toISOString().slice(0, 10)
  }
  item.status = rule.to as ProjectView['status']
  item.lockVersion += 1
  item.updatedAt = new Date().toISOString()
  record(item.type, item.id, rule.activity, comment)
  return ok(item)
}

// ── 创建 / PATCH 公共实现 ──

function lockVersionOf(body: Record<string, unknown>, current: number): boolean {
  return body.lockVersion === undefined || body.lockVersion === current
}

function createEntity(
  type: ProjectView['type'],
  body: Record<string, unknown>,
  parent: ProjectView | undefined,
): ProjectView {
  const id = mockId()
  const prefix = parent ? (parent.path ?? `,${parent.id},`).replace(/^,|,$/g, '') : ''
  return {
    id,
    type,
    parentId: parent?.id ?? 0,
    path: prefix === '' ? `,${id},` : `,${prefix},${id},`,
    grade: parent ? (parent.grade ?? 1) + 1 : 1,
    name: String(body.name ?? ''),
    code: (body.code as string | null) ?? null,
    model: (body.model as ProjectView['model']) ?? 'scrum',
    status: 'wait',
    priority: Number(body.priority ?? 1),
    beginDate: (body.beginDate as string | null) ?? null,
    endDate: (body.endDate as string | null) ?? null,
    days: Number(body.days ?? 0),
    budget: body.budget === undefined || body.budget === null ? null : Number(body.budget),
    budgetUnit: (body.budgetUnit as ProjectView['budgetUnit']) ?? 'CNY',
    pm: (body.pm as string | null) ?? null,
    po: (body.po as string | null) ?? null,
    qd: (body.qd as string | null) ?? null,
    rd: (body.rd as string | null) ?? null,
    acl: (body.acl as ProjectView['acl']) ?? 'open',
    whitelist: (body.whitelist as string[] | undefined) ?? [],
    sort: Number(body.sort ?? 0),
    isMilestone: Boolean(body.isMilestone ?? false),
    progress: 0,
    estimateHours: 0,
    consumedHours: 0,
    leftHours: 0,
    description: (body.description as string | null) ?? null,
    createdBy: currentAccount()?.account ?? 'system',
    createdAt: new Date().toISOString(),
    lockVersion: 0,
  }
}

function patchEntity(item: ProjectView, body: Record<string, unknown>, editable: string[]) {
  if (!lockVersionOf(body, item.lockVersion)) {
    return lockConflict()
  }
  const beginDate = (body.beginDate as string | undefined) ?? item.beginDate ?? ''
  const endDate = (body.endDate as string | undefined) ?? item.endDate ?? ''
  if (beginDate !== '' && endDate !== '' && beginDate > endDate) {
    return referenced('开始日期不能晚于结束日期。')
  }
  for (const key of editable) {
    if (key in body) {
      ;(item as unknown as Record<string, unknown>)[key] = body[key]
    }
  }
  item.lockVersion += 1
  item.updatedBy = currentAccount()?.account ?? null
  item.updatedAt = new Date().toISOString()
  record(item.type, item.id, 'edited')
  return ok(item)
}

function addStakeholder(objectType: 'program' | 'project', objectId: number, body: Record<string, unknown>) {
  const account = String(body.account ?? '')
  if (!db.accounts.some((item) => item.account === account)) {
    return validation('账号不存在。', { account: 'invalid' })
  }
  if (
    db.stakeholders.some(
      (item) => item.objectType === objectType && item.objectId === objectId && item.account === account,
    )
  ) {
    return validation('该干系人已存在。', { account: 'duplicate' })
  }
  const stakeholder: StakeholderView = {
    id: mockId(),
    objectType,
    objectId,
    account,
    type: (body.type as StakeholderView['type']) ?? 'inside',
    isKey: Boolean(body.isKey ?? false),
    source: (body.source as string | null) ?? null,
    createdBy: currentAccount()?.account ?? 'system',
    createdAt: new Date().toISOString(),
  }
  db.stakeholders.push(stakeholder)
  record(objectType, objectId, 'stakeholder-added', account)
  return ok(stakeholder)
}

/** 成员全量提交（§5：diff 增删改 + 逐项校验，幂等）。 */
function submitMembers(
  objectType: 'project' | 'execution',
  objectId: number,
  inputs: MemberInput[],
  projectDays: number,
): { results: { account: string; ok: boolean; error: string | null }[] } {
  const accounts = inputs.map((input) => input.account)
  const duplicated = new Set(accounts.filter((account, index) => accounts.indexOf(account) !== index))
  const results: { account: string; ok: boolean; error: string | null }[] = []
  const keep = new Set<string>()
  for (const input of inputs) {
    let errorCode: string | null = null
    if (duplicated.has(input.account)) {
      errorCode = '42201'
    } else if (!db.accounts.some((item) => item.account === input.account)) {
      errorCode = '42201'
    } else if ((input.days ?? 0) > projectDays) {
      errorCode = '42201'
    } else if ((input.hours ?? 0) > 24) {
      errorCode = '42201'
    }
    if (errorCode === null) {
      keep.add(input.account)
      const existing = db.teamMembers.find(
        (item) => item.objectType === objectType && item.objectId === objectId && item.account === input.account,
      )
      const values = {
        role: input.role ?? null,
        joinDate: input.joinDate ?? new Date().toISOString().slice(0, 10),
        days: input.days ?? 0,
        hours: input.hours ?? 0,
        sort: input.sort ?? 0,
      }
      if (existing) {
        Object.assign(existing, values)
      } else {
        db.teamMembers.push({ id: mockId(), objectType, objectId, account: input.account, ...values })
      }
    }
    results.push({ account: input.account, ok: errorCode === null, error: errorCode })
  }
  db.teamMembers = db.teamMembers.filter(
    (item) => item.objectType !== objectType || item.objectId !== objectId || keep.has(item.account),
  )
  return { results }
}

// ── 关联子资源 ──

function linkedProducts(projectId: number): ProductView[] {
  return db.projectProducts
    .filter((link) => link.projectId === projectId)
    .map((link) => db.products.find((product) => product.id === link.productId))
    .filter(defined)
    .filter((product) => visibleProduct(product.id) !== undefined)
}

function linkedStories(projectId: number): StoryView[] {
  return db.projectStories
    .filter((link) => link.projectId === projectId)
    .sort((a, b) => a.sort - b.sort)
    .map((link) => db.stories.find((story) => story.id === link.storyId))
    .filter(defined)
    .filter((story) => visibleProduct(story.productId) !== undefined)
}

function memberList(objectType: 'project' | 'execution', objectId: number, url: URL) {
  const items = db.teamMembers.filter((item) => item.objectType === objectType && item.objectId === objectId)
  return ok(paginate(items, url))
}

/** 活动流游标页（03 §3）：objectTypes 是放行白名单（project 用三型实体，execution 另含 execution 聚合口径）。 */
function activityPage(
  objectTypes: readonly string[],
  objectId: number,
  url: URL,
): { items: unknown[]; hasMore: boolean } {
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  const beforeId = Number(url.searchParams.get('beforeId') ?? Number.MAX_SAFE_INTEGER)
  const items = db.activities
    .filter(
      (activity) =>
        activity.objectId === objectId && objectTypes.includes(activity.objectType) && activity.id < beforeId,
    )
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
  return { items, hasMore: items.length === limit }
}

// ── meta（与 workflow/project.yml 同源，03 §6） ──

/** 三型同构字段（与 backend ProjectRegistrar.entityMeta 对齐）；type 的合法值域按域传入。 */
const projectDomainFields = (typeOptions: MockMetaOption[]) => [
  { key: 'name', type: 'text', required: true, maxLength: 90, i18n: 'project.field.name' },
  { key: 'code', type: 'text', maxLength: 45, i18n: 'project.field.code' },
  { key: 'type', type: 'select', i18n: 'project.field.type', options: typeOptions },
  { key: 'status', type: 'select', i18n: 'project.field.status', options: PROJECT_STATUS_OPTIONS },
  { key: 'model', type: 'select', i18n: 'project.field.model', options: PROJECT_MODEL_OPTIONS },
  { key: 'priority', type: 'select', i18n: 'common.priority', options: PRIORITY_OPTIONS },
  { key: 'beginDate', type: 'date', i18n: 'project.field.beginDate' },
  { key: 'endDate', type: 'date', i18n: 'project.field.endDate' },
  { key: 'days', type: 'number', i18n: 'project.field.days' },
  { key: 'budget', type: 'number', i18n: 'project.field.budget' },
  { key: 'budgetUnit', type: 'select', i18n: 'project.field.budgetUnit', options: PROJECT_BUDGET_UNIT_OPTIONS },
  { key: 'pm', type: 'select', source: 'accounts', i18n: 'project.field.pm' },
  { key: 'po', type: 'select', source: 'accounts', i18n: 'project.field.po' },
  { key: 'qd', type: 'select', source: 'accounts', i18n: 'project.field.qd' },
  { key: 'rd', type: 'select', source: 'accounts', i18n: 'project.field.rd' },
  { key: 'acl', type: 'select', i18n: 'project.field.acl', options: PROJECT_ACL_OPTIONS },
  { key: 'whitelist', type: 'multiselect', source: 'accounts', i18n: 'project.field.whitelist' },
  { key: 'sort', type: 'number', i18n: 'common.field.sort' },
]

const PROJECT_STATUS_VISUALS = {
  wait: { tone: 'pending', i18n: 'project.status.wait' },
  doing: { tone: 'active', i18n: 'project.status.doing' },
  suspended: { tone: 'pending', i18n: 'project.status.suspended' },
  delay: { tone: 'error', i18n: 'project.status.delay' },
  closed: { tone: 'closed', i18n: 'project.status.closed' },
}

function actionMeta(prefix: string) {
  return [
    { code: `${prefix}-edit`, action: 'edit', i18n: 'common.action.edit' },
    { code: `${prefix}-start`, action: 'start', i18n: 'project.action.start', allowedStatus: ['wait'] },
    { code: `${prefix}-suspend`, action: 'suspend', i18n: 'project.action.suspend', allowedStatus: ['doing'] },
    { code: `${prefix}-resume`, action: 'resume', i18n: 'project.action.resume', allowedStatus: ['suspended'] },
    { code: `${prefix}-delay`, action: 'delay', i18n: 'project.action.delay', allowedStatus: ['doing'] },
    {
      code: `${prefix}-close`,
      action: 'close',
      i18n: 'project.action.close',
      allowedStatus: ['doing', 'suspended', 'delay'],
    },
    { code: `${prefix}-activate`, action: 'activate', i18n: 'project.action.activate', allowedStatus: ['closed'] },
  ]
}

export const PROGRAM_META = {
  domain: 'program',
  fields: projectDomainFields(PROGRAM_TYPE_OPTIONS),
  list: { defaultColumns: ['id', 'name', 'status', 'pm'], defaultSort: 'sort' },
  actions: actionMeta('program'),
  statusVisuals: PROJECT_STATUS_VISUALS,
}

export const PROJECT_META = {
  domain: 'project',
  fields: [
    ...projectDomainFields(PROJECT_TYPE_OPTIONS),
    { key: 'productIds', type: 'multiselect', i18n: 'project.field.products' },
  ],
  list: { defaultColumns: ['id', 'name', 'status', 'pm'], defaultSort: 'sort' },
  actions: actionMeta('project'),
  statusVisuals: PROJECT_STATUS_VISUALS,
}

export const EXECUTION_META = {
  domain: 'execution',
  fields: [
    ...projectDomainFields(EXECUTION_TYPE_OPTIONS),
    { key: 'isMilestone', type: 'bool', i18n: 'project.field.milestone' },
  ],
  list: { defaultColumns: ['id', 'name', 'type', 'status'], defaultSort: 'sort' },
  actions: actionMeta('execution'),
  statusVisuals: PROJECT_STATUS_VISUALS,
}

export const STAKEHOLDER_META = {
  domain: 'stakeholder',
  fields: [
    { key: 'account', type: 'account', required: true, source: 'accounts', i18n: 'stakeholder.field.account' },
    { key: 'type', type: 'select', required: true, i18n: 'stakeholder.field.type', options: STAKEHOLDER_TYPE_OPTIONS },
    { key: 'isKey', type: 'bool', i18n: 'stakeholder.field.isKey' },
    { key: 'source', type: 'text', maxLength: 30, i18n: 'stakeholder.field.source' },
  ],
  list: { defaultColumns: ['id', 'account', 'type', 'isKey', 'source'], defaultSort: 'id' },
  actions: [],
  statusVisuals: {},
}

export const PROJECT_META_BY_DOMAIN: Record<string, unknown> = {
  program: PROGRAM_META,
  project: PROJECT_META,
  execution: EXECUTION_META,
  stakeholder: STAKEHOLDER_META,
}

// ── handlers ──

const P = {
  programView: 'program-view',
  programCreate: 'program-create',
  programEdit: 'program-edit',
  programDelete: 'program-delete',
  projectView: 'project-view',
  projectCreate: 'project-create',
  projectEdit: 'project-edit',
  projectDelete: 'project-delete',
  projectLinkStory: 'project-link-story',
  projectMembers: 'project-manage-members',
  projectWhitelist: 'project-whitelist',
  executionView: 'execution-view',
  executionCreate: 'execution-create',
  executionEdit: 'execution-edit',
  executionDelete: 'execution-delete',
  executionMembers: 'execution-manage-members',
  stakeholderView: 'stakeholder-view',
  stakeholderManage: 'stakeholder-manage',
}

/** 三型共用一表：类型 → 团队成员/干系人 objectType（§2）。 */
function objectTypeOf(item: ProjectView): 'program' | 'project' | 'execution' {
  return item.type === 'program' ? 'program' : item.type === 'project' ? 'project' : 'execution'
}

/** 软删实体（mock 物理删除）并清理关联行：项目-产品/项目-需求/成员/干系人。 */
function purgeEntity(item: ProjectView): void {
  const objectType = objectTypeOf(item)
  db.projects = db.projects.filter((row) => row.id !== item.id)
  db.projectProducts = db.projectProducts.filter((row) => row.projectId !== item.id)
  db.projectStories = db.projectStories.filter((row) => row.projectId !== item.id)
  db.teamMembers = db.teamMembers.filter((row) => !(row.objectType === objectType && row.objectId === item.id))
  db.stakeholders = db.stakeholders.filter((row) => !(row.objectType === objectType && row.objectId === item.id))
}

export const projectHandlers = [
  // ── 项目集 ──
  http.get('*/api/v1/programs', ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.programView])) {
      return forbidden(P.programView)
    }
    const url = new URL(request.url)
    return ok(paginate(projectListOf(url, 'program'), url))
  }),

  http.post('*/api/v1/programs', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.programCreate])) {
      return forbidden(P.programCreate)
    }
    const body = (await request.json()) as Record<string, unknown>
    const parentId = Number(body.parentId ?? 0)
    const parent = parentId === 0 ? undefined : db.projects.find((item) => item.id === parentId)
    if (parentId !== 0 && parent?.type !== 'program') {
      return validation('项目集只能挂在项目集下。', { parentId: 'invalid' })
    }
    const program = createEntity('program', body, parent)
    db.projects.push(program)
    record('program', program.id, 'created')
    return ok(program)
  }),

  http.get('*/api/v1/programs/:programId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.programView])) {
      return forbidden(P.programView)
    }
    const guard = guardProject(Number(params.programId))
    if ('denied' in guard || guard.item.type !== 'program') {
      return 'denied' in guard ? guard.denied : notFound()
    }
    return ok(guard.item)
  }),

  http.patch('*/api/v1/programs/:programId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.programEdit])) {
      return forbidden(P.programEdit)
    }
    const guard = guardProject(Number(params.programId))
    if ('denied' in guard) {
      return guard.denied
    }
    return patchEntity(guard.item, (await request.json()) as Record<string, unknown>, [
      'name',
      'code',
      'beginDate',
      'endDate',
      'budget',
      'budgetUnit',
      'pm',
      'acl',
      'whitelist',
      'description',
      'sort',
    ])
  }),

  ...PROJECT_ACTIONS.map((action) =>
    http.post(`*/api/v1/programs/:programId/${action}`, async ({ params, request }) => {
      const guard = guardProject(Number(params.programId))
      if ('denied' in guard) {
        return guard.denied
      }
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
      return runAction(guard.item, action, body, `program-${action}`)
    }),
  ),

  http.delete('*/api/v1/programs/:programId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.programDelete])) {
      return forbidden(P.programDelete)
    }
    const guard = guardProject(Number(params.programId))
    if ('denied' in guard || guard.item.type !== 'program') {
      return 'denied' in guard ? guard.denied : notFound()
    }
    // §5 delete 守卫：存在未删子项目集或子项目 → 42203
    if (db.projects.some((item) => item.parentId === guard.item.id)) {
      return referenced('存在未删的子项目集或子项目，不能删除。')
    }
    purgeEntity(guard.item)
    record('program', guard.item.id, 'deleted')
    return ok(null)
  }),

  http.get('*/api/v1/programs/:programId/programs', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.programView])) {
      return forbidden(P.programView)
    }
    const guard = guardProject(Number(params.programId))
    if ('denied' in guard) {
      return guard.denied
    }
    const items = db.projects.filter(
      (item) => item.type === 'program' && item.parentId === guard.item.id && canSee(item),
    )
    return ok(paginate(items, new URL(request.url)))
  }),

  http.get('*/api/v1/programs/:programId/projects', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.programView])) {
      return forbidden(P.programView)
    }
    const guard = guardProject(Number(params.programId))
    if ('denied' in guard) {
      return guard.denied
    }
    const items = db.projects.filter(
      (item) => item.type === 'project' && item.parentId === guard.item.id && canSee(item),
    )
    return ok(paginate(items, new URL(request.url)))
  }),

  http.get('*/api/v1/programs/:programId/products', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.programView])) {
      return forbidden(P.programView)
    }
    const guard = guardProject(Number(params.programId))
    if ('denied' in guard) {
      return guard.denied
    }
    const childIds = db.projects
      .filter((item) => item.parentId === guard.item.id || item.id === guard.item.id)
      .map((item) => item.id)
    const items = [...new Set(childIds.flatMap((projectId) => linkedProducts(projectId)))]
    return ok(paginate(items, new URL(request.url)))
  }),

  // ── 项目 ──
  http.get('*/api/v1/projects', ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectView])) {
      return forbidden(P.projectView)
    }
    const url = new URL(request.url)
    return ok(paginate(projectListOf(url, 'project'), url))
  }),

  http.post('*/api/v1/projects', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectCreate])) {
      return forbidden(P.projectCreate)
    }
    const body = (await request.json()) as Record<string, unknown>
    const productIds = Array.isArray(body.productIds) ? (body.productIds as number[]) : []
    if (productIds.length === 0) {
      return validation('项目必须关联产品。', { productIds: 'required' })
    }
    if (!body.beginDate || !body.endDate) {
      return validation('项目需填写开始与结束日期。', { beginDate: 'required' })
    }
    if (String(body.beginDate) > String(body.endDate)) {
      return referenced('开始日期不能晚于结束日期。')
    }
    const parentId = Number(body.parentId ?? 0)
    const parent = parentId === 0 ? undefined : db.projects.find((item) => item.id === parentId)
    if (parentId !== 0 && parent?.type !== 'program') {
      return validation('项目只能挂在项目集下。', { parentId: 'invalid' })
    }
    const project = createEntity('project', body, parent)
    db.projects.push(project)
    for (const productId of productIds) {
      db.projectProducts.push({ projectId: project.id, productId })
    }
    record('project', project.id, 'created')
    return ok(project)
  }),

  http.get('*/api/v1/projects/:projectId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectView])) {
      return forbidden(P.projectView)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard || guard.item.type !== 'project') {
      return 'denied' in guard ? guard.denied : notFound()
    }
    return ok(guard.item)
  }),

  http.patch('*/api/v1/projects/:projectId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectEdit])) {
      return forbidden(P.projectEdit)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard || guard.item.type !== 'project') {
      return 'denied' in guard ? guard.denied : notFound()
    }
    return patchEntity(guard.item, (await request.json()) as Record<string, unknown>, [
      'name',
      'code',
      'model',
      'beginDate',
      'endDate',
      'days',
      'budget',
      'budgetUnit',
      'pm',
      'po',
      'qd',
      'rd',
      'acl',
      'whitelist',
      'description',
      'sort',
    ])
  }),

  ...PROJECT_ACTIONS.map((action) =>
    http.post(`*/api/v1/projects/:projectId/${action}`, async ({ params, request }) => {
      const guard = guardProject(Number(params.projectId))
      if ('denied' in guard || guard.item.type !== 'project') {
        return 'denied' in guard ? guard.denied : notFound()
      }
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
      return runAction(guard.item, action, body, `project-${action}`)
    }),
  ),

  http.delete('*/api/v1/projects/:projectId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectDelete])) {
      return forbidden(P.projectDelete)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard || guard.item.type !== 'project') {
      return 'denied' in guard ? guard.denied : notFound()
    }
    // §5 delete 守卫：存在未删执行 → 42203；存在未删关联需求 → 42203
    if (db.projects.some((item) => item.parentId === guard.item.id)) {
      return referenced('存在未删的执行，不能删除。')
    }
    if (db.projectStories.some((row) => row.projectId === guard.item.id)) {
      return referenced('存在未删的关联需求，不能删除。')
    }
    purgeEntity(guard.item)
    record('project', guard.item.id, 'deleted')
    return ok(null)
  }),

  http.get('*/api/v1/projects/:projectId/products', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectView])) {
      return forbidden(P.projectView)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    const items = linkedProducts(guard.item.id)
    return ok({ items, total: items.length })
  }),

  http.post('*/api/v1/projects/:projectId/products', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectEdit])) {
      return forbidden(P.projectEdit)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    const body = (await request.json()) as { productIds?: number[] }
    const productIds = body.productIds ?? []
    if (productIds.length === 0) {
      return validation('项目必须关联产品。', { productIds: 'required' })
    }
    db.projectProducts = db.projectProducts.filter((link) => link.projectId !== guard.item.id)
    for (const productId of productIds) {
      db.projectProducts.push({ projectId: guard.item.id, productId })
    }
    record('project', guard.item.id, 'products-replaced')
    return ok({ productIds })
  }),

  http.get('*/api/v1/projects/:projectId/stories', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectView])) {
      return forbidden(P.projectView)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    const items = linkedStories(guard.item.id)
    return ok({ items, total: items.length })
  }),

  http.post('*/api/v1/projects/:projectId/stories', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectLinkStory])) {
      return forbidden(P.projectLinkStory)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    const body = (await request.json()) as { storyIds?: number[] }
    const linkedProductIds = db.projectProducts
      .filter((link) => link.projectId === guard.item.id)
      .map((link) => link.productId)
    const results = (body.storyIds ?? []).map((storyId) => {
      const story = db.stories.find((item) => item.id === storyId)
      if (!story) {
        return { id: storyId, ok: false, error: '40401' }
      }
      if (!linkedProductIds.includes(story.productId)) {
        return { id: storyId, ok: false, error: '42201' }
      }
      // project_story 关联幂等：重复关联不增行（§8）
      if (!db.projectStories.some((link) => link.projectId === guard.item.id && link.storyId === storyId)) {
        db.projectStories.push({
          projectId: guard.item.id,
          storyId,
          productId: story.productId,
          sort: db.projectStories.filter((link) => link.projectId === guard.item.id).length,
        })
      }
      return { id: storyId, ok: true, error: null }
    })
    record('project', guard.item.id, 'stories-linked')
    return ok({ results })
  }),

  // 解除关联（B-PRJ-06）：删 project_story 行，幂等（行不存在仍 200），不影响需求本身
  http.delete('*/api/v1/projects/:projectId/stories/:storyId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectLinkStory])) {
      return forbidden(P.projectLinkStory)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    const storyId = Number(params.storyId)
    db.projectStories = db.projectStories.filter(
      (link) => !(link.projectId === guard.item.id && link.storyId === storyId),
    )
    record('project', guard.item.id, 'stories-unlinked')
    return ok(null)
  }),

  http.get('*/api/v1/projects/:projectId/executions', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.executionView])) {
      return forbidden(P.executionView)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    const items = db.projects.filter(
      (item) =>
        item.parentId === guard.item.id && (EXECUTION_TYPES as readonly string[]).includes(item.type) && canSee(item),
    )
    return ok(paginate(items, new URL(request.url)))
  }),

  http.post('*/api/v1/projects/:projectId/executions', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.executionCreate])) {
      return forbidden(P.executionCreate)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    const body = (await request.json()) as Record<string, unknown>
    const type = String(body.type ?? '')
    if (!(EXECUTION_TYPES as readonly string[]).includes(type)) {
      return validation('执行类型必须是 sprint|stage|kanban。', { type: 'required' })
    }
    if (!body.beginDate || !body.endDate) {
      return validation('执行需填写开始与结束日期。', { beginDate: 'required' })
    }
    if (String(body.beginDate) > String(body.endDate)) {
      return referenced('开始日期不能晚于结束日期。')
    }
    const execution = createEntity(type as ProjectView['type'], body, guard.item)
    db.projects.push(execution)
    record('execution', execution.id, 'created')
    return ok(execution)
  }),

  http.get('*/api/v1/projects/:projectId/members', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectView])) {
      return forbidden(P.projectView)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    return memberList('project', guard.item.id, new URL(request.url))
  }),

  http.post('*/api/v1/projects/:projectId/members', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectMembers])) {
      return forbidden(P.projectMembers)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    const body = (await request.json()) as { members?: MemberInput[] }
    record('project', guard.item.id, 'members-submitted')
    return ok(submitMembers('project', guard.item.id, body.members ?? [], guard.item.days ?? 0))
  }),

  http.get('*/api/v1/projects/:projectId/stakeholders', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.stakeholderView])) {
      return forbidden(P.stakeholderView)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    const items = db.stakeholders.filter((item) => item.objectType === 'project' && item.objectId === guard.item.id)
    return ok(paginate(items, new URL(request.url)))
  }),

  http.post('*/api/v1/projects/:projectId/stakeholders', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.stakeholderManage])) {
      return forbidden(P.stakeholderManage)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    return addStakeholder('project', guard.item.id, (await request.json()) as Record<string, unknown>)
  }),

  http.delete('*/api/v1/projects/:projectId/stakeholders/:stakeholderId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.stakeholderManage])) {
      return forbidden(P.stakeholderManage)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    db.stakeholders = db.stakeholders.filter((item) => item.id !== Number(params.stakeholderId))
    record('project', guard.item.id, 'stakeholder-removed')
    return ok(null)
  }),

  http.get('*/api/v1/projects/:projectId/whitelist', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectView])) {
      return forbidden(P.projectView)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    return ok({ accounts: guard.item.whitelist ?? [] })
  }),

  http.post('*/api/v1/projects/:projectId/whitelist', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectWhitelist])) {
      return forbidden(P.projectWhitelist)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    const body = (await request.json()) as { accounts?: string[] }
    const accounts = body.accounts ?? []
    for (const account of accounts) {
      if (!db.accounts.some((item) => item.account === account)) {
        return validation('账号不存在。', { accounts: 'invalid' })
      }
    }
    guard.item.whitelist = accounts
    guard.item.lockVersion += 1
    record('project', guard.item.id, 'whitelist-replaced')
    return ok({ accounts })
  }),

  http.get('*/api/v1/projects/:projectId/activities', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.projectView])) {
      return forbidden(P.projectView)
    }
    const guard = guardProject(Number(params.projectId))
    if ('denied' in guard) {
      return guard.denied
    }
    return ok(activityPage(ENTITY_TYPES, guard.item.id, new URL(request.url)))
  }),

  // ── 执行 ──
  http.get('*/api/v1/executions', ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.executionView])) {
      return forbidden(P.executionView)
    }
    const url = new URL(request.url)
    const items = projectListOf(url).filter((item) => (EXECUTION_TYPES as readonly string[]).includes(item.type))
    return ok(paginate(items, url))
  }),

  http.get('*/api/v1/executions/:executionId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.executionView])) {
      return forbidden(P.executionView)
    }
    const guard = guardProject(Number(params.executionId))
    if ('denied' in guard || !(EXECUTION_TYPES as readonly string[]).includes(guard.item.type)) {
      return 'denied' in guard ? guard.denied : notFound()
    }
    return ok(guard.item)
  }),

  http.patch('*/api/v1/executions/:executionId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.executionEdit])) {
      return forbidden(P.executionEdit)
    }
    const guard = guardProject(Number(params.executionId))
    if ('denied' in guard || !(EXECUTION_TYPES as readonly string[]).includes(guard.item.type)) {
      return 'denied' in guard ? guard.denied : notFound()
    }
    return patchEntity(guard.item, (await request.json()) as Record<string, unknown>, [
      'name',
      'code',
      'beginDate',
      'endDate',
      'days',
      'pm',
      'acl',
      'whitelist',
      'description',
      'sort',
      'isMilestone',
    ])
  }),

  ...PROJECT_ACTIONS.map((action) =>
    http.post(`*/api/v1/executions/:executionId/${action}`, async ({ params, request }) => {
      const guard = guardProject(Number(params.executionId))
      if ('denied' in guard || !(EXECUTION_TYPES as readonly string[]).includes(guard.item.type)) {
        return 'denied' in guard ? guard.denied : notFound()
      }
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
      return runAction(guard.item, action, body, `execution-${action}`)
    }),
  ),

  http.delete('*/api/v1/executions/:executionId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.executionDelete])) {
      return forbidden(P.executionDelete)
    }
    const guard = guardProject(Number(params.executionId))
    if ('denied' in guard || !(EXECUTION_TYPES as readonly string[]).includes(guard.item.type)) {
      return 'denied' in guard ? guard.denied : notFound()
    }
    // §5 delete 守卫：执行下存在未删任务 → 42203
    if (db.tasks.some((task) => task.executionId === guard.item.id)) {
      return referenced('执行下存在未删任务，不能删除。')
    }
    purgeEntity(guard.item)
    record('execution', guard.item.id, 'deleted')
    return ok(null)
  }),

  http.get('*/api/v1/executions/:executionId/members', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.executionView])) {
      return forbidden(P.executionView)
    }
    const guard = guardProject(Number(params.executionId))
    if ('denied' in guard) {
      return guard.denied
    }
    return memberList('execution', guard.item.id, new URL(request.url))
  }),

  http.get('*/api/v1/executions/:executionId/stories', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.executionView])) {
      return forbidden(P.executionView)
    }
    const guard = guardProject(Number(params.executionId))
    if ('denied' in guard) {
      return guard.denied
    }
    // 执行维度关联需求 = 执行自身 + 所属项目上的 project_story 反查（§5）
    const projectIds = [guard.item.id, guard.item.parentId]
    const items = db.projectStories
      .filter((link) => projectIds.includes(link.projectId))
      .sort((a, b) => a.sort - b.sort)
      .map((link) => db.stories.find((story) => story.id === link.storyId))
      .filter(defined)
    return ok({ items, total: items.length })
  }),

  http.post('*/api/v1/executions/:executionId/members', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.executionMembers])) {
      return forbidden(P.executionMembers)
    }
    const guard = guardProject(Number(params.executionId))
    if ('denied' in guard) {
      return guard.denied
    }
    const parent = db.projects.find((item) => item.id === guard.item.parentId)
    const body = (await request.json()) as { members?: MemberInput[] }
    record('execution', guard.item.id, 'members-submitted')
    return ok(submitMembers('execution', guard.item.id, body.members ?? [], parent?.days ?? 0))
  }),

  // 执行动态流（B-PRJ-07）：objectType 兼容 execution（创建/成员等聚合口径）与三型细分（runAction 按实际 type 记录）
  http.get('*/api/v1/executions/:executionId/activities', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([P.executionView])) {
      return forbidden(P.executionView)
    }
    const guard = guardProject(Number(params.executionId))
    if ('denied' in guard || !(EXECUTION_TYPES as readonly string[]).includes(guard.item.type)) {
      return 'denied' in guard ? guard.denied : notFound()
    }
    return ok(activityPage(['execution', ...EXECUTION_TYPES], guard.item.id, new URL(request.url)))
  }),
]
