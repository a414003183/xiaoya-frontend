/** @route /tasks/batch-edit @title task.title.batchEdit @perm task-edit @hide @activeMenu /executions */
// list-standard: exempt (batch-form) — 表即表单（整表可编辑），不接列设置/分页
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  HasPerm,
  PageContainer,
  PageHeader,
  PageLoading,
  Select,
  StatusTag,
  Table,
  Typography,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { paramIds, paramNumber } from '../../../shared/url'
import { fetchAccountOptions } from '../../project'
import {
  type BatchResultItem,
  type BatchTaskAction,
  fetchTasks,
  submitBatchTasks,
  type TaskView,
} from '../api/task.api'
import { statusTone } from '../model'

/** 任务批量动作（T-11 / task §6 B 范式：action ∈ edit|assign|start|pause|resume|cancel|close，逐项结果）。 */
export default function TaskBatchEditPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const executionId = paramNumber(searchParams, 'executionId', 0)
  const ids = paramIds(searchParams)
  const [type, setType] = useState<string | null>(null)
  const [priority, setPriority] = useState<number | null>(null)
  const [assignee, setAssignee] = useState<string | null>(null)
  const [closedReason, setClosedReason] = useState<string>('done')
  const [results, setResults] = useState<BatchResultItem[]>([])
  // 枚举字段选项唯一来源（03 §5）：type/priority/closedReason 从 meta 取，前端不留清单。
  const taskMeta = useDomainMeta('task')

  const tasks = useQuery({
    queryKey: ['listExecutionTasks', executionId, 'batch', ids.join(',')],
    queryFn: () => fetchTasks(executionId, { limit: 200, filters: { id: ids.join(',') } }),
    enabled: ids.length > 0 && executionId > 0,
  })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })

  const submit = useMutation({
    mutationFn: (input: { action: BatchTaskAction; params?: Record<string, unknown> }) =>
      submitBatchTasks({ ids, action: input.action, ...(input.params ? { params: input.params } : {}) }),
    onSuccess: (data) => {
      setResults(data.results)
      void queryClient.invalidateQueries({ queryKey: ['listExecutionTasks'] })
      void queryClient.invalidateQueries({ queryKey: ['getTask'] })
    },
  })

  if (ids.length === 0) {
    return (
      <PageContainer>
        <Typography.Text type="secondary">{t('task.message.selectFirst')}</Typography.Text>
      </PageContainer>
    )
  }
  if (tasks.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const run = (action: BatchTaskAction, params?: Record<string, unknown>) =>
    submit.mutate(params ? { action, params } : { action })
  const editParams = {
    ...(type === null ? {} : { type }),
    ...(priority === null ? {} : { priority }),
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('task.title.batchEdit')}
        backTo={`/executions/${executionId}/tasks`}
        extra={
          <>
            <HasPerm perm="task-edit">
              <Select
                allowClear
                aria-label="batch-type"
                placeholder={t('task.field.type')}
                className="tw:w-[130px]"
                value={type}
                onChange={(value) => setType(value ?? null)}
                options={metaOptions(taskMeta.data, 'type', t)}
              />
              <Select
                allowClear
                aria-label="batch-priority"
                placeholder={t('task.field.priority')}
                className="tw:w-[110px]"
                value={priority}
                onChange={(value) => setPriority(value ?? null)}
                options={metaNumberOptions(taskMeta.data, 'priority', t)}
              />
              <Button
                disabled={Object.keys(editParams).length === 0}
                loading={submit.isPending}
                onClick={() => run('edit', editParams)}
              >
                {t('task.action.batchEdit')}
              </Button>
            </HasPerm>
            <HasPerm perm="task-assign">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                aria-label="batch-assignee"
                placeholder={t('task.field.assignee')}
                className="tw:w-[160px]"
                value={assignee}
                onChange={(value) => setAssignee(value ?? null)}
                options={(accounts.data ?? []).map((account) => ({
                  value: account.account,
                  label: `${account.realName}(${account.account})`,
                }))}
              />
              <Button
                disabled={assignee === null}
                loading={submit.isPending}
                onClick={() => run('assign', { assignee })}
              >
                {t('task.action.assign')}
              </Button>
            </HasPerm>
            <HasPerm perm="task-start">
              <Button loading={submit.isPending} onClick={() => run('start')}>
                {t('task.action.start')}
              </Button>
            </HasPerm>
            <HasPerm perm="task-pause">
              <Button loading={submit.isPending} onClick={() => run('pause')}>
                {t('task.action.pause')}
              </Button>
            </HasPerm>
            <HasPerm perm="task-resume">
              <Button loading={submit.isPending} onClick={() => run('resume')}>
                {t('task.action.resume')}
              </Button>
            </HasPerm>
            <HasPerm perm="task-cancel">
              <Button loading={submit.isPending} onClick={() => run('cancel')}>
                {t('task.action.cancel')}
              </Button>
            </HasPerm>
            <HasPerm perm="task-close">
              <Select
                aria-label="batch-closed-reason"
                className="tw:w-[130px]"
                value={closedReason}
                onChange={(value) => setClosedReason(value)}
                options={metaOptions(taskMeta.data, 'closedReason', t)}
              />
              <Button loading={submit.isPending} onClick={() => run('close', { closedReason })}>
                {t('task.action.close')}
              </Button>
            </HasPerm>
          </>
        }
      />
      <Card>
        <Typography.Paragraph type="secondary">{t('task.message.batchHintEdit')}</Typography.Paragraph>
        {submit.error ? (
          <Typography.Paragraph type="danger">
            {errorText(submit.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
        <Table<TaskView>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={tasks.data?.items ?? []}
          columns={[
            { title: t('task.field.id'), dataIndex: 'id', width: 70 },
            { title: t('task.field.title'), dataIndex: 'title' },
            {
              title: t('task.field.type'),
              dataIndex: 'type',
              width: 100,
              render: (value: string) => t(`task.type.${value}`),
            },
            {
              title: t('task.field.priority'),
              dataIndex: 'priority',
              width: 90,
              render: (value: number) => t(`common.priority.${value}`),
            },
            {
              title: t('task.field.status'),
              dataIndex: 'status',
              width: 110,
              render: (value: string) => <StatusTag tone={statusTone(value)}>{t(`task.status.${value}`)}</StatusTag>,
            },
            { title: t('task.field.assignee'), dataIndex: 'assignee', width: 120 },
            {
              title: t('task.title.batchEdit'),
              width: 140,
              render: (_: unknown, row: TaskView) => {
                const result = results.find((item) => item.id === row.id)
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
