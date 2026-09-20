import { ok } from '@zentao/api-client'
import {
  activateBoard,
  activateBoardSpace,
  archiveCard,
  closeBoard,
  closeBoardSpace,
  createBoard,
  createBoardSpace,
  createCard,
  createLane,
  createStage,
  deleteBoard,
  deleteBoardSpace,
  deleteCard,
  deleteLane,
  deleteStage,
  getBoard,
  getBoardSpace,
  getCard,
  getExecutionKanban,
  listBoardCards,
  listBoardSpaces,
  listStages,
  moveCard,
  moveExecutionKanbanCard,
  unarchiveCard,
  updateBoard,
  updateBoardSpace,
  updateCard,
  updateLane,
  updateStage,
} from '@zentao/api-client/generated'
import type { BoardSpaceView } from '@zentao/api-client/generated/model/boardSpaceView'
import type { BoardView } from '@zentao/api-client/generated/model/boardView'
import type { CardView } from '@zentao/api-client/generated/model/cardView'
import type { ExecutionKanbanLane } from '@zentao/api-client/generated/model/executionKanbanLane'
import type { LaneView } from '@zentao/api-client/generated/model/laneView'
import type { ListBoardCardsParams } from '@zentao/api-client/generated/model/listBoardCardsParams'
import type { ListBoardSpacesParams } from '@zentao/api-client/generated/model/listBoardSpacesParams'
import type { ListStagesParams } from '@zentao/api-client/generated/model/listStagesParams'
import type { StageView } from '@zentao/api-client/generated/model/stageView'
import { buildListParams, type ListDsl } from '../../../shared/list-dsl'

/** board 域数据入口（01 §3.2：域内唯一数据入口，orval 封装 + qk 工厂）。 */

export type { BoardSpaceView, BoardView, CardView, ExecutionKanbanLane, LaneView, StageView }

export type ListResult<T> = { items: T[]; total: number }

// ── 阶段类型字典（§3.2） ──

export async function fetchStages(dsl: ListDsl<ListStagesParams> = {}): Promise<ListResult<StageView>> {
  return ok(await listStages(buildListParams<ListStagesParams>(dsl))).data
}

export async function submitStage(body: Record<string, unknown>): Promise<StageView> {
  return ok(await createStage(body as never)).data
}

export async function patchStage(stageId: number, body: Record<string, unknown>): Promise<StageView> {
  return ok(await updateStage(stageId, body as never)).data
}

export async function deleteStageAction(stageId: number): Promise<null> {
  return ok(await deleteStage(stageId)).data
}

// ── 看板空间（§3.3） ──

export async function fetchBoardSpaces(dsl: ListDsl<ListBoardSpacesParams> = {}): Promise<ListResult<BoardSpaceView>> {
  return ok(await listBoardSpaces(buildListParams<ListBoardSpacesParams>(dsl))).data
}

/** 空间详情：boards[] 由详情端点填充（列表端点恒空）。 */
export async function fetchBoardSpace(boardSpaceId: number): Promise<BoardSpaceView> {
  return ok(await getBoardSpace(boardSpaceId)).data
}

export async function submitBoardSpace(body: Record<string, unknown>): Promise<BoardSpaceView> {
  return ok(await createBoardSpace(body as never)).data
}

export async function patchBoardSpace(boardSpaceId: number, body: Record<string, unknown>): Promise<BoardSpaceView> {
  return ok(await updateBoardSpace(boardSpaceId, body as never)).data
}

export async function closeBoardSpaceAction(boardSpaceId: number): Promise<BoardSpaceView> {
  return ok(await closeBoardSpace(boardSpaceId, {})).data
}

export async function activateBoardSpaceAction(boardSpaceId: number): Promise<BoardSpaceView> {
  return ok(await activateBoardSpace(boardSpaceId, {})).data
}

/** 软删空间（守卫：空间内仍有看板 → 42203）。 */
export async function deleteBoardSpaceAction(boardSpaceId: number): Promise<null> {
  return ok(await deleteBoardSpace(boardSpaceId)).data
}

// ── 看板（§3.4） ──

export async function submitBoard(boardSpaceId: number, body: Record<string, unknown>): Promise<BoardView> {
  return ok(await createBoard(boardSpaceId, body as never)).data
}

/** 整板一次下发（K 范式数据源）：board + lanes + cards。 */
export async function fetchBoard(boardId: number): Promise<BoardView> {
  return ok(await getBoard(boardId)).data
}

export async function patchBoard(boardId: number, body: Record<string, unknown>): Promise<BoardView> {
  return ok(await updateBoard(boardId, body as never)).data
}

export async function closeBoardAction(boardId: number): Promise<BoardView> {
  return ok(await closeBoard(boardId, {})).data
}

export async function activateBoardAction(boardId: number): Promise<BoardView> {
  return ok(await activateBoard(boardId, {})).data
}

/** 软删看板（守卫：看板内仍有卡片 → 42203）。 */
export async function deleteBoardAction(boardId: number): Promise<null> {
  return ok(await deleteBoard(boardId)).data
}

// ── 看板列（§3.5） ──

export async function submitLane(boardId: number, body: Record<string, unknown>): Promise<LaneView> {
  return ok(await createLane(boardId, body as never)).data
}

export async function patchLane(boardId: number, laneId: number, body: Record<string, unknown>): Promise<LaneView> {
  return ok(await updateLane(boardId, laneId, body as never)).data
}

export async function deleteLaneAction(boardId: number, laneId: number): Promise<null> {
  return ok(await deleteLane(boardId, laneId)).data
}

// ── 看板卡片（§3.6） ──

export async function fetchBoardCards(
  boardId: number,
  dsl: ListDsl<ListBoardCardsParams> = {},
): Promise<ListResult<CardView>> {
  return ok(await listBoardCards(boardId, buildListParams<ListBoardCardsParams>(dsl))).data
}

export async function submitCard(boardId: number, body: Record<string, unknown>): Promise<CardView> {
  return ok(await createCard(boardId, body as never)).data
}

export async function fetchCard(cardId: number): Promise<CardView> {
  return ok(await getCard(cardId)).data
}

export async function patchCard(cardId: number, body: Record<string, unknown>): Promise<CardView> {
  return ok(await updateCard(cardId, body as never)).data
}

/** 拖拽落位：改 laneId + sort（服务端同事务改写；wipLimit 超限 → 42203）。 */
export async function moveCardAction(cardId: number, laneId: number, sort: number): Promise<CardView> {
  return ok(await moveCard(cardId, { laneId, sort })).data
}

/** 归档：archived=true，不改 status。 */
export async function archiveCardAction(cardId: number): Promise<CardView> {
  return ok(await archiveCard(cardId, {})).data
}

/** 取消归档（B-PRJ-13）：archived=false，卡片重新上面板。 */
export async function unarchiveCardAction(cardId: number): Promise<CardView> {
  return ok(await unarchiveCard(cardId, {})).data
}

/** 软删卡片（叶子对象，无守卫）。 */
export async function deleteCardAction(cardId: number): Promise<null> {
  return ok(await deleteCard(cardId)).data
}

// ── 执行需求看板（§5.1） ──

export async function fetchExecutionKanban(executionId: number): Promise<ExecutionKanbanLane[]> {
  return ok(await getExecutionKanban(executionId)).data.lanes
}

/** 拖拽 = 委托 story 状态动作（非法迁移 42202 原样抛 ApiError，页面回滚 + 提示）。 */
export async function moveExecutionKanbanCardAction(
  executionId: number,
  storyId: number,
  column: string,
): Promise<number> {
  return ok(await moveExecutionKanbanCard(executionId, storyId, { column })).data.id
}

/** 看板族刷新（列/卡片/看板/空间变更后统一失效，页面不各写一份）。 */
export const BOARD_QUERY_ROOTS = ['listBoardSpaces', 'getBoardSpace', 'getBoard', 'listBoardCards', 'getCard'] as const

// ── query key 工厂（02 §4） ──

export const qk = {
  boardSpace: {
    list: (params: unknown) => ['listBoardSpaces', params] as const,
    detail: (boardSpaceId: number) => ['getBoardSpace', boardSpaceId] as const,
  },
  board: {
    detail: (boardId: number) => ['getBoard', boardId] as const,
    cards: (boardId: number) => ['listBoardCards', boardId] as const,
  },
  card: {
    detail: (cardId: number) => ['getCard', cardId] as const,
  },
  stage: {
    list: (params: unknown) => ['listStages', params] as const,
  },
  kanban: (executionId: number) => ['getExecutionKanban', executionId] as const,
} as const
