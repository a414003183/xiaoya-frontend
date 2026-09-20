/** @route /tasks/:taskId @title task.title.detail @perm task-view @hide @activeMenu /executions */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Descriptions,
  EmptyState,
  HasPerm,
  hasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  PageLoading,
  Popconfirm,
  Space,
  StatusTag,
  Tabs,
  Typography,
  useMessage,
  usePrivileges,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { withParam } from '../../../shared/url'
import { ActivityTimeline, CommentPanel, FileUploadField } from '../../platform'
import {
  deleteTaskAction,
  type EffortView,
  fetchTask,
  fetchTaskActivities,
  fetchTaskMeta,
  qk,
  TASK_QUERY_ROOTS,
  type TaskChildSummary,
} from '../api/task.api'
import { TaskActivateModal } from '../components/task-activate-modal'
import { TaskAssignModal } from '../components/task-assign-modal'
import { type ConfirmTaskAction, TaskCloseModal } from '../components/task-close-modal'
import { TaskEffortList } from '../components/task-effort-list'
import { TaskFinishModal } from '../components/task-finish-modal'
import { TaskStartModal } from '../components/task-start-modal'
import { TaskCreateModal } from '../forms/task-create-modal'
import { TaskEditModal } from '../forms/task-edit-modal'
import { TaskEffortEditModal } from '../forms/task-effort-edit-modal'
import { TaskEffortModal } from '../forms/task-effort-modal'
import { isOverdue, statusTone, taskProgress, visibleTaskActions } from '../model'

type ActionModal = 'start' | 'finish' | 'activate' | 'assign' | null

/** 任务详情（T-10 / task §6 D 范式：页头动作区按 meta actions × 权限码渲染，页签：描述/子任务/工时/动态/评论）。 */
export default function TaskDetailPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const taskId = Number(useParams().taskId)
  const [searchParams, setSearchParams] = useSearchParams()
  const privileges = usePrivileges()
  const [editOpen, setEditOpen] = useState(false)
  const [effortOpen, setEffortOpen] = useState(false)
  const [childOpen, setChildOpen] = useState(false)
  const [editingEffort, setEditingEffort] = useState<EffortView | null>(null)
  const [actionModal, setActionModal] = useState<ActionModal>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmTaskAction | null>(null)

  const task = useQuery({ queryKey: qk.task.detail(taskId), queryFn: () => fetchTask(taskId) })
  const meta = useQuery({ queryKey: qk.task.meta(), queryFn: fetchTaskMeta })
  const queryClient = useQueryClient()

  const remove = useMutation({
    mutationFn: () => deleteTaskAction(taskId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      for (const root of TASK_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
      navigate(`/executions/${task.data?.executionId ?? 0}/tasks`)
    },
    // 存在未删子任务 → 42203，按 code 映射统一文案（§5）
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  if (task.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  const view = task.data
  const today = new Date().toISOString().slice(0, 10)
  const overdue = view !== undefined && isOverdue(view, today)
  const actions = visibleTaskActions(meta.data?.actions, view?.status, view?.isParent ?? false).filter(
    (action) => !action.code || hasPerm(privileges, action.code),
  )

  const openAction = (action: string) => {
    switch (action) {
      case 'edit':
        setEditOpen(true)
        return
      case 'start':
      case 'finish':
      case 'activate':
      case 'assign':
        setActionModal(action)
        return
      case 'close':
      case 'cancel':
      case 'pause':
      case 'resume':
        setConfirmAction(action)
        return
      default:
        return
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            <Typography.Text strong>{view?.title ?? ''}</Typography.Text>
            <StatusTag tone={statusTone(view?.status ?? 'wait')}>
              {t(`task.status.${view?.status ?? 'wait'}`)}
            </StatusTag>
            {overdue ? <StatusTag tone="error">{t('task.message.overdue')}</StatusTag> : null}
          </Space>
        }
        backTo={view ? `/executions/${view.executionId}/tasks` : '/executions'}
        extra={
          <>
            <HasPerm perm="task-effort">
              <Button disabled={view?.isParent ?? false} onClick={() => setEffortOpen(true)}>
                {t('effort.action.record')}
              </Button>
            </HasPerm>
            <HasPerm perm="task-edit">
              <Button onClick={() => setEditOpen(true)}>{t('task.action.edit')}</Button>
            </HasPerm>
            {actions.map((action) => (
              <Button
                key={action.action}
                type={action.action === 'start' || action.action === 'finish' ? 'primary' : 'default'}
                onClick={() => openAction(action.action)}
              >
                {action.i18n ? t(action.i18n) : t(`task.action.${action.action}`)}
              </Button>
            ))}
            <HasPerm perm="task-delete">
              <Popconfirm title={t('task.message.deleteHint')} onConfirm={() => remove.mutate()}>
                <Button danger loading={remove.isPending}>
                  {t('common.action.delete')}
                </Button>
              </Popconfirm>
            </HasPerm>
          </>
        }
      />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('task.field.id'), children: view?.id ?? '-' },
            { key: 'execution', label: t('task.field.execution'), children: view?.executionId ?? '-' },
            {
              key: 'story',
              label: t('task.field.story'),
              children: view?.storyId ? `${view.storyTitle ?? ''} (#${view.storyId})` : '-',
            },
            { key: 'parent', label: t('task.field.parent'), children: view?.parentId || '-' },
            { key: 'type', label: t('task.field.type'), children: t(`task.type.${view?.type ?? 'devel'}`) },
            { key: 'priority', label: t('task.field.priority'), children: t(`common.priority.${view?.priority ?? 3}`) },
            { key: 'assignee', label: t('task.field.assignee'), children: view?.assignee ?? '-' },
            { key: 'estStarted', label: t('task.field.estStarted'), children: view?.estStartedDate ?? '-' },
            { key: 'deadline', label: t('task.field.deadline'), children: view?.deadline ?? '-' },
            { key: 'startedAt', label: t('task.field.startedAt'), children: view?.startedAt ?? '-' },
            { key: 'finishedAt', label: t('task.field.finishedAt'), children: view?.finishedAt ?? '-' },
            {
              key: 'closedReason',
              label: t('task.field.closedReason'),
              children: view?.closedReason ? t(`task.closeReason.${view.closedReason}`) : '-',
            },
            { key: 'estimate', label: t('task.field.estimate'), children: view?.estimateHours ?? '-' },
            { key: 'consumed', label: t('task.field.consumed'), children: view?.consumedHours ?? 0 },
            { key: 'left', label: t('task.field.left'), children: view?.leftHours ?? '-' },
            {
              key: 'progress',
              label: t('task.field.progress'),
              children: `${view ? taskProgress(view) : 0}%`,
            },
            { key: 'keywords', label: t('task.field.keywords'), children: view?.keywords ?? '-' },
            { key: 'createdBy', label: t('common.field.createdBy'), children: view?.createdBy ?? '-' },
          ]}
        />
      </Card>
      <Card>
        <Tabs
          activeKey={searchParams.get('tab') ?? 'description'}
          onChange={(key) => setSearchParams(withParam(searchParams, 'tab', key))}
          items={[
            {
              key: 'description',
              label: t('task.tab.description'),
              children: view?.description ? (
                <Typography.Paragraph>{view.description}</Typography.Paragraph>
              ) : (
                <Typography.Text type="secondary">{t('task.message.noDescription')}</Typography.Text>
              ),
            },
            {
              key: 'children',
              label: t('task.tab.children'),
              children: (
                /* 子任务是一个列表（不是整表编辑）：同样走 ListCard，列设置齿轮与其它列表同位置 */
                <ListCard<TaskChildSummary>
                  rowKey="id"
                  columnSettingKey="task-children"
                  pagination={false}
                  dataSource={view?.children ?? []}
                  actions={
                    view && view.parentId === 0 ? (
                      <HasPerm perm="task-create">
                        <Button onClick={() => setChildOpen(true)}>{t('task.action.createChild')}</Button>
                      </HasPerm>
                    ) : null
                  }
                  locale={{ emptyText: <EmptyState description={t('task.message.noChildren')} /> }}
                  columns={[
                    { title: t('task.field.id'), dataIndex: 'id', width: 70 },
                    {
                      title: t('task.field.title'),
                      dataIndex: 'title',
                      render: (title: string, record: TaskChildSummary) => (
                        <Typography.Link onClick={() => navigate(`/tasks/${record.id}`)}>{title}</Typography.Link>
                      ),
                    },
                    {
                      title: t('task.field.status'),
                      dataIndex: 'status',
                      width: 110,
                      render: (value: string) => (
                        <StatusTag tone={statusTone(value)}>{t(`task.status.${value}`)}</StatusTag>
                      ),
                    },
                    { title: t('task.field.assignee'), dataIndex: 'assignee', width: 120 },
                  ]}
                />
              ),
            },
            {
              key: 'efforts',
              label: t('task.tab.efforts'),
              children: (
                <div className="tw:flex tw:flex-col tw:gap-3">
                  <HasPerm perm="task-effort">
                    <Space>
                      <Button size="small" disabled={view?.isParent ?? false} onClick={() => setEffortOpen(true)}>
                        {t('effort.action.record')}
                      </Button>
                    </Space>
                  </HasPerm>
                  <TaskEffortList
                    taskId={taskId}
                    columnSettingKey="task-efforts"
                    onEdit={(effort) => setEditingEffort(effort)}
                  />
                </div>
              ),
            },
            {
              key: 'activities',
              label: t('task.tab.activities'),
              children: <ActivityTimeline fetchPage={(beforeId) => fetchTaskActivities(taskId, beforeId)} />,
            },
            {
              key: 'comments',
              label: t('platform.comment.title'),
              children: <CommentPanel objectType="task" objectId={taskId} />,
            },
            {
              key: 'files',
              label: t('task.tab.files'),
              children: <FileUploadField objectType="task" objectId={taskId} />,
            },
          ]}
        />
      </Card>
      <TaskEditModal task={view ?? null} open={editOpen} onClose={() => setEditOpen(false)} />
      <TaskEffortModal task={view ?? null} open={effortOpen} onClose={() => setEffortOpen(false)} />
      <TaskEffortEditModal
        effort={editingEffort}
        open={editingEffort !== null}
        onClose={() => setEditingEffort(null)}
      />
      <TaskStartModal task={view ?? null} open={actionModal === 'start'} onClose={() => setActionModal(null)} />
      <TaskFinishModal task={view ?? null} open={actionModal === 'finish'} onClose={() => setActionModal(null)} />
      <TaskActivateModal task={view ?? null} open={actionModal === 'activate'} onClose={() => setActionModal(null)} />
      <TaskAssignModal task={view ?? null} open={actionModal === 'assign'} onClose={() => setActionModal(null)} />
      {view ? (
        <TaskCreateModal
          executionId={view.executionId}
          defaultParentId={view.id}
          open={childOpen}
          onClose={() => setChildOpen(false)}
        />
      ) : null}
      {confirmAction !== null ? (
        <TaskCloseModal task={view ?? null} action={confirmAction} open onClose={() => setConfirmAction(null)} />
      ) : null}
    </PageContainer>
  )
}
