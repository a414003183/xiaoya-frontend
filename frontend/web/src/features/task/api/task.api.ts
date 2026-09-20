import { ok } from '@zentao/api-client'
import {
  activateTask,
  assignTask,
  batchCreateTasks,
  batchTasks,
  cancelTask,
  closeTask,
  createEffort,
  createTask,
  deleteEffort,
  deleteTask,
  finishTask,
  getTask,
  listExecutionTasks,
  listTaskActivities,
  listTaskEfforts,
  pauseTask,
  resumeTask,
  startTask,
  updateEffort,
  updateTask,
} from '@zentao/api-client/generated'
import type { ActivityView } from '@zentao/api-client/generated/model/activityView'
import type { EffortView } from '@zentao/api-client/generated/model/effortView'
import type { ListExecutionTasksParams } from '@zentao/api-client/generated/model/listExecutionTasksParams'
import type { ListTaskEffortsParams } from '@zentao/api-client/generated/model/listTaskEffortsParams'
import type { TaskChildSummary } from '@zentao/api-client/generated/model/taskChildSummary'
import type { TaskView } from '@zentao/api-client/generated/model/taskView'
import { buildListParams, type ListDsl } from '../../../shared/list-dsl'
import { type DomainMeta, fetchMeta } from '../../../shared/meta'

/** task 域数据入口（01 §3.2：域内唯一数据入口，orval 封装 + qk 工厂）。 */

export type { ActivityView, EffortView, TaskChildSummary, TaskView }

export type ActivityPage = { items: ActivityView[]; hasMore: boolean }
export type ListResult<T> = { items: T[]; total: number }
export type BatchResultItem = { id: number; ok: boolean; error?: string | null }
export type BatchCreateResultItem = { index: number; ok: boolean; id?: number | null; error?: string | null }

/** 八动作（task §4）：动作端点成功一律返回最新 TaskView。 */
export const TASK_ACTIONS = ['start', 'finish', 'pause', 'resume', 'cancel', 'close', 'activate', 'assign'] as const
export type TaskAction = (typeof TASK_ACTIONS)[number]

/** 批量动作枚举（§5：finish/activate 表单个体差异大，不进批量）。 */
export const BATCH_TASK_ACTIONS = ['edit', 'assign', 'start', 'pause', 'resume', 'cancel', 'close'] as const
export type BatchTaskAction = (typeof BATCH_TASK_ACTIONS)[number]

// ── 任务 ──

export async function fetchTasks(
  executionId: number,
  dsl: ListDsl<ListExecutionTasksParams> = {},
): Promise<ListResult<TaskView>> {
  return ok(await listExecutionTasks(executionId, buildListParams<ListExecutionTasksParams>(dsl))).data
}

export async function fetchTask(taskId: number): Promise<TaskView> {
  return ok(await getTask(taskId)).data
}

export async function submitTask(executionId: number, body: Record<string, unknown>): Promise<TaskView> {
  return ok(await createTask(executionId, body as never)).data
}

export async function patchTask(taskId: number, body: Record<string, unknown>): Promise<TaskView> {
  return ok(await updateTask(taskId, body as never)).data
}

/** 软删任务（守卫：父任务存在未删子任务 → 42203；删子任务后父 isParent 复位；task §5）。 */
export async function deleteTaskAction(taskId: number): Promise<null> {
  return ok(await deleteTask(taskId)).data
}

export async function submitBatchCreateTasks(
  executionId: number,
  items: Record<string, unknown>[],
): Promise<{ results: BatchCreateResultItem[] }> {
  return ok(await batchCreateTasks(executionId, { items: items as never })).data
}

/** 批量动作：逐项结果部分成功（单条失败不影响其余）。 */
export async function submitBatchTasks(body: {
  ids: number[]
  action: BatchTaskAction
  params?: Record<string, unknown>
}): Promise<{ results: BatchResultItem[] }> {
  return ok(await batchTasks(body as never)).data
}

// ── 八动作（状态迁移守卫在服务端 workflow/task.yml） ──

export async function runTaskAction(
  taskId: number,
  action: TaskAction,
  body: Record<string, unknown> = {},
): Promise<TaskView> {
  const request = body as never
  switch (action) {
    case 'start':
      return ok(await startTask(taskId, request)).data
    case 'finish':
      return ok(await finishTask(taskId, request)).data
    case 'pause':
      return ok(await pauseTask(taskId, request)).data
    case 'resume':
      return ok(await resumeTask(taskId, request)).data
    case 'cancel':
      return ok(await cancelTask(taskId, request)).data
    case 'close':
      return ok(await closeTask(taskId, request)).data
    case 'activate':
      return ok(await activateTask(taskId, request)).data
    case 'assign':
      return ok(await assignTask(taskId, request)).data
  }
}

// ── 工时（§3b） ──

export async function fetchTaskEfforts(
  taskId: number,
  dsl: ListDsl<ListTaskEffortsParams> = {},
): Promise<ListResult<EffortView>> {
  return ok(await listTaskEfforts(taskId, buildListParams<ListTaskEffortsParams>(dsl))).data
}

export async function submitEffort(taskId: number, body: Record<string, unknown>): Promise<EffortView> {
  return ok(await createEffort(taskId, body as never)).data
}

export async function patchEffort(effortId: number, body: Record<string, unknown>): Promise<EffortView> {
  return ok(await updateEffort(effortId, body as never)).data
}

export async function deleteEffortAction(effortId: number): Promise<null> {
  return ok(await deleteEffort(effortId)).data
}

// ── 动态流 / meta ──

export async function fetchTaskActivities(taskId: number, beforeId?: number): Promise<ActivityPage> {
  const params = beforeId === undefined ? { limit: 50 } : { limit: 50, beforeId }
  return ok(await listTaskActivities(taskId, params)).data
}

export const fetchTaskMeta = (): Promise<DomainMeta> => fetchMeta('task')

/** 任务族刷新（动作/编辑/工时后统一失效，页面不各写一份）。 */
export const TASK_QUERY_ROOTS = ['listExecutionTasks', 'getTask', 'listTaskEfforts', 'listTaskActivities'] as const

// ── CSV 导出资源路径（03 §3 format=csv；不含 API 基址，由 shared/use-csv-export 补基址） ──

export const tasksCsvPath = (executionId: number): string => `/executions/${executionId}/tasks`

// ── query key 工厂（02 §4） ──

export const qk = {
  task: {
    list: (executionId: number, params: unknown) => ['listExecutionTasks', executionId, params] as const,
    detail: (taskId: number) => ['getTask', taskId] as const,
    efforts: (taskId: number) => ['listTaskEfforts', taskId] as const,
    activities: (taskId: number) => ['listTaskActivities', taskId] as const,
    meta: () => ['meta', 'task'] as const,
  },
} as const
