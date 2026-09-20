import { ok } from '@zentao/api-client'
import {
  activateTodo,
  assignTodo,
  batchTodos,
  closeTodo,
  createTodo,
  deleteTodo,
  finishTodo,
  getBugDistributionReport,
  getBurnReport,
  getCasePassRateReport,
  getCurrentWeeklyReport,
  getDepartmentTree,
  getDict,
  getMe,
  getMySummary,
  getSettings,
  getStorySummaryReport,
  getTodo,
  globalSearch,
  listMyActivities,
  listMyBugs,
  listMyStories,
  listMyTasks,
  listTodoActivities,
  listTodos,
  putSettings,
  startTodo,
  updateAccount,
  updateTodo,
} from '@zentao/api-client/generated'
import type { AccountView } from '@zentao/api-client/generated/model/accountView'
import type { ActivityView } from '@zentao/api-client/generated/model/activityView'
import type { BugDistributionReport } from '@zentao/api-client/generated/model/bugDistributionReport'
import type { BugView } from '@zentao/api-client/generated/model/bugView'
import type { BurnReport } from '@zentao/api-client/generated/model/burnReport'
import type { CasePassRateReport } from '@zentao/api-client/generated/model/casePassRateReport'
import type { DepartmentNode } from '@zentao/api-client/generated/model/departmentNode'
import type { GlobalSearchScope } from '@zentao/api-client/generated/model/globalSearchScope'
import type { ListMyBugsParams } from '@zentao/api-client/generated/model/listMyBugsParams'
import type { ListMyBugsRole } from '@zentao/api-client/generated/model/listMyBugsRole'
import type { ListMyStoriesParams } from '@zentao/api-client/generated/model/listMyStoriesParams'
import type { ListMyStoriesRole } from '@zentao/api-client/generated/model/listMyStoriesRole'
import type { ListMyTasksParams } from '@zentao/api-client/generated/model/listMyTasksParams'
import type { ListMyTasksRole } from '@zentao/api-client/generated/model/listMyTasksRole'
import type { ListTodosParams } from '@zentao/api-client/generated/model/listTodosParams'
import type { MeView } from '@zentao/api-client/generated/model/meView'
import type { MySummaryView } from '@zentao/api-client/generated/model/mySummaryView'
import type { StorySummaryReport } from '@zentao/api-client/generated/model/storySummaryReport'
import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import type { TaskView } from '@zentao/api-client/generated/model/taskView'
import type { TodoBatchResultItem } from '@zentao/api-client/generated/model/todoBatchResultItem'
import type { TodoView } from '@zentao/api-client/generated/model/todoView'
import type { WeeklyReportView } from '@zentao/api-client/generated/model/weeklyReportView'
import { buildListParams, type ListDsl } from '../../../shared/list-dsl'
import { type DomainMeta, fetchMeta } from '../../../shared/meta'

/** workspace 域数据入口（01 §3.2：域内唯一数据入口，orval 封装 + qk 工厂）。全域 = Todo + /my/* 聚合 + 周报/固定报表（workspace §5）。 */

export type {
  AccountView,
  ActivityView,
  BugDistributionReport,
  BugView,
  BurnReport,
  CasePassRateReport,
  DepartmentNode,
  MeView,
  MySummaryView,
  StorySummaryReport,
  StoryView,
  TaskView,
  TodoView,
  WeeklyReportView,
}

export type ListResult<T> = { items: T[]; total: number }
export type ActivityPage = { items: ActivityView[]; hasMore: boolean }
/** 批量逐项结果（§5）：创建项带 index、动作项带 id，二者均可能为 null（契约 TodoBatchResultItem）。 */
export type BatchCreateResultItem = TodoBatchResultItem
export type AccountOption = { account: string; realName: string }

/** 状态机五动作（§4；批量端点 action 同词表）。 */
export type TodoAction = 'start' | 'finish' | 'activate' | 'close' | 'assign'

// ── Todo（workspace §5 /todos 族） ──

export async function fetchTodos(dsl: ListDsl<ListTodosParams> = {}): Promise<ListResult<TodoView>> {
  return ok(await listTodos(buildListParams<ListTodosParams>(dsl))).data
}

export async function fetchTodo(todoId: number): Promise<TodoView> {
  return ok(await getTodo(todoId)).data
}

export async function submitTodo(body: Record<string, unknown>): Promise<TodoView> {
  return ok(await createTodo(body as never)).data
}

export async function patchTodo(todoId: number, body: Record<string, unknown>): Promise<TodoView> {
  return ok(await updateTodo(todoId, body as never)).data
}

/** 软删待办（仅 createdBy/assignee/超管，他人 40302；workspace §5）。 */
export async function deleteTodoAction(todoId: number): Promise<null> {
  return ok(await deleteTodo(todoId)).data
}

/** 状态机/指派动作（activate/close 无备注时不下发请求体）。 */
export async function runTodoAction(
  todoId: number,
  action: TodoAction,
  params: { assignee?: string; comment?: string | null } = {},
): Promise<TodoView> {
  switch (action) {
    case 'start':
      return ok(await startTodo(todoId)).data
    case 'finish':
      return ok(await finishTodo(todoId)).data
    case 'activate':
      return ok(await activateTodo(todoId, { comment: params.comment ?? null })).data
    case 'close':
      return ok(await closeTodo(todoId, { comment: params.comment ?? null })).data
    default:
      return ok(await assignTodo(todoId, { assignee: params.assignee ?? '', comment: params.comment ?? null })).data
  }
}

/** 批量：items ≤50 创建，或 ids+action+params 逐项动作（§5，逐项成败互不影响）。 */
export async function submitBatchTodos(body: {
  items?: Record<string, unknown>[]
  ids?: number[]
  action?: TodoAction
  params?: Record<string, unknown>
}): Promise<{ results: BatchCreateResultItem[] }> {
  return ok(await batchTodos(body as never)).data
}

export const fetchTodoMeta = (): Promise<DomainMeta> => fetchMeta('todo')

/** 待办动态流（B-WKS-05 / workspace §5：GET /todos/{todoId}/activities，游标倒序）。 */
export async function fetchTodoActivities(todoId: number, beforeId?: number): Promise<ActivityPage> {
  const params = beforeId === undefined ? { limit: 50 } : { limit: 50, beforeId }
  return ok(await listTodoActivities(todoId, params)).data
}

/** 待办类型选项（§5：GET /dicts/todoType；后端只给值，文案走 i18n）。 */
export async function fetchTodoTypes(): Promise<string[]> {
  const data = ok(await getDict('todoType')).data
  return data.items.map((item) => String((item as { value?: unknown }).value ?? '')).filter((value) => value !== '')
}

// ── 我的地盘（§3.4/§5 /my 族） ──

export async function fetchMySummary(): Promise<MySummaryView> {
  return ok(await getMySummary()).data
}

/** role 白名单与目标域字段映射是服务端真源（§3.4）；此处只透传 role 与目标域列表 DSL。 */
export async function fetchMyTasks(
  role: ListMyTasksRole,
  dsl: ListDsl<ListMyTasksParams> = {},
): Promise<ListResult<TaskView>> {
  return ok(await listMyTasks({ role, ...buildListParams<ListMyTasksParams>(dsl) })).data
}

export async function fetchMyBugs(
  role: ListMyBugsRole,
  dsl: ListDsl<ListMyBugsParams> = {},
): Promise<ListResult<BugView>> {
  return ok(await listMyBugs({ role, ...buildListParams<ListMyBugsParams>(dsl) })).data
}

export async function fetchMyStories(
  role: ListMyStoriesRole,
  dsl: ListDsl<ListMyStoriesParams> = {},
): Promise<ListResult<StoryView>> {
  return ok(await listMyStories({ role, ...buildListParams<ListMyStoriesParams>(dsl) })).data
}

export async function fetchMyActivities(params: { limit?: number; beforeId?: number } = {}): Promise<ActivityPage> {
  return ok(
    await listMyActivities({
      limit: params.limit ?? 50,
      ...(params.beforeId === undefined ? {} : { beforeId: params.beforeId }),
    }),
  ).data
}

// ── 周报与固定报表（§5；report 视图结构见 §3.2/§3.3 与 Report* schema） ──

/** 指定周周报（date 传周内任意一天，缺省本周；服务端归一到周一并幂等重算）。 */
export async function fetchWeeklyReport(projectId: number, date?: string): Promise<WeeklyReportView> {
  return ok(await getCurrentWeeklyReport(projectId, date === undefined ? {} : { date })).data
}

export async function fetchBurnReport(executionId: number): Promise<BurnReport> {
  return ok(await getBurnReport(executionId)).data
}

export async function fetchStorySummaryReport(productId: number): Promise<StorySummaryReport> {
  return ok(await getStorySummaryReport(productId)).data
}

export async function fetchBugDistributionReport(productId: number): Promise<BugDistributionReport> {
  return ok(await getBugDistributionReport(productId)).data
}

export async function fetchCasePassRateReport(testRunId: number): Promise<CasePassRateReport> {
  return ok(await getCasePassRateReport(testRunId)).data
}

// ── 个人级设置（§3.5：dashboard.layout 走 platform settings，owner=@me 免 setting-manage 码） ──

export async function fetchSettings(keys: readonly string[]): Promise<Record<string, unknown>> {
  return ok(await getSettings({ keys: keys.join(',') })).data.settings
}

export async function saveSettings(settings: Record<string, unknown>): Promise<void> {
  ok(await putSettings({ settings }))
}

// ── 表单选项（跨域只读：账号经 dicts，关联对象经 platform 全局搜索） ──

export async function fetchAccountOptions(): Promise<AccountOption[]> {
  const data = ok(await getDict('accounts')).data
  return data.items.map((item) => ({
    account: String((item as { account?: unknown }).account ?? ''),
    realName: String((item as { realName?: unknown }).realName ?? (item as { account?: unknown }).account ?? ''),
  }))
}

// ── 个人资料（B-WKS-03 /my/profile：GET /me 取当前账号，PATCH /accounts/{me} 保存） ──

export async function fetchMe(): Promise<MeView> {
  return ok(await getMe()).data
}

export async function patchMyAccount(accountId: number, body: Record<string, unknown>): Promise<AccountView> {
  return ok(await updateAccount(accountId, body as never)).data
}

export type DepartmentOption = { value: number; label: string }

/** 部门树 → 扁平选项（profile 表单 Select 用；层级以全角空格缩进表达，org 域同款口径）。 */
export async function fetchMyDepartmentOptions(): Promise<DepartmentOption[]> {
  const tree = ok(await getDepartmentTree()).data.items
  const flatten = (nodes: DepartmentNode[], depth: number): DepartmentOption[] =>
    nodes.flatMap((node) => [
      { value: node.id, label: `${'　'.repeat(depth)}${node.name}` },
      ...flatten(node.children ?? [], depth + 1),
    ])
  return flatten(tree, 0)
}

/**
 * 关联对象候选（§6 对象选择器）：契约未给 todo 专用对象列表端点，取全局搜索按 scope 过滤的可见对象
 * （scope 白名单见 03 §3；未注册 scope 时由调用方退化为 id 输入，本函数不下发 scope 键）。
 */
export async function searchObjects(
  q: string,
  scope: GlobalSearchScope | null,
): Promise<{ objectId: number; title: string }[]> {
  const data = ok(await globalSearch({ q, limit: 20, ...(scope === null ? {} : { scope }) })).data
  return data.items.map((item) => ({ objectId: item.objectId, title: item.title }))
}

// ── CSV 导出资源路径（03 §3 format=csv；不含 API 基址，由 shared/use-csv-export 补基址） ──

export const TODOS_CSV_PATH = '/todos'

// ── query key 工厂（02 §4） ──

/** 写后失效根：与 qk 首段同源，动作处理器统一按根失效（task/quality 域同范式）。 */
export const WORKSPACE_QUERY_ROOTS = [
  'listTodos',
  'getTodo',
  'listTodoActivities',
  'getMySummary',
  'listMyTasks',
  'listMyBugs',
  'listMyStories',
  'listMyActivities',
  'getCurrentWeeklyReport',
  'getBurnReport',
  'getStorySummaryReport',
  'getBugDistributionReport',
  'getCasePassRateReport',
  'getSettings',
] as const

export const qk = {
  workspace: {
    todoList: (params: unknown) => ['listTodos', params] as const,
    todo: (todoId: number) => ['getTodo', todoId] as const,
    todoActivities: (todoId: number) => ['listTodoActivities', todoId] as const,
    todoMeta: () => ['meta', 'todo'] as const,
    todoTypes: () => ['getDict', 'todoType'] as const,
    mySummary: () => ['getMySummary'] as const,
    myTasks: (params: unknown) => ['listMyTasks', params] as const,
    myBugs: (params: unknown) => ['listMyBugs', params] as const,
    myStories: (params: unknown) => ['listMyStories', params] as const,
    myActivities: (params: unknown) => ['listMyActivities', params] as const,
    weeklyReport: (projectId: number, date: string) => ['getCurrentWeeklyReport', projectId, date] as const,
    burnReport: (executionId: number) => ['getBurnReport', executionId] as const,
    storySummary: (productId: number) => ['getStorySummaryReport', productId] as const,
    bugDistribution: (productId: number) => ['getBugDistributionReport', productId] as const,
    casePassRate: (testRunId: number) => ['getCasePassRateReport', testRunId] as const,
    settings: (keys: string) => ['getSettings', keys] as const,
  },
} as const
