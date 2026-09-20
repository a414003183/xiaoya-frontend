/** @route /boards/:boardId @title board.title.board @perm board-view @hide @activeMenu /board-spaces */
import { closestCenter, DndContext } from '@dnd-kit/core'
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Descriptions,
  HasPerm,
  hasPerm,
  PageContainer,
  PageHeader,
  PageLoading,
  Popconfirm,
  Space,
  StatusTag,
  Typography,
  useMessage,
  usePrivileges,
} from '@zentao/design-system'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import {
  activateBoardAction,
  type BoardView,
  type CardView,
  closeBoardAction,
  deleteLaneAction,
  fetchBoard,
  type LaneView,
  qk,
} from '../api/board.api'
import { CardDetailModal } from '../components/card-detail-modal'
import { LaneFormModal } from '../components/lane-form-modal'
import { BoardFormModal } from '../forms/board-form-modal'
import { CardFormModal } from '../forms/card-form-modal'
import {
  type BoardState,
  boardStatusTone,
  cardStatusTone,
  laneCards,
  orderedLanes,
  WIP_UNLIMITED,
  wipExceededLaneIds,
} from '../model'
import { cardDragId, laneDragId, useBoardDnd } from '../use-board-dnd'

/** 单张卡片（可拖拽：跨列/列内排序，落位由 move 端点改写 laneId + sort）。 */
function SortableCard({ card, onOpen }: { card: CardView; onOpen: () => void }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardDragId(card.id),
  })
  const style = {
    ...(transform ? { transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` } : {}),
    ...(transition ? { transition } : {}),
    ...(isDragging ? { zIndex: 10, opacity: 0.7 } : {}),
  }
  return (
    <div ref={setNodeRef} style={style} className="tw:cursor-grab tw:select-none" {...attributes} {...listeners}>
      <Card size="small" hoverable>
        <Typography.Link onClick={onOpen}>{card.name}</Typography.Link>
        <Space size={4} wrap className="tw:mt-1">
          <StatusTag tone={cardStatusTone(card.status)}>{t(`board.cardStatus.${card.status}`)}</StatusTag>
          <Typography.Text type="secondary" className="tw:text-xs">
            {t(`common.priority.${card.priority}`)}
          </Typography.Text>
          {card.assignee ? (
            <Typography.Text type="secondary" className="tw:text-xs">
              {card.assignee}
            </Typography.Text>
          ) : null}
          {card.estimateHours ? (
            <Typography.Text type="secondary" className="tw:text-xs">
              {card.estimateHours}h
            </Typography.Text>
          ) : null}
        </Space>
      </Card>
    </div>
  )
}

/** 一列：列头拖动排序（useSortable 自带 droppable，空列同样可接收卡片），列体是卡片的排序容器。 */
function BoardLane({
  lane,
  cards,
  exceeded,
  canEdit,
  onOpenCard,
  onEditLane,
  onDeleteLane,
  onAddCard,
}: {
  lane: LaneView
  cards: CardView[]
  exceeded: boolean
  canEdit: boolean
  onOpenCard: (cardId: number) => void
  onEditLane: () => void
  onDeleteLane: () => void
  onAddCard: () => void
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: laneDragId(lane.id),
  })
  const style = {
    ...(transform ? { transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` } : {}),
    ...(transition ? { transition } : {}),
    ...(isDragging ? { zIndex: 10, opacity: 0.7 } : {}),
  }
  const wipText = lane.wipLimit === WIP_UNLIMITED ? `${cards.length}` : `${cards.length}/${lane.wipLimit}`

  return (
    <div ref={setNodeRef} style={style} className="tw:w-[280px] tw:shrink-0 tw:self-start">
      <Card
        size="small"
        title={
          <Space size={4}>
            <Button
              ref={setActivatorNodeRef}
              size="small"
              type="text"
              className="tw:cursor-grab"
              aria-label={`lane-handle-${lane.id}`}
              {...attributes}
              {...listeners}
            >
              ⠿
            </Button>
            <Typography.Text strong>{lane.name}</Typography.Text>
          </Space>
        }
        extra={
          <Space size={4}>
            <Typography.Text type={exceeded ? 'danger' : 'secondary'} aria-label={`lane-wip-${lane.id}`}>
              {wipText}
            </Typography.Text>
            {exceeded ? <StatusTag tone="error">{t('board.message.wipExceeded')}</StatusTag> : null}
            {canEdit ? (
              <Space size={0}>
                <Button size="small" type="link" aria-label={`lane-edit-${lane.id}`} onClick={onEditLane}>
                  {t('common.action.edit')}
                </Button>
                <Popconfirm title={t('board.message.deleteLaneHint')} onConfirm={onDeleteLane}>
                  <Button size="small" type="link" danger aria-label={`lane-delete-${lane.id}`}>
                    {t('common.action.delete')}
                  </Button>
                </Popconfirm>
              </Space>
            ) : null}
          </Space>
        }
      >
        <SortableContext items={cards.map((card) => cardDragId(card.id))} strategy={verticalListSortingStrategy}>
          <div className="tw:flex tw:min-h-[40px] tw:flex-col tw:gap-2">
            {cards.map((card) => (
              <SortableCard key={card.id} card={card} onOpen={() => onOpenCard(card.id)} />
            ))}
          </div>
        </SortableContext>
        <HasPerm perm="board-card-create">
          <Button
            size="small"
            type="dashed"
            block
            className="tw:mt-2"
            aria-label={`lane-add-card-${lane.id}`}
            onClick={onAddCard}
          >
            {t('board.action.createCard')}
          </Button>
        </HasPerm>
      </Card>
    </div>
  )
}

/**
 * 看板整板（T-7 / project §6 K 范式）：整板 GET 一次下发 + 列拖拽排序 + 卡片拖拽跨列/列内排序，
 * 乐观更新与失败回滚走 useBoardDnd（纯逻辑在 model.ts），WIP 超限列标红。
 */
export default function BoardPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const privileges = usePrivileges()
  const boardId = Number(useParams().boardId)
  const [state, setState] = useState<BoardState>({ lanes: [], cards: [] })
  const [openCardId, setOpenCardId] = useState<number | null>(null)
  const [editBoardOpen, setEditBoardOpen] = useState(false)
  const [laneForm, setLaneForm] = useState<{ open: boolean; lane: LaneView | null }>({ open: false, lane: null })
  const [cardForm, setCardForm] = useState<{ open: boolean; laneId: number | null }>({ open: false, laneId: null })

  const board = useQuery({ queryKey: qk.board.detail(boardId), queryFn: () => fetchBoard(boardId) })
  useEffect(() => {
    if (board.data) {
      setState({ lanes: board.data.lanes, cards: board.data.cards })
    }
  }, [board.data])

  const dnd = useBoardDnd({ boardId, state, onState: setState })
  const exceeded = new Set(wipExceededLaneIds(state))
  const canEdit = hasPerm(privileges, 'board-edit')

  const removeLane = useMutation({
    mutationFn: (laneId: number) => deleteLaneAction(boardId, laneId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['getBoard'] })
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  const toggleStatus = useMutation({
    mutationFn: (status: string) => (status === 'closed' ? activateBoardAction(boardId) : closeBoardAction(boardId)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['getBoard'] }),
  })

  if (board.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  const view: BoardView | undefined = board.data
  const lanes = orderedLanes(state.lanes)

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            {view?.name ?? ''}
            <StatusTag tone={boardStatusTone(view?.status ?? 'active')}>
              {t(`board.status.${view?.status ?? 'active'}`)}
            </StatusTag>
          </Space>
        }
        backTo={`/board-spaces/${view?.spaceId ?? 0}`}
        extra={
          <>
            <HasPerm perm="board-edit">
              <Button onClick={() => setEditBoardOpen(true)}>{t('common.action.edit')}</Button>
            </HasPerm>
            <HasPerm perm="board-close">
              <Button loading={toggleStatus.isPending} onClick={() => view && toggleStatus.mutate(view.status)}>
                {view?.status === 'closed' ? t('board.action.activateBoard') : t('board.action.closeBoard')}
              </Button>
            </HasPerm>
          </>
        }
      />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('board.field.id'), children: view?.id ?? '-' },
            { key: 'owner', label: t('board.field.owner'), children: view?.owner ?? '-' },
            { key: 'acl', label: t('board.field.acl'), children: t(`board.acl.${view?.acl ?? 'extend'}`) },
            { key: 'sort', label: t('common.field.sort'), children: view?.sort ?? 0 },
            {
              key: 'description',
              label: t('common.field.description'),
              children: view?.description ?? t('board.message.noDescription'),
            },
          ]}
        />
      </Card>
      <DndContext sensors={dnd.sensors} collisionDetection={closestCenter} onDragEnd={dnd.onDragEnd}>
        <SortableContext items={lanes.map((lane) => laneDragId(lane.id))} strategy={horizontalListSortingStrategy}>
          <div className="tw:flex tw:items-start tw:gap-3 tw:overflow-x-auto tw:pb-2">
            {lanes.map((lane) => (
              <BoardLane
                key={lane.id}
                lane={lane}
                cards={laneCards(state, lane.id)}
                exceeded={exceeded.has(lane.id)}
                canEdit={canEdit}
                onOpenCard={setOpenCardId}
                onEditLane={() => setLaneForm({ open: true, lane })}
                onDeleteLane={() => removeLane.mutate(lane.id)}
                onAddCard={() => setCardForm({ open: true, laneId: lane.id })}
              />
            ))}
            {canEdit ? (
              <Button
                type="dashed"
                className="tw:h-[80px] tw:w-[200px] tw:shrink-0"
                aria-label="board-add-lane"
                onClick={() => setLaneForm({ open: true, lane: null })}
              >
                {t('board.action.createLane')}
              </Button>
            ) : null}
          </div>
        </SortableContext>
      </DndContext>
      <Typography.Text type="secondary" className="tw:text-xs">
        {lanes.length === 0 ? t('board.message.emptyBoard') : t('board.message.sortHint')}
      </Typography.Text>
      {view ? (
        <BoardFormModal
          spaceId={view.spaceId}
          board={view}
          open={editBoardOpen}
          onClose={() => setEditBoardOpen(false)}
        />
      ) : null}
      <LaneFormModal
        key={laneForm.lane?.id ?? 'new-lane'}
        boardId={boardId}
        lane={laneForm.lane}
        defaultSort={lanes.length}
        open={laneForm.open}
        onClose={() => setLaneForm({ open: false, lane: null })}
      />
      <CardFormModal
        key={cardForm.laneId ?? 'new-card'}
        boardId={boardId}
        lanes={lanes}
        defaultLaneId={cardForm.laneId}
        open={cardForm.open}
        onClose={() => setCardForm({ open: false, laneId: null })}
      />
      <CardDetailModal
        boardId={boardId}
        cardId={openCardId}
        lanes={lanes}
        open={openCardId !== null}
        onClose={() => setOpenCardId(null)}
      />
    </PageContainer>
  )
}
