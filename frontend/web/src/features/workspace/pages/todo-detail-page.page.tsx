/** @route /todos/:todoId @title workspace.title.todoDetail @perm todo-view @hide @activeMenu /my/todos */
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
  Tabs,
  Typography,
  useMessage,
  usePrivileges,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { formatDateTime } from '../../../shared/format'
import { actionsFor } from '../../../shared/meta'
import { ActivityTimeline } from '../../platform'
import {
  deleteTodoAction,
  fetchTodo,
  fetchTodoActivities,
  fetchTodoMeta,
  qk,
  runTodoAction,
  type TodoAction,
  WORKSPACE_QUERY_ROOTS,
} from '../api/workspace.api'
import { TodoAssignModal } from '../components/todo-assign-modal'
import { TodoEditModal } from '../forms/todo-edit-modal'
import { todoDisplayTitle, todoPriorityKey, todoStatusKey, todoStatusTone, todoTypeKey } from '../model'

/** 待办详情（T-7 / §6 D 范式：页头标题/状态/动作区 + 字段区；动作显隐只认 meta actions × /me 权限码）。 */
export default function TodoDetailPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const privileges = usePrivileges()
  const todoId = Number(useParams().todoId)
  const [editOpen, setEditOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [tab, setTab] = useState('description')

  const todo = useQuery({ queryKey: qk.workspace.todo(todoId), queryFn: () => fetchTodo(todoId) })
  const meta = useQuery({ queryKey: qk.workspace.todoMeta(), queryFn: fetchTodoMeta })

  const run = useMutation({
    mutationFn: (action: TodoAction) => runTodoAction(todoId, action),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      for (const root of WORKSPACE_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  const remove = useMutation({
    mutationFn: () => deleteTodoAction(todoId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      for (const root of WORKSPACE_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
      navigate('/my/todos')
    },
    // 非创建人/负责人 → 40302（§7 数据权限），按 code 映射统一文案
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  if (todo.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  // §7 详情收紧：他人 isPrivate 待办 40302、软删/不存在 40401，原样呈现服务端文案
  if (todo.error) {
    return (
      <PageContainer>
        <PageHeader title={t('workspace.title.todoDetail')} backTo="/my/todos" />
        <Card>
          <Typography.Text type="danger">{errorText(todo.error, t, 'common.message.failed')}</Typography.Text>
        </Card>
      </PageContainer>
    )
  }
  const view = todo.data
  const actions = actionsFor(meta.data?.actions, view?.status).filter(
    (action) => !action.code || hasPerm(privileges, action.code),
  )
  const orDash = (value: string | null | undefined): string => value ?? '-'

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            <Typography.Text strong>{view ? todoDisplayTitle(view) : ''}</Typography.Text>
            <StatusTag tone={todoStatusTone(view?.status ?? 'wait')}>
              {t(todoStatusKey(view?.status ?? 'wait'))}
            </StatusTag>
            {view?.isPrivate ? <StatusTag tone="warning">{t('todo.field.isPrivate')}</StatusTag> : null}
          </Space>
        }
        backTo="/my/todos"
        extra={
          <>
            <HasPerm perm="todo-edit">
              <Button onClick={() => setEditOpen(true)}>{t('todo.action.edit')}</Button>
            </HasPerm>
            {actions.map((action) => (
              <Button
                key={action.action}
                type={action.action === 'finish' ? 'primary' : 'default'}
                loading={run.isPending && run.variables === action.action}
                onClick={() =>
                  action.action === 'assign' ? setAssignOpen(true) : run.mutate(action.action as TodoAction)
                }
              >
                {t(action.i18n ?? `todo.action.${action.action}`)}
              </Button>
            ))}
            <HasPerm perm="todo-delete">
              <Popconfirm title={t('todo.message.deleteHint')} onConfirm={() => remove.mutate()}>
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
            { key: 'id', label: t('todo.field.id'), children: orDash(view ? String(view.id) : null) },
            { key: 'type', label: t('todo.field.type'), children: t(todoTypeKey(view?.type ?? 'custom')) },
            {
              key: 'object',
              label: t('todo.field.object'),
              children: view && view.objectId > 0 ? `${view.objectTitle ?? ''} (#${view.objectId})` : '-',
            },
            { key: 'date', label: t('todo.field.date'), children: view?.date ?? t('todo.message.undated') },
            {
              key: 'time',
              label: t('todo.field.time'),
              children: view?.beginTime ? `${view.beginTime}-${view.endTime ?? ''}` : '-',
            },
            { key: 'priority', label: t('common.field.priority'), children: t(todoPriorityKey(view?.priority)) },
            { key: 'status', label: t('common.field.status'), children: t(todoStatusKey(view?.status ?? 'wait')) },
            { key: 'assignee', label: t('todo.field.assignee'), children: orDash(view?.assignee) },
            { key: 'assignedBy', label: t('todo.field.assignedBy'), children: orDash(view?.assignedBy) },
            {
              key: 'assignedAt',
              label: t('todo.field.assignedAt'),
              children: formatDateTime(view?.assignedAt) || '-',
            },
            { key: 'finishedBy', label: t('todo.field.finishedBy'), children: orDash(view?.finishedBy) },
            {
              key: 'finishedAt',
              label: t('todo.field.finishedAt'),
              children: formatDateTime(view?.finishedAt) || '-',
            },
            { key: 'closedBy', label: t('todo.field.closedBy'), children: orDash(view?.closedBy) },
            {
              key: 'closedAt',
              label: t('todo.field.closedAt'),
              children: formatDateTime(view?.closedAt) || '-',
            },
            { key: 'createdBy', label: t('common.field.createdBy'), children: orDash(view?.createdBy) },
            {
              key: 'createdAt',
              label: t('common.field.createdAt'),
              children: formatDateTime(view?.createdAt) || '-',
            },
          ]}
        />
      </Card>
      <Card>
        {/* 描述 + 动态页签（B-WKS-05：动态复用 platform ActivityTimeline，注入 /todos/{id}/activities） */}
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'description',
              label: t('todo.field.description'),
              children: view?.description ? (
                <Typography.Paragraph>{view.description}</Typography.Paragraph>
              ) : (
                <Typography.Text type="secondary">{t('todo.message.noDescription')}</Typography.Text>
              ),
            },
            {
              key: 'activities',
              label: t('todo.tab.activities'),
              children: <ActivityTimeline fetchPage={(beforeId) => fetchTodoActivities(todoId, beforeId)} />,
            },
          ]}
        />
      </Card>
      <TodoEditModal todo={view ?? null} open={editOpen} onClose={() => setEditOpen(false)} />
      <TodoAssignModal todo={view ?? null} open={assignOpen} onClose={() => setAssignOpen(false)} />
    </PageContainer>
  )
}
