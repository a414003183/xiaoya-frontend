/** @route /todos/batch-edit @title workspace.title.todoBatchEdit @perm todo-edit @hide @activeMenu /my/todos */
// list-standard: exempt (batch-form) — 表即表单（整表可编辑），不接列设置/分页
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  HasPerm,
  hasPerm,
  PageContainer,
  PageHeader,
  PageLoading,
  Select,
  StatusTag,
  Table,
  Typography,
  usePrivileges,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { paramIds } from '../../../shared/url'
import {
  type BatchCreateResultItem,
  fetchAccountOptions,
  fetchTodoMeta,
  fetchTodos,
  qk,
  submitBatchTodos,
  type TodoAction,
  type TodoView,
} from '../api/workspace.api'
import { todoDisplayTitle, todoPriorityKey, todoStatusKey, todoStatusTone, todoTypeKey } from '../model'

/** 待办批量动作（T-7 / §6 B 范式：ids 由列表多选带入，§4 五动作逐项套用，行末显示逐项结果）。 */
export default function TodoBatchEditPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const privileges = usePrivileges()
  const [searchParams] = useSearchParams()
  const ids = paramIds(searchParams)
  const [assignee, setAssignee] = useState<string | null>(null)
  const [results, setResults] = useState<BatchCreateResultItem[]>([])

  const todos = useQuery({
    queryKey: qk.workspace.todoList({ batch: ids.join(',') }),
    queryFn: () => fetchTodos({ limit: 200, filters: { id: ids.join(',') } }),
    enabled: ids.length > 0,
  })
  const meta = useQuery({ queryKey: qk.workspace.todoMeta(), queryFn: fetchTodoMeta })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })

  const submit = useMutation({
    mutationFn: (input: { action: TodoAction; params?: Record<string, unknown> }) =>
      submitBatchTodos({ ids, action: input.action, ...(input.params ? { params: input.params } : {}) }),
    onSuccess: (data) => {
      setResults(data.results)
      void queryClient.invalidateQueries({ queryKey: ['listTodos'] })
      void queryClient.invalidateQueries({ queryKey: ['getTodo'] })
    },
  })

  if (ids.length === 0) {
    return (
      <PageContainer>
        <PageHeader title={t('workspace.title.todoBatchEdit')} backTo="/my/todos" />
        <Card>{t('todo.message.selectFirst')}</Card>
      </PageContainer>
    )
  }
  if (todos.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  /**
   * 批量动作按钮 = meta actions × /me 权限码。此处不过滤 allowedStatus：一屏内各待办状态不同，
   * §4 守卫由服务端逐项套用并经逐项结果回报（前端不替服务端判状态）。
   */
  const actions = (meta.data?.actions ?? []).filter((action) => !action.code || hasPerm(privileges, action.code))
  const mutate = (action: TodoAction, params?: Record<string, unknown>) =>
    submit.mutate(params === undefined ? { action } : { action, params })

  return (
    <PageContainer>
      <PageHeader
        title={t('workspace.title.todoBatchEdit')}
        backTo="/my/todos"
        extra={
          <>
            {actions
              .filter((action) => action.action !== 'assign')
              .map((action) => (
                <Button
                  key={action.action}
                  loading={submit.isPending}
                  onClick={() => mutate(action.action as TodoAction)}
                >
                  {t(action.i18n ?? `todo.action.${action.action}`)}
                </Button>
              ))}
            <HasPerm perm="todo-assign">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                aria-label="batch-assignee"
                className="tw:w-[170px]"
                placeholder={t('todo.field.assignee')}
                value={assignee}
                options={(accounts.data ?? []).map((account) => ({
                  value: account.account,
                  label: `${account.realName}(${account.account})`,
                }))}
                onChange={(next) => setAssignee(next ?? null)}
              />
              <Button
                disabled={assignee === null}
                loading={submit.isPending}
                onClick={() => mutate('assign', { assignee })}
              >
                {t('todo.action.assign')}
              </Button>
            </HasPerm>
          </>
        }
      />
      <Card>
        <Typography.Paragraph type="secondary">{t('todo.message.batchHintEdit')}</Typography.Paragraph>
        {submit.error ? (
          <Typography.Paragraph type="danger">
            {errorText(submit.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
        <Table<TodoView>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={todos.data?.items ?? []}
          columns={[
            { title: t('todo.field.id'), dataIndex: 'id', width: 70 },
            {
              title: t('todo.field.title'),
              dataIndex: 'title',
              render: (_value: string, record: TodoView) => todoDisplayTitle(record),
            },
            {
              title: t('todo.field.type'),
              dataIndex: 'type',
              width: 110,
              render: (value: string) => t(todoTypeKey(value)),
            },
            {
              title: t('todo.field.date'),
              dataIndex: 'date',
              width: 110,
              render: (value: string | null) => value ?? t('todo.message.undated'),
            },
            {
              title: t('common.field.priority'),
              dataIndex: 'priority',
              width: 90,
              render: (value: number) => t(todoPriorityKey(value)),
            },
            {
              title: t('common.field.status'),
              dataIndex: 'status',
              width: 110,
              render: (value: string) => <StatusTag tone={todoStatusTone(value)}>{t(todoStatusKey(value))}</StatusTag>,
            },
            { title: t('todo.field.assignee'), dataIndex: 'assignee', width: 120 },
            {
              title: t('workspace.title.todoBatchEdit'),
              key: 'result',
              width: 150,
              render: (_value: unknown, record: TodoView) => {
                const result = results.find((item) => item.id === record.id)
                if (!result) {
                  return null
                }
                return result.ok ? (
                  <Typography.Text type="success">{t('common.message.saved')}</Typography.Text>
                ) : (
                  <Typography.Text type="danger">{result.error ?? t('common.message.failed')}</Typography.Text>
                )
              },
            },
          ]}
        />
      </Card>
    </PageContainer>
  )
}
