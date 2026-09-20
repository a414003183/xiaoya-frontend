/** @route /executions/:executionId/kanban @title board.title.executionKanban @perm execution-view @hide @activeMenu /executions */
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Card,
  EmptyState,
  PageContainer,
  PageHeader,
  PageLoading,
  Space,
  StatusTag,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import {
  type ExecutionKanbanLane,
  fetchExecutionKanban,
  KANBAN_COLUMNS,
  moveExecutionKanbanCardAction,
  moveStoryToColumn,
  qk,
} from '../../board'
import { type StoryView, storyTone } from '../../story'

/** 需求卡片（可拖拽；落点只认列，卡片自身不注册 droppable）。 */
function KanbanCard({ story, onOpen }: { story: StoryView; onOpen: () => void }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(story.id) })
  const style = {
    ...(transform ? { transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` } : {}),
    ...(isDragging ? { zIndex: 10, opacity: 0.7 } : {}),
  }
  return (
    <div ref={setNodeRef} style={style} className="tw:cursor-grab tw:select-none" {...attributes} {...listeners}>
      <Card size="small" hoverable>
        <Typography.Link onClick={onOpen}>{story.title}</Typography.Link>
        <Space size={4} wrap className="tw:mt-1">
          <StatusTag tone={storyTone(story.status)}>{t(`story.status.${story.status}`)}</StatusTag>
          <Typography.Text type="secondary" className="tw:text-xs">
            {t(`common.priority.${story.priority}`)}
          </Typography.Text>
          <Typography.Text type="secondary" className="tw:text-xs">
            {t(`story.stage.${story.stage}`)}
          </Typography.Text>
          {story.assignee ? (
            <Typography.Text type="secondary" className="tw:text-xs">
              {story.assignee}
            </Typography.Text>
          ) : null}
        </Space>
      </Card>
    </div>
  )
}

function KanbanColumn({ lane, onOpen }: { lane: ExecutionKanbanLane; onOpen: (storyId: number) => void }) {
  const { t } = useTranslation()
  const { setNodeRef } = useDroppable({ id: lane.key })
  const label = (KANBAN_COLUMNS as readonly string[]).includes(lane.key) ? t(`story.status.${lane.key}`) : lane.key
  return (
    <div ref={setNodeRef} className="tw:w-[280px] tw:shrink-0 tw:self-start">
      <Card
        size="small"
        title={
          <Space size={4}>
            <Typography.Text strong>{label}</Typography.Text>
            <Typography.Text type="secondary">{lane.items.length}</Typography.Text>
          </Space>
        }
      >
        <div className="tw:flex tw:min-h-[40px] tw:flex-col tw:gap-2">
          {lane.items.length === 0 ? (
            <EmptyState description={t('common.empty')} />
          ) : (
            lane.items.map((story) => <KanbanCard key={story.id} story={story} onOpen={() => onOpen(story.id)} />)
          )}
        </div>
      </Card>
    </div>
  )
}

/**
 * 执行需求看板（T-7 / project §5.1 + §6 K 范式）：整板 GET 一次下发，拖拽 = 委托 story 状态动作
 * （POST /executions/{id}/kanban/cards/{storyId}/move）；非法迁移 42202 时 toast 并回滚到原列。
 */
export default function ExecutionKanbanPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const executionId = Number(useParams().executionId)
  const [lanes, setLanes] = useState<ExecutionKanbanLane[]>([])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const kanban = useQuery({
    queryKey: qk.kanban(executionId),
    queryFn: () => fetchExecutionKanban(executionId),
  })
  useEffect(() => {
    if (kanban.data) {
      setLanes(kanban.data)
    }
  }, [kanban.data])

  const move = useMutation({
    mutationFn: (vars: { storyId: number; column: string; previous: ExecutionKanbanLane[] }) =>
      moveExecutionKanbanCardAction(executionId, vars.storyId, vars.column),
    onError: (error, vars) => {
      setLanes(vars.previous)
      message.error(errorText(error, t, 'board.message.kanbanMoveFailed'))
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['getExecutionKanban'] }),
  })

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over) {
      return
    }
    const storyId = Number(event.active.id)
    const column = String(event.over.id)
    const next = moveStoryToColumn(lanes, storyId, column)
    if (!next.moved) {
      return
    }
    move.mutate({ storyId, column, previous: lanes })
    setLanes(next.lanes)
  }

  if (kanban.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('board.title.executionKanban')}
        subtitle={t('board.message.kanbanHint')}
        backTo={`/executions/${executionId}`}
      />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="tw:flex tw:items-start tw:gap-3 tw:overflow-x-auto tw:pb-2">
          {lanes.map((lane) => (
            <KanbanColumn key={lane.key} lane={lane} onOpen={(storyId) => navigate(`/stories/${storyId}`)} />
          ))}
        </div>
      </DndContext>
    </PageContainer>
  )
}
