/** @route /todos/batch-create @title workspace.title.todoBatchCreate @perm todo-create @hide @activeMenu /my/todos */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Card, Input, PageContainer, PageHeader, Select, Space, Table, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { metaNumberOptions } from '../../../shared/meta-options'
import { fetchAccountOptions, fetchTodoMeta, fetchTodoTypes, qk, submitBatchTodos } from '../api/workspace.api'
import {
  TODO_BATCH_MAX_ROWS,
  type TodoBatchOutcome,
  type TodoBatchRow,
  todoBatchItems,
  todoBatchOutcomes,
  todoObjectRequired,
  todoTypeKey,
} from '../model'

function emptyRow(key: number, type: string, date: string): TodoBatchRow {
  return { key, title: '', type, objectId: null, date, beginTime: '', endTime: '', priority: 3, assignee: null }
}

/** 待办批量创建（T-7 / §6 B 范式：整表可编辑 ≤50，逐行结果来自 results[].{index,ok,error}）。 */
export default function TodoBatchCreatePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const types = useQuery({ queryKey: qk.workspace.todoTypes(), queryFn: fetchTodoTypes })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  // 行内 priority 选项唯一来源（03 §5）：从 meta 取，前端不留清单。
  const meta = useQuery({ queryKey: qk.workspace.todoMeta(), queryFn: fetchTodoMeta })
  const defaultType = types.data?.[0] ?? 'custom'
  const [rows, setRows] = useState<TodoBatchRow[]>([1, 2, 3, 4, 5].map((key) => emptyRow(key, 'custom', today)))
  const [outcomes, setOutcomes] = useState<Map<number, TodoBatchOutcome>>(new Map())
  const [nextKey, setNextKey] = useState(6)

  const submit = useMutation({
    mutationFn: async (allRows: readonly TodoBatchRow[]) => {
      const { items } = todoBatchItems(allRows)
      const data = await submitBatchTodos({ items })
      return { results: data.results, allRows }
    },
    onSuccess: ({ results, allRows }) => {
      setOutcomes(todoBatchOutcomes(allRows, results))
      void queryClient.invalidateQueries({ queryKey: ['listTodos'] })
      void queryClient.invalidateQueries({ queryKey: ['getMySummary'] })
    },
  })

  const update = (key: number, patch: Partial<TodoBatchRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const filled = rows.filter((row) => row.title.trim().length > 0)
  const succeeded = filled.filter((row) => outcomes.get(row.key)?.ok).length
  const typeOptions = (types.data ?? []).map((value) => ({ value, label: t(todoTypeKey(value)) }))
  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))

  const columns = [
    {
      title: t('todo.field.title'),
      dataIndex: 'title',
      render: (value: string, row: TodoBatchRow) => (
        <Input
          aria-label={`todo-title-${row.key}`}
          value={value}
          maxLength={150}
          onChange={(event) => update(row.key, { title: event.target.value })}
        />
      ),
    },
    {
      title: t('todo.field.type'),
      dataIndex: 'type',
      width: 130,
      render: (value: string, row: TodoBatchRow) => (
        <Select
          aria-label={`todo-type-${row.key}`}
          className="tw:w-full"
          value={value}
          options={typeOptions}
          onChange={(next) => update(row.key, { type: next, objectId: null })}
        />
      ),
    },
    {
      title: t('todo.field.object'),
      dataIndex: 'objectId',
      width: 120,
      render: (value: number | null, row: TodoBatchRow) =>
        todoObjectRequired(row.type) ? (
          <Input
            aria-label={`todo-object-${row.key}`}
            value={value ?? ''}
            placeholder={t('todo.message.objectIdPlaceholder')}
            onChange={(event) => {
              const next = event.target.value.trim()
              update(row.key, { objectId: next === '' ? null : Number(next) })
            }}
          />
        ) : (
          '-'
        ),
    },
    {
      title: t('todo.field.date'),
      dataIndex: 'date',
      width: 130,
      render: (value: string, row: TodoBatchRow) => (
        <Input
          aria-label={`todo-date-${row.key}`}
          placeholder="YYYY-MM-DD"
          value={value}
          onChange={(event) => update(row.key, { date: event.target.value })}
        />
      ),
    },
    {
      title: t('todo.field.time'),
      key: 'time',
      width: 190,
      render: (_value: unknown, row: TodoBatchRow) => (
        <Space size="small">
          <Input
            aria-label={`todo-begin-${row.key}`}
            className="tw:w-[80px]"
            placeholder="HH:mm"
            value={row.beginTime}
            onChange={(event) => update(row.key, { beginTime: event.target.value })}
          />
          <Input
            aria-label={`todo-end-${row.key}`}
            className="tw:w-[80px]"
            placeholder="HH:mm"
            value={row.endTime}
            onChange={(event) => update(row.key, { endTime: event.target.value })}
          />
        </Space>
      ),
    },
    {
      title: t('common.field.priority'),
      dataIndex: 'priority',
      width: 110,
      render: (value: number, row: TodoBatchRow) => (
        <Select
          aria-label={`todo-priority-${row.key}`}
          className="tw:w-full"
          value={value}
          options={metaNumberOptions(meta.data, 'priority', t)}
          onChange={(next) => update(row.key, { priority: next })}
        />
      ),
    },
    {
      title: t('todo.field.assignee'),
      dataIndex: 'assignee',
      width: 160,
      render: (value: string | null, row: TodoBatchRow) => (
        <Select
          aria-label={`todo-assignee-${row.key}`}
          allowClear
          showSearch
          optionFilterProp="label"
          className="tw:w-full"
          value={value ?? undefined}
          options={accountOptions}
          onChange={(next) => update(row.key, { assignee: next ?? null })}
        />
      ),
    },
    {
      title: t('workspace.title.todoBatchCreate'),
      key: 'result',
      width: 160,
      render: (_value: unknown, row: TodoBatchRow) => {
        const outcome = outcomes.get(row.key)
        if (!outcome) {
          return null
        }
        return outcome.ok ? (
          <Typography.Text type="success">{`#${outcome.id ?? ''}`}</Typography.Text>
        ) : (
          <Typography.Text type="danger">{t(outcome.error ?? 'todo.message.batchFailed')}</Typography.Text>
        )
      },
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('workspace.title.todoBatchCreate')}
        backTo="/my/todos"
        extra={
          <>
            <Button
              disabled={rows.length >= TODO_BATCH_MAX_ROWS}
              onClick={() => {
                setRows((prev) => [...prev, emptyRow(nextKey, defaultType, today)])
                setNextKey((key) => key + 1)
              }}
            >
              {t('common.action.add')}
            </Button>
            <Button
              type="primary"
              loading={submit.isPending}
              disabled={filled.length === 0}
              onClick={() => void submit.mutateAsync(rows)}
            >
              {t('common.action.submit')}
            </Button>
          </>
        }
      />
      <Card>
        <Typography.Paragraph type="secondary">{t('todo.message.batchHint')}</Typography.Paragraph>
        {submit.error ? (
          <Typography.Paragraph type="danger">
            {errorText(submit.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
        <Table<TodoBatchRow> rowKey="key" size="small" columns={columns} dataSource={rows} pagination={false} />
        <Typography.Paragraph type="secondary" className="tw:mt-3">
          {`${succeeded}/${filled.length}`}
        </Typography.Paragraph>
      </Card>
    </PageContainer>
  )
}
