import { type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { useMessage } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { moveCardAction, patchLane } from './api/board.api'
import {
  type BoardState,
  type CardMove,
  type LaneSortUpdate,
  laneCards,
  moveCard,
  reorderLanes,
  restore,
  snapshot,
} from './model'

/** dnd-kit 可拖拽 id 编码：列与卡片同处一个 DndContext，前缀消歧。 */
export const LANE_DRAG_PREFIX = 'lane:'
export const CARD_DRAG_PREFIX = 'card:'

export function laneDragId(laneId: number): string {
  return `${LANE_DRAG_PREFIX}${laneId}`
}

export function cardDragId(cardId: number): string {
  return `${CARD_DRAG_PREFIX}${cardId}`
}

/** 解析 dnd-kit 的 active/over id；非本域 id（外部拖入）返回 null。 */
export function parseDragId(value: string | number): { kind: 'lane' | 'card'; id: number } | null {
  const raw = String(value)
  const id = Number(raw.slice(raw.indexOf(':') + 1))
  if (!Number.isFinite(id)) {
    return null
  }
  if (raw.startsWith(LANE_DRAG_PREFIX)) {
    return { kind: 'lane', id }
  }
  if (raw.startsWith(CARD_DRAG_PREFIX)) {
    return { kind: 'card', id }
  }
  return null
}

/**
 * 看板拖拽接线（T-7）：纯函数算下一状态 → 乐观落屏 → 发 mutation → 失败用快照整体回滚 + 提示。
 * 拖拽逻辑本身在 model.ts（可单测），本 hook 只做 dnd-kit 事件到 mutation 的翻译。
 */
export function useBoardDnd({
  boardId,
  state,
  onState,
}: {
  boardId: number
  state: BoardState
  onState: (next: BoardState) => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const cardMove = useMutation({
    mutationFn: (vars: { move: CardMove; previous: BoardState }) =>
      moveCardAction(vars.move.cardId, vars.move.laneId, vars.move.sort),
    onError: (error, vars) => {
      // 落位失败：42203（WIP 超限）等按错误码映射 i18n（A4-3），网络类错误回落域内 key
      onState(restore(vars.previous))
      message.error(errorText(error, t, 'board.message.moveFailed'))
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['getBoard'] }),
  })

  const laneSort = useMutation({
    mutationFn: (vars: { updates: LaneSortUpdate[]; previous: BoardState }) =>
      Promise.all(vars.updates.map((update) => patchLane(boardId, update.laneId, { sort: update.sort }))),
    onError: (error, vars) => {
      onState(restore(vars.previous))
      message.error(errorText(error, t, 'board.message.moveFailed'))
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['getBoard'] }),
  })

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) {
      return
    }
    const from = parseDragId(active.id)
    const to = parseDragId(over.id)
    if (!from || !to) {
      return
    }
    if (from.kind === 'lane') {
      if (to.kind !== 'lane') {
        return
      }
      const { state: next, updates } = reorderLanes(state, from.id, to.id)
      if (updates.length === 0) {
        return
      }
      laneSort.mutate({ updates, previous: snapshot(state) })
      onState(next)
      return
    }
    const toLaneId = to.kind === 'lane' ? to.id : (state.cards.find((card) => card.id === to.id)?.laneId ?? 0)
    const laneList = laneCards(state, toLaneId)
    const toIndex = to.kind === 'lane' ? laneList.length : laneList.findIndex((card) => card.id === to.id)
    const { state: next, move } = moveCard(state, from.id, toLaneId, Math.max(toIndex, 0))
    if (!move) {
      return
    }
    cardMove.mutate({ move, previous: snapshot(state) })
    onState(next)
  }

  return { sensors, onDragEnd }
}
