// 域出口白名单（01 §3.2）：跨域只准 import 本文件。

export type {
  BoardSpaceView,
  BoardView,
  CardView,
  ExecutionKanbanLane,
  LaneView,
  ListResult,
  StageView,
} from './api/board.api'
export {
  deleteStageAction,
  fetchExecutionKanban,
  fetchStages,
  moveExecutionKanbanCardAction,
  patchStage,
  qk,
  submitStage,
} from './api/board.api'
export { KANBAN_COLUMNS, moveStoryToColumn } from './model'
