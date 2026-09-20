import type { CardView } from '@zentao/api-client/generated/model/cardView'
import type { ExecutionKanbanLane } from '@zentao/api-client/generated/model/executionKanbanLane'
import type { LaneView } from '@zentao/api-client/generated/model/laneView'
import type { StatusTone } from '@zentao/design-system'

/**
 * board 域纯逻辑（01 §3.2 model.ts）：拖拽重排（列内/跨列/列排序）与乐观更新回滚。
 * jsdom 无法模拟真实指针拖拽，本层即拖拽逻辑的裁判——页面只负责把纯函数结果乐观落屏并对失败回滚。
 */

/** wipLimit = -1 表示不限（project §3.5）。 */
export const WIP_UNLIMITED = -1
/** 需求看板列 key = story 状态全集（project §5.1，空列保留）。 */
export const KANBAN_COLUMNS = ['draft', 'reviewing', 'active', 'changing', 'changed', 'closed'] as const

export function boardStatusTone(status: string): StatusTone {
  return status === 'closed' ? 'closed' : 'active'
}

export function cardStatusTone(status: string): StatusTone {
  return status === 'done' ? 'closed' : 'active'
}

/** 整板客户端状态：GET /boards/{boardId} 一次下发后的 lanes + cards 单源。 */
export type BoardState = { lanes: LaneView[]; cards: CardView[] }

/** 列展示口径：sort、id 升序（§3.5 sortable=id sort）。 */
export function orderedLanes(lanes: readonly LaneView[]): LaneView[] {
  return [...lanes].sort((a, b) => a.sort - b.sort || a.id - b.id)
}

/** 列内可见卡片：归属 laneId 且未归档（归档卡片不上面板）；sort、id 升序。 */
export function laneCards(state: BoardState, laneId: number): CardView[] {
  return state.cards
    .filter((card) => card.laneId === laneId && !card.archived)
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
}

export type CardMove = { cardId: number; laneId: number; sort: number }

/**
 * 卡片拖拽落位（project §3.6：归属单源 lane_id + sort）：跨列或列内插入后按列重编号 sort = 0..n-1，
 * 与 POST /cards/{cardId}/move 的服务端语义一致。
 * 落点未变化（同列同位）、卡片或目标列不在板上 → move = null，调用方跳过请求（幂等）。
 */
export function moveCard(
  state: BoardState,
  cardId: number,
  toLaneId: number,
  toIndex: number,
): { state: BoardState; move: CardMove | null } {
  const lanes = orderedLanes(state.lanes)
  if (!lanes.some((lane) => lane.id === toLaneId)) {
    return { state, move: null }
  }
  const lists = new Map(lanes.map((lane) => [lane.id, laneCards(state, lane.id)]))
  const source = lanes.find((lane) => (lists.get(lane.id) ?? []).some((card) => card.id === cardId))
  if (!source) {
    return { state, move: null }
  }
  const fromList = lists.get(source.id) ?? []
  const toList = lists.get(toLaneId) ?? []
  const fromIndex = fromList.findIndex((card) => card.id === cardId)
  const card = fromList[fromIndex]
  if (!card) {
    return { state, move: null }
  }
  const sameLane = source.id === toLaneId
  const index = Math.min(Math.max(toIndex, 0), sameLane ? fromList.length - 1 : toList.length)
  if (sameLane && index === fromIndex) {
    return { state, move: null }
  }
  fromList.splice(fromIndex, 1)
  toList.splice(index, 0, { ...card, laneId: toLaneId })

  const rewritten = new Map<number, CardView>()
  for (const lane of lanes) {
    for (const [position, item] of (lists.get(lane.id) ?? []).entries()) {
      rewritten.set(item.id, { ...item, laneId: lane.id, sort: position })
    }
  }
  // 归档卡片不在面板口径内，保持原值（state.cards.map 对未命中项回退原元素）。
  const cards = state.cards.map((item) => rewritten.get(item.id) ?? item)
  return { state: { lanes: state.lanes, cards }, move: { cardId, laneId: toLaneId, sort: index } }
}

export type LaneSortUpdate = { laneId: number; sort: number }

/**
 * 列拖拽排序：按落点重排 lanes 并重编号 sort = 0..n-1；
 * updates 只含 sort 变化的列（逐列 PATCH，无变化 → 空数组，调用方跳过请求）。
 */
export function reorderLanes(
  state: BoardState,
  activeId: number,
  overId: number,
): { state: BoardState; updates: LaneSortUpdate[] } {
  const lanes = orderedLanes(state.lanes)
  const fromIndex = lanes.findIndex((lane) => lane.id === activeId)
  const toIndex = lanes.findIndex((lane) => lane.id === overId)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return { state, updates: [] }
  }
  const lane = lanes.splice(fromIndex, 1)[0]
  if (!lane) {
    return { state, updates: [] }
  }
  lanes.splice(toIndex, 0, lane)
  const updates: LaneSortUpdate[] = []
  const next = lanes.map((item, index) => {
    if (item.sort !== index) {
      updates.push({ laneId: item.id, sort: index })
    }
    return { ...item, sort: index }
  })
  return { state: { lanes: next, cards: state.cards }, updates }
}

/** WIP 判定（§3.5）：wipLimit ≥ 0 且列内卡片数超过上限。 */
export function wipLimitExceeded(lane: LaneView, cardCount: number): boolean {
  return lane.wipLimit >= 0 && cardCount > lane.wipLimit
}

/** 超限列 id 集（页面标红 + 服务端 42203 回滚后同口径复核）。 */
export function wipExceededLaneIds(state: BoardState): number[] {
  return orderedLanes(state.lanes)
    .filter((lane) => wipLimitExceeded(lane, laneCards(state, lane.id).length))
    .map((lane) => lane.id)
}

/** 乐观更新快照：拖拽前捕获，元素复用、容器隔离（后续展开/重排不污染快照）。 */
export function snapshot(state: BoardState): BoardState {
  return { lanes: [...state.lanes], cards: [...state.cards] }
}

/** 失败回滚：把快照整体回填。 */
export function restore(snapshotState: BoardState): BoardState {
  return { lanes: [...snapshotState.lanes], cards: [...snapshotState.cards] }
}

/**
 * 执行需求看板拖拽落列（project §5.1）：列 key = story 状态，拖拽 = 从原列移除并插入目标列。
 * 目标列不在板上、卡片不在板上或落点即当前列 → moved = false（同列重拖幂等，不发请求）。
 */
export function moveStoryToColumn(
  lanes: readonly ExecutionKanbanLane[],
  storyId: number,
  column: string,
): { lanes: ExecutionKanbanLane[]; moved: boolean } {
  const current = lanes.find((lane) => lane.items.some((story) => story.id === storyId))
  const story = current?.items.find((item) => item.id === storyId)
  if (!current || !story || current.key === column || !lanes.some((lane) => lane.key === column)) {
    return { lanes: [...lanes], moved: false }
  }
  return {
    lanes: lanes.map((lane) => {
      if (lane.key === current.key) {
        return { ...lane, items: lane.items.filter((item) => item.id !== storyId) }
      }
      if (lane.key === column) {
        return { ...lane, items: [...lane.items, story] }
      }
      return lane
    }),
    moved: true,
  }
}
