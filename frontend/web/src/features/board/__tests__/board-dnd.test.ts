import type { CardView } from '@zentao/api-client/generated/model/cardView'
import type { ExecutionKanbanLane } from '@zentao/api-client/generated/model/executionKanbanLane'
import type { LaneView } from '@zentao/api-client/generated/model/laneView'
import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import { describe, expect, test } from 'vitest'
import {
  type BoardState,
  laneCards,
  moveCard,
  moveStoryToColumn,
  reorderLanes,
  restore,
  snapshot,
  wipExceededLaneIds,
  wipLimitExceeded,
} from '../model'

/**
 * 拖拽重排纯函数（T-7）：跨列/列内/相同位置、WIP 判定与乐观更新回滚快照。
 * jsdom 不能模拟真实指针拖拽，本文件是拖拽逻辑的唯一裁判。
 */

function lane(id: number, sort: number, wipLimit = -1): LaneView {
  return { id, boardId: 1, name: `列${id}`, wipLimit, archived: false, sort }
}

function card(id: number, laneId: number, sort: number, archived = false): CardView {
  return {
    id,
    boardId: 1,
    laneId,
    name: `卡片${id}`,
    status: 'doing',
    priority: 3,
    progress: 0,
    archived,
    sort,
    lockVersion: 0,
  }
}

/** 待办(A,B) / 进行中(C) / 已完成 空。 */
function state(): BoardState {
  return {
    lanes: [lane(2, 1), lane(1, 0), lane(3, 2)],
    cards: [card(1, 1, 0), card(2, 1, 1), card(3, 2, 0)],
  }
}

function idsOf(boardState: BoardState, laneId: number): number[] {
  return laneCards(boardState, laneId).map((item) => item.id)
}

describe('moveCard 卡片拖拽重排', () => {
  test('列内排序：同列下移插入后按列重编号 sort', () => {
    const { state: next, move } = moveCard(state(), 1, 1, 1)
    expect(move).toEqual({ cardId: 1, laneId: 1, sort: 1 })
    expect(idsOf(next, 1)).toEqual([2, 1])
    expect(laneCards(next, 1).map((item) => item.sort)).toEqual([0, 1])
  })

  test('跨列插入：目标列指定位次落位，源列重编号', () => {
    const { state: next, move } = moveCard(state(), 3, 1, 0)
    expect(move).toEqual({ cardId: 3, laneId: 1, sort: 0 })
    expect(idsOf(next, 1)).toEqual([3, 1, 2])
    expect(idsOf(next, 2)).toEqual([])
  })

  test('跨列越界位次收敛到列尾', () => {
    const { state: next, move } = moveCard(state(), 1, 2, 99)
    expect(move).toEqual({ cardId: 1, laneId: 2, sort: 1 })
    expect(idsOf(next, 2)).toEqual([3, 1])
  })

  test('相同位置：move 为 null，状态原样返回（幂等，不发请求）', () => {
    const current = state()
    const result = moveCard(current, 1, 1, 0)
    expect(result.move).toBeNull()
    expect(result.state).toBe(current)
  })

  test('目标列或卡片不在板上：move 为 null', () => {
    expect(moveCard(state(), 1, 99, 0).move).toBeNull()
    expect(moveCard(state(), 99, 1, 0).move).toBeNull()
  })

  test('归档卡片不参与面板重排（保持原 laneId/sort）', () => {
    const current: BoardState = {
      lanes: [lane(1, 0)],
      cards: [card(1, 1, 0), card(2, 1, 5, true), card(3, 1, 1)],
    }
    const { state: next, move } = moveCard(current, 3, 1, 0)
    expect(move).toEqual({ cardId: 3, laneId: 1, sort: 0 })
    expect(idsOf(next, 1)).toEqual([3, 1])
    expect(next.cards.find((item) => item.id === 2)).toEqual(card(2, 1, 5, true))
  })
})

describe('reorderLanes 列拖拽排序', () => {
  test('按落点重排并只上报 sort 变化的列', () => {
    const { state: next, updates } = reorderLanes(state(), 1, 2)
    expect(next.lanes.map((item) => item.id)).toEqual([2, 1, 3])
    expect(next.lanes.map((item) => item.sort)).toEqual([0, 1, 2])
    expect(updates).toEqual([
      { laneId: 2, sort: 0 },
      { laneId: 1, sort: 1 },
    ])
  })

  test('同位拖拽：updates 为空且状态不变', () => {
    const current = state()
    const result = reorderLanes(current, 1, 1)
    expect(result.updates).toEqual([])
    expect(result.state).toBe(current)
    expect(reorderLanes(current, 99, 1).updates).toEqual([])
  })
})

describe('WIP 判定', () => {
  test('wipLimit=-1 不限；达到上限不算超限，超过才算', () => {
    expect(wipLimitExceeded(lane(1, 0, -1), 99)).toBe(false)
    expect(wipLimitExceeded(lane(1, 0, 2), 2)).toBe(false)
    expect(wipLimitExceeded(lane(1, 0, 2), 3)).toBe(true)
    expect(wipLimitExceeded(lane(1, 0, 0), 1)).toBe(true)
  })

  test('wipExceededLaneIds 只含超限列', () => {
    const current: BoardState = {
      lanes: [lane(1, 0, 1), lane(2, 1, 2), lane(3, 2, -1)],
      cards: [card(1, 1, 0), card(2, 1, 1), card(3, 2, 0)],
    }
    expect(wipExceededLaneIds(current)).toEqual([1])
  })
})

describe('乐观更新快照与回滚', () => {
  test('快照隔离：乐观结果不影响快照，回滚恢复原列与 sort', () => {
    const current = state()
    const before = snapshot(current)
    const { state: optimistic } = moveCard(current, 1, 2, 0)
    expect(idsOf(optimistic, 2)).toEqual([1, 3])

    const rolled = restore(before)
    expect(idsOf(rolled, 1)).toEqual([1, 2])
    expect(idsOf(rolled, 2)).toEqual([3])
    expect(rolled.cards.find((item) => item.id === 1)?.laneId).toBe(1)
  })
})

describe('moveStoryToColumn 需求看板拖拽', () => {
  function story(id: number, status: StoryView['status']): StoryView {
    return {
      id,
      productId: 1,
      title: `需求${id}`,
      type: 'story',
      status,
      priority: 3,
      stage: 'wait',
      version: 1,
      lockVersion: 0,
    }
  }
  const lanes: ExecutionKanbanLane[] = [
    { key: 'draft', items: [story(1, 'draft')] },
    { key: 'active', items: [story(2, 'active')] },
    { key: 'closed', items: [] },
  ]

  test('跨列搬移：原列移除、目标列追加', () => {
    const { lanes: next, moved } = moveStoryToColumn(lanes, 1, 'active')
    expect(moved).toBe(true)
    expect(next.find((lane) => lane.key === 'draft')?.items).toEqual([])
    expect(next.find((lane) => lane.key === 'active')?.items.map((item) => item.id)).toEqual([2, 1])
  })

  test('同列重拖/未知列/卡片不在板上：moved=false（幂等，不发请求）', () => {
    expect(moveStoryToColumn(lanes, 1, 'draft').moved).toBe(false)
    expect(moveStoryToColumn(lanes, 1, 'none').moved).toBe(false)
    expect(moveStoryToColumn(lanes, 99, 'active').moved).toBe(false)
  })
})
