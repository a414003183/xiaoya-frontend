// 域出口白名单（01 §3.2）：跨域只准 import 本文件。

export type {
  ActivityPage,
  BatchCreateResultItem,
  BatchResultItem,
  EffortView,
  ListResult,
  TaskChildSummary,
  TaskView,
} from './api/task.api'
export { fetchTask, fetchTaskMeta, fetchTasks, qk, submitBatchCreateTasks, submitBatchTasks } from './api/task.api'
export {
  BATCH_CREATE_MAX_ROWS,
  type BatchCreateOutcome,
  type BatchCreateRow,
  batchCreateItems,
  batchCreateOutcomes,
  buildTaskTree,
  isOverdue,
  statusTone,
  TASK_STATUSES,
  TASK_TYPES,
  type TaskNode,
  taskProgress,
} from './model'
export { default as TaskListPage } from './pages/task-list-page.page'
