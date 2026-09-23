/** @route /test-cases/batch-edit @title quality.title.caseBatchEdit @perm testcase-edit @hide @activeMenu /products */
// list-standard: exempt (batch-form) — 表即表单（整表可编辑），不接列设置/分页
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { TestCaseView } from '@zentao/api-client/generated/model/testCaseView'
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
import { metaNumberOptions, useDomainMeta } from '../../../shared/meta-options'
import { paramIds } from '../../../shared/url'
import { type BatchResultItem, fetchTestCases, submitBatchTestCases } from '../api/quality.api'
import { canPatchStatus, TEST_CASE_MARKER_STATUSES } from '../model'

type Row = { id: number; title: string; priority: number; status: string; lockVersion: number }

/** 只挑改动过的字段（与 story/bug 批量页同语义，域内自持）。 */
function pickChanged(
  original: TestCaseView | undefined,
  row: Row,
): { title?: string; priority?: number; status?: string } | null {
  if (!original) {
    return null
  }
  const patch: { title?: string; priority?: number; status?: string } = {}
  if (row.title !== original.title) {
    patch.title = row.title
  }
  if (row.priority !== original.priority) {
    patch.priority = row.priority
  }
  if (row.status !== original.status) {
    patch.status = row.status
  }
  return Object.keys(patch).length > 0 ? patch : null
}

/** 用例批量编辑（T-5 / quality §6 B 范式：action ∈ review|edit，逐项结果）。 */
export default function TestCaseBatchEditPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const ids = paramIds(searchParams)
  const productId = Number(searchParams.get('productId') ?? 0)
  const [edits, setEdits] = useState<Record<number, Partial<Row>>>({})
  const [reviewResult, setReviewResult] = useState<'pass' | 'clarify'>('pass')
  const [results, setResults] = useState<BatchResultItem[]>([])
  // 行内 priority 选项唯一来源（03 §5）：从 meta 取，前端不留清单。
  const caseMeta = useDomainMeta('testCase')

  const testCases = useQuery({
    queryKey: ['listTestCases', productId, 'batch', ids.join(',')],
    queryFn: () => fetchTestCases(productId, { limit: 200, filters: { id: ids.join(',') } }),
    enabled: ids.length > 0 && productId > 0,
  })

  const submit = useMutation({
    mutationFn: async (input: { action: string; ids?: number[]; params?: Record<string, unknown> }) =>
      submitBatchTestCases({
        ids: input.ids ?? ids,
        action: input.action,
        ...(input.params ? { params: input.params } : {}),
      }),
    onSuccess: (data) => {
      setResults(data.results)
      void queryClient.invalidateQueries({ queryKey: ['listTestCases'] })
      void queryClient.invalidateQueries({ queryKey: ['getTestCase'] })
    },
  })

  if (ids.length === 0) {
    return (
      <PageContainer>
        <PageHeader title={t('quality.title.caseBatchEdit')} backTo={`/products/${productId}/test-cases`} />
        <Card>
          <Typography.Text type="secondary">{t('testCase.message.selectFirst')}</Typography.Text>
        </Card>
      </PageContainer>
    )
  }
  if (testCases.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const rows: Row[] = (testCases.data?.items ?? []).map((item: TestCaseView) => {
    const edited = edits[item.id] ?? {}
    return {
      id: item.id,
      title: edited.title ?? item.title,
      priority: edited.priority ?? item.priority,
      status: edited.status ?? item.status,
      lockVersion: item.lockVersion,
    }
  })
  const update = (id: number, patch: Partial<Row>) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  // A-03 定案：edit 提交 params.rows=[{id,lockVersion,…变更字段}] 逐行乐观锁；只送改动行，ids 与 rows 一一对应
  const changedRows = rows
    .map((row) => {
      const original = (testCases.data?.items ?? []).find((item) => item.id === row.id)
      const changed = pickChanged(original, row)
      return changed ? { id: row.id, lockVersion: row.lockVersion, ...changed } : null
    })
    .filter(
      (row): row is { id: number; lockVersion: number; title?: string; priority?: number; status?: string } =>
        row !== null,
    )

  const columns = [
    { title: t('testCase.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('testCase.field.title'),
      dataIndex: 'title',
      render: (value: string, row: Row) => (
        <Input
          aria-label={`case-title-${row.id}`}
          value={value}
          maxLength={255}
          onChange={(event) => update(row.id, { title: event.target.value })}
        />
      ),
    },
    {
      title: t('testCase.field.priority'),
      dataIndex: 'priority',
      width: 130,
      render: (value: number, row: Row) => (
        <Select
          aria-label={`case-priority-${row.id}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.id, { priority: next })}
          options={metaNumberOptions(caseMeta.data, 'priority', t)}
        />
      ),
    },
    {
      title: t('testCase.field.status'),
      dataIndex: 'status',
      width: 130,
      render: (value: string, row: Row) =>
        canPatchStatus(value) ? (
          <Select
            aria-label={`case-status-${row.id}`}
            value={value}
            className="tw:w-full"
            onChange={(next) => update(row.id, { status: next })}
            options={TEST_CASE_MARKER_STATUSES.map((item) => ({
              value: item,
              label: t(`testCase.status.${item}`),
            }))}
          />
        ) : (
          <Typography.Text>{t(`testCase.status.${value}`)}</Typography.Text>
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
        title={t('quality.title.caseBatchEdit')}
        backTo={`/products/${productId}/test-cases`}
        extra={
          <>
            <Select
              aria-label="batch-review-result"
              className="tw:w-[140px]"
              value={reviewResult}
              onChange={(value) => setReviewResult(value)}
              options={[
                { value: 'pass', label: t('testCase.review.pass') },
                { value: 'clarify', label: t('testCase.review.clarify') },
              ]}
            />
            <Button
              loading={submit.isPending}
              onClick={() => submit.mutate({ action: 'review', params: { result: reviewResult } })}
            >
              {t('testCase.action.review')}
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
        <Typography.Paragraph type="secondary">{t('testCase.message.batchHintEdit')}</Typography.Paragraph>
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
