/** @route /my/todos @title workspace.title.todos @perm todo-view @menu dashboard @order 2 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  HasPerm,
  hasPerm,
  ListCard,
  PageContainer,
  Space,
  StatusTag,
  type TableColumnsType,
  Typography,
  useMessage,
  usePrivileges,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE } from '../../../shared/list-dsl'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { actionsFor } from '../../../shared/meta'
import { useMetaOptions } from '../../../shared/meta-options'
import { paramNumber, withParam } from '../../../shared/url'
import { csvQuery, useCsvExport } from '../../../shared/use-csv-export'
import {
  fetchTodoMeta,
  fetchTodos,
  qk,
  runTodoAction,
  TODOS_CSV_PATH,
  type TodoAction,
  type TodoView,
  WORKSPACE_QUERY_ROOTS,
} from '../api/workspace.api'
import { TodoAssignModal } from '../components/todo-assign-modal'
import { TodoCreateModal } from '../forms/todo-create-modal'
import { TodoEditModal } from '../forms/todo-edit-modal'
import {
  normalizeDateTab,
  TODO_DATE_TABS,
  type TodoDateTab,
  todoDateFilter,
  todoDisplayTitle,
  todoPriorityKey,
  todoStatusKey,
  todoStatusTone,
  todoTypeKey,
} from '../model'

const PAGE_SIZE = DEFAULT_PAGE_SIZE

/** 待办列表（T-7 / §6 L 范式：data-table + 日期页签（filters[date]）/状态下拉（filters[status]）走 URL；行动作与详情页同源 meta actions）。
 * 状态/优先级/类型筛选值域来自 meta/todo（类型选项与 /dicts/todoType 同源），前端不留清单。 */
export default function TodoListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const privileges = usePrivileges()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<TodoView | null>(null)
  const [assigning, setAssigning] = useState<TodoView | null>(null)
  const todoMeta = useMetaOptions('todo')
  const csv = useCsvExport()

  const tab = normalizeDateTab(searchParams.get('tab'))
  const status = searchParams.get('status') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const type = searchParams.get('type') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = paramNumber(searchParams, 'page', 1)
  const today = new Date().toISOString().slice(0, 10)
  const dateFilter = todoDateFilter(tab, today)
  const listParams = { page, limit: PAGE_SIZE, tab, date: dateFilter ?? '', status, priority, type, q }

  const todos = useQuery({
    queryKey: qk.workspace.todoList(listParams),
    queryFn: () => fetchTodos({ page, limit: PAGE_SIZE, q, filters: { date: dateFilter, status, priority, type } }),
  })
  const meta = useQuery({ queryKey: qk.workspace.todoMeta(), queryFn: fetchTodoMeta })

  const run = useMutation({
    mutationFn: (input: { id: number; action: TodoAction }) => runTodoAction(input.id, input.action),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      for (const root of WORKSPACE_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  /** 行内动作：meta actions（allowedStatus 由 workflow/todo.yml 导出）× /me 权限码，前端不判状态。 */
  const rowActions = (todo: TodoView) =>
    actionsFor(meta.data?.actions, todo.status).filter((action) => !action.code || hasPerm(privileges, action.code))

  const columns: TableColumnsType<TodoView> = [
    { title: t('todo.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('todo.field.title'),
      dataIndex: 'title',
      render: (_value: string, record: TodoView) => (
        <Typography.Link onClick={() => navigate(`/todos/${record.id}`)}>{todoDisplayTitle(record)}</Typography.Link>
      ),
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
      title: t('todo.field.time'),
      key: 'time',
      width: 120,
      render: (_value: unknown, record: TodoView) =>
        record.beginTime ? `${record.beginTime}-${record.endTime ?? ''}` : '-',
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
      width: 100,
      render: (value: string) => <StatusTag tone={todoStatusTone(value)}>{t(todoStatusKey(value))}</StatusTag>,
    },
    { title: t('todo.field.assignee'), dataIndex: 'assignee', width: 110 },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 220,
      render: (_value: unknown, record: TodoView) => (
        <Space size="small" wrap>
          {rowActions(record).map((action) => (
            <Button
              key={action.action}
              size="small"
              onClick={() =>
                action.action === 'assign'
                  ? setAssigning(record)
                  : run.mutate({ id: record.id, action: action.action as TodoAction })
              }
            >
              {t(action.i18n ?? `todo.action.${action.action}`)}
            </Button>
          ))}
          <HasPerm perm="todo-edit">
            <Button size="small" onClick={() => setEditing(record)}>
              {t('todo.action.edit')}
            </Button>
          </HasPerm>
        </Space>
      ),
    },
  ]

  return (
    <PageContainer>
      <ListFilterForm
        fields={[
          keywordField(t('todo.field.keywords'), t('common.action.search')),
          selectField(
            'tab',
            t('todo.field.date'),
            TODO_DATE_TABS.map((item: TodoDateTab) => ({ value: item, label: t(`todo.tab.${item}`) })),
          ),
          selectField('status', t('common.field.status'), todoMeta.options('status')),
          selectField('priority', t('common.field.priority'), todoMeta.options('priority')),
          selectField('type', t('todo.field.type'), todoMeta.options('type')),
        ]}
        /* 日期缺省「今天」与 normalizeDateTab 的兜底一致（不写 URL，重置后回到今天） */
        defaults={{ tab: 'today' }}
      />
      <ListCard<TodoView>
        columns={columns}
        columnSettingKey="workspace-todos"
        actions={
          <>
            <HasPerm perm="todo-create">
              <Button type="primary" onClick={() => setCreateOpen(true)}>
                {t('todo.action.create')}
              </Button>
            </HasPerm>
            <HasPerm perm="todo-create">
              <Button onClick={() => navigate('/todos/batch-create')}>{t('todo.action.batchCreate')}</Button>
            </HasPerm>
            <HasPerm perm="todo-edit">
              <Button
                disabled={selectedIds.length === 0}
                onClick={() => navigate(`/todos/batch-edit?ids=${selectedIds.join(',')}`)}
              >
                {t('todo.action.batchEdit')}
              </Button>
            </HasPerm>
            <Button
              loading={csv.exporting}
              onClick={() =>
                void csv.exportCsv(
                  TODOS_CSV_PATH,
                  csvQuery({ q, filters: { date: dateFilter, status, priority, type } }),
                  'todos',
                )
              }
            >
              {t('common.action.exportCsv')}
            </Button>
          </>
        }
        rowKey="id"
        loading={todos.isPending}
        dataSource={todos.data?.items ?? []}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys.map((key) => Number(key))),
        }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: todos.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <TodoCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <TodoEditModal todo={editing} open={editing !== null} onClose={() => setEditing(null)} />
      <TodoAssignModal todo={assigning} open={assigning !== null} onClose={() => setAssigning(null)} />
    </PageContainer>
  )
}
