/** @route /executions/:executionId/tasks/batch-create @title task.title.batchCreate @perm task-create @hide @activeMenu /executions */
// list-standard: exempt (batch-form) — 表即表单（整表可编辑），不接列设置/分页
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Checkbox,
  Input,
  InputNumber,
  PageContainer,
  PageHeader,
  Select,
  Table,
  Typography,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchAccountOptions } from '../../project'
import { submitBatchCreateTasks } from '../api/task.api'
import {
  BATCH_CREATE_MAX_ROWS,
  type BatchCreateOutcome,
  type BatchCreateRow,
  batchCreateItems,
  batchCreateOutcomes,
} from '../model'

function emptyRow(key: number): BatchCreateRow {
  return {
    key,
    title: '',
    type: 'devel',
    priority: 3,
    estimateHours: null,
    assignee: null,
    deadline: '',
    child: false,
  }
}

/** 任务批量创建（T-11 / task §6 B 范式：整表可编辑 ≤50，行可标记为上一行的子任务 → parentIndex）。 */
export default function TaskBatchCreatePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const executionId = Number(useParams().executionId)
  const [rows, setRows] = useState<BatchCreateRow[]>([1, 2, 3, 4, 5].map(emptyRow))
  const [outcomes, setOutcomes] = useState<Map<number, BatchCreateOutcome>>(new Map())
  const [nextKey, setNextKey] = useState(6)

  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  // 行内枚举列选项唯一来源（03 §5）：type/priority 从 meta 取，前端不留清单。
  const taskMeta = useDomainMeta('task')
  const submit = useMutation({
    mutationFn: async (allRows: BatchCreateRow[]) => {
      const { items } = batchCreateItems(allRows)
      const data = await submitBatchCreateTasks(executionId, items as unknown as Record<string, unknown>[])
      return { results: data.results, allRows }
    },
    onSuccess: ({ results, allRows }) => {
      setOutcomes(batchCreateOutcomes(allRows, results))
      void queryClient.invalidateQueries({ queryKey: ['listExecutionTasks'] })
    },
  })

  const update = (key: number, patch: Partial<BatchCreateRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))
  const filled = rows.filter((row) => row.title.trim().length > 0)
  const succeeded = filled.filter((row) => outcomes.get(row.key)?.ok).length

  /** 子任务勾选：上一行已填名称且自身不是子任务（父子仅一层，task §3/§4）。 */
  const childEnabled = (row: BatchCreateRow): boolean => {
    const index = rows.findIndex((item) => item.key === row.key)
    const previous = index > 0 ? rows[index - 1] : undefined
    return previous !== undefined && previous.title.trim().length > 0 && !previous.child
  }

  const columns = [
    {
      title: t('task.field.title'),
      dataIndex: 'title',
      render: (value: string, row: BatchCreateRow) => (
        <Input
          aria-label={`task-title-${row.key}`}
          value={value}
          onChange={(event) => update(row.key, { title: event.target.value })}
        />
      ),
    },
    {
      title: t('task.field.type'),
      dataIndex: 'type',
      width: 130,
      render: (value: string, row: BatchCreateRow) => (
        <Select
          aria-label={`task-type-${row.key}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.key, { type: next })}
          options={metaOptions(taskMeta.data, 'type', t)}
        />
      ),
    },
    {
      title: t('task.field.priority'),
      dataIndex: 'priority',
      width: 110,
      render: (value: number, row: BatchCreateRow) => (
        <Select
          aria-label={`task-priority-${row.key}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.key, { priority: next })}
          options={metaNumberOptions(taskMeta.data, 'priority', t)}
        />
      ),
    },
    {
      title: t('task.field.estimate'),
      dataIndex: 'estimateHours',
      width: 110,
      render: (value: number | null, row: BatchCreateRow) => (
        <InputNumber
          aria-label={`task-estimate-${row.key}`}
          value={value}
          min={0}
          max={999.99}
          onChange={(next) => update(row.key, { estimateHours: next ?? null })}
        />
      ),
    },
    {
      title: t('task.field.assignee'),
      dataIndex: 'assignee',
      width: 150,
      render: (value: string | null, row: BatchCreateRow) => (
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          aria-label={`task-assignee-${row.key}`}
          value={value ?? undefined}
          className="tw:w-full"
          onChange={(next) => update(row.key, { assignee: next ?? null })}
          options={accountOptions}
        />
      ),
    },
    {
      title: t('task.field.deadline'),
      dataIndex: 'deadline',
      width: 130,
      render: (value: string, row: BatchCreateRow) => (
        <Input
          aria-label={`task-deadline-${row.key}`}
          placeholder="YYYY-MM-DD"
          value={value}
          onChange={(event) => update(row.key, { deadline: event.target.value })}
        />
      ),
    },
    {
      title: t('task.field.children'),
      dataIndex: 'child',
      width: 100,
      render: (value: boolean, row: BatchCreateRow) => (
        <Checkbox
          aria-label={`task-child-${row.key}`}
          checked={value}
          disabled={!childEnabled(row)}
          onChange={(event) => update(row.key, { child: event.target.checked })}
        />
      ),
    },
    {
      title: t('task.title.batchCreate'),
      width: 140,
      render: (_: unknown, row: BatchCreateRow) => {
        const outcome = outcomes.get(row.key)
        if (!outcome) {
          return null
        }
        return outcome.ok ? (
          <Typography.Text type="success">{`#${outcome.id ?? ''}`}</Typography.Text>
        ) : (
          <Typography.Text type="danger">
            {t(outcome.error ?? 'task.message.batchFailed', { defaultValue: outcome.error ?? '' })}
          </Typography.Text>
        )
      },
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('task.title.batchCreate')}
        backTo={`/executions/${executionId}/tasks`}
        extra={
          <>
            <Button
              disabled={rows.length >= BATCH_CREATE_MAX_ROWS}
              onClick={() => {
                setRows((prev) => [...prev, emptyRow(nextKey)])
                setNextKey((key) => key + 1)
              }}
            >
              {t('common.action.add')}
            </Button>
            <Button
              type="primary"
              loading={submit.isPending}
              disabled={filled.length === 0}
              onClick={() => submit.mutate(rows)}
            >
              {t('common.action.submit')}
            </Button>
          </>
        }
      />
      <Card>
        <Typography.Paragraph type="secondary">{t('task.message.batchHint')}</Typography.Paragraph>
        {submit.error ? (
          <Typography.Paragraph type="danger">
            {errorText(submit.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
        <Table<BatchCreateRow> rowKey="key" size="small" columns={columns} dataSource={rows} pagination={false} />
        <Typography.Paragraph type="secondary" className="tw:mt-3">
          {`${succeeded}/${filled.length}`}
        </Typography.Paragraph>
      </Card>
    </PageContainer>
  )
}
