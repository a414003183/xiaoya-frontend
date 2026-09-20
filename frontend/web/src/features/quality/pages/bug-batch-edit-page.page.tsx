/** @route /bugs/batch-edit @title quality.title.bugBatchEdit @perm bug-edit @hide @activeMenu /products */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Input,
  PageContainer,
  PageHeader,
  PageLoading,
  Select,
  Table,
  Typography,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { paramIds } from '../../../shared/url'
import { type BatchResultItem, type BugView, fetchAccountOptions, fetchBugs, submitBatchBugs } from '../api/quality.api'

type Row = { id: number; title: string; severity: number; priority: number; lockVersion: number }

/** 只挑改动过的字段（与 story 批量页同语义，域内自持）。 */
function pickChanged(
  original: BugView | undefined,
  row: Row,
): { title?: string; severity?: number; priority?: number } | null {
  if (!original) {
    return null
  }
  const patch: { title?: string; severity?: number; priority?: number } = {}
  if (row.title !== original.title) {
    patch.title = row.title
  }
  if (row.severity !== original.severity) {
    patch.severity = row.severity
  }
  if (row.priority !== original.priority) {
    patch.priority = row.priority
  }
  return Object.keys(patch).length > 0 ? patch : null
}

/** Bug 批量编辑（T-3 / quality §6 B 范式：action ∈ confirm|resolve|activate|close|assign|edit，逐项结果）。 */
export default function BugBatchEditPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const ids = paramIds(searchParams)
  const productId = Number(searchParams.get('productId') ?? 0)
  const [edits, setEdits] = useState<Record<number, Partial<Row>>>({})
  const [assignee, setAssignee] = useState<string | null>(null)
  const [resolution, setResolution] = useState('fixed')
  const [results, setResults] = useState<BatchResultItem[]>([])

  const bugs = useQuery({
    queryKey: ['listBugs', productId, 'batch', ids.join(',')],
    queryFn: () => fetchBugs(productId, { limit: 200, filters: { id: ids.join(',') } }),
    enabled: ids.length > 0 && productId > 0,
  })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  // 枚举字段选项唯一来源（03 §5）：severity/priority 从 meta 取，前端不留清单。
  const bugMeta = useDomainMeta('bug')

  const submit = useMutation({
    mutationFn: async (input: { action: string; ids?: number[]; params?: Record<string, unknown> }) =>
      submitBatchBugs({
        ids: input.ids ?? ids,
        action: input.action,
        ...(input.params ? { params: input.params } : {}),
      }),
    onSuccess: (data) => {
      setResults(data.results)
      void queryClient.invalidateQueries({ queryKey: ['listBugs'] })
      void queryClient.invalidateQueries({ queryKey: ['getBug'] })
    },
  })

  if (ids.length === 0) {
    return (
      <PageContainer>
        <PageHeader title={t('quality.title.bugBatchEdit')} backTo={`/products/${productId}/bugs`} />
        <Card>
          <Typography.Text type="secondary">{t('bug.message.selectFirst')}</Typography.Text>
        </Card>
      </PageContainer>
    )
  }
  if (bugs.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const rows: Row[] = (bugs.data?.items ?? []).map((bug: BugView) => {
    const edited = edits[bug.id] ?? {}
    return {
      id: bug.id,
      title: edited.title ?? bug.title,
      severity: edited.severity ?? bug.severity,
      priority: edited.priority ?? bug.priority,
      lockVersion: bug.lockVersion,
    }
  })
  const update = (id: number, patch: Partial<Row>) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  // A-03 定案：edit 提交 params.rows=[{id,lockVersion,…变更字段}] 逐行乐观锁；只送改动行，ids 与 rows 一一对应
  const changedRows = rows
    .map((row) => {
      const original = (bugs.data?.items ?? []).find((bug) => bug.id === row.id)
      const changed = pickChanged(original, row)
      return changed ? { id: row.id, lockVersion: row.lockVersion, ...changed } : null
    })
    .filter(
      (row): row is { id: number; lockVersion: number; title?: string; severity?: number; priority?: number } =>
        row !== null,
    )

  const columns = [
    { title: t('bug.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('bug.field.title'),
      dataIndex: 'title',
      render: (value: string, row: Row) => (
        <Input
          aria-label={`bug-title-${row.id}`}
          value={value}
          maxLength={255}
          onChange={(event) => update(row.id, { title: event.target.value })}
        />
      ),
    },
    {
      title: t('bug.field.severity'),
      dataIndex: 'severity',
      width: 130,
      render: (value: number, row: Row) => (
        <Select
          aria-label={`bug-severity-${row.id}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.id, { severity: next })}
          options={metaNumberOptions(bugMeta.data, 'severity', t)}
        />
      ),
    },
    {
      title: t('bug.field.priority'),
      dataIndex: 'priority',
      width: 130,
      render: (value: number, row: Row) => (
        <Select
          aria-label={`bug-priority-${row.id}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.id, { priority: next })}
          options={metaNumberOptions(bugMeta.data, 'priority', t)}
        />
      ),
    },
    {
      title: t('common.action.manage'),
      render: (_: unknown, row: Row) => {
        const result = results.find((item) => item.id === row.id)
        if (!result) {
          return null
        }
        return result.ok ? (
          <Typography.Text type="success">ok</Typography.Text>
        ) : (
          <Typography.Text type="danger">{result.error ?? 'error'}</Typography.Text>
        )
      },
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('quality.title.bugBatchEdit')}
        backTo={`/products/${productId}/bugs`}
        extra={
          <>
            <Button loading={submit.isPending} onClick={() => submit.mutate({ action: 'confirm' })}>
              {t('bug.action.confirm')}
            </Button>
            <Button loading={submit.isPending} onClick={() => submit.mutate({ action: 'activate' })}>
              {t('bug.action.activate')}
            </Button>
            <Button loading={submit.isPending} onClick={() => submit.mutate({ action: 'close' })}>
              {t('bug.action.close')}
            </Button>
            <Select
              aria-label="batch-resolution"
              className="tw:w-[140px]"
              value={resolution}
              onChange={(value) => setResolution(value)}
              options={metaOptions(bugMeta.data, 'resolution', t)}
            />
            <Button
              loading={submit.isPending}
              onClick={() => submit.mutate({ action: 'resolve', params: { resolution } })}
            >
              {t('bug.action.resolve')}
            </Button>
            <Select
              aria-label="batch-assignee"
              placeholder={t('bug.field.assignee')}
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
              onClick={() => submit.mutate({ action: 'assign', params: { assignee } })}
            >
              {t('bug.action.assign')}
            </Button>
            <Button
              disabled={changedRows.length === 0}
              loading={submit.isPending}
              onClick={() =>
                submit.mutate({
                  action: 'edit',
                  ids: changedRows.map((row) => row.id),
                  params: { rows: changedRows },
                })
              }
            >
              {t('common.action.save')}
            </Button>
          </>
        }
      />
      <Card>
        <Typography.Paragraph type="secondary">{t('bug.message.batchHintEdit')}</Typography.Paragraph>
        {submit.error ? (
          <Typography.Paragraph type="danger">
            {errorText(submit.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
        <Table rowKey="id" size="small" columns={columns} dataSource={rows} pagination={false} />
      </Card>
    </PageContainer>
  )
}
