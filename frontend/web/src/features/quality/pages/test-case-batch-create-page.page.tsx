/** @route /products/:productId/test-cases/batch @title quality.title.caseBatchCreate @perm testcase-create @hide @activeMenu /products */
// list-standard: exempt (batch-form) — 表即表单（整表可编辑），不接列设置/分页
import { useMutation } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Card, Input, PageContainer, PageHeader, Select, Table, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { type BatchCreateResultItem, submitBatchCreateTestCases } from '../api/quality.api'

type Row = {
  key: number
  title: string
  priority: number
  type: string
  needReview: boolean
  result?: string
}

const MAX_ROWS = 50

function emptyRow(key: number): Row {
  return { key, title: '', priority: 3, type: 'feature', needReview: false }
}

/** 用例批量创建（T-5 / quality §6 B 范式：整表可编辑 ≤50，逐项结果部分成功）。 */
export default function TestCaseBatchCreatePage() {
  const { t } = useTranslation()
  const productId = Number(useParams().productId)
  const [rows, setRows] = useState<Row[]>([1, 2, 3, 4, 5].map(emptyRow))
  const [results, setResults] = useState<BatchCreateResultItem[]>([])
  const [nextKey, setNextKey] = useState(6)
  // 行内枚举列选项唯一来源（03 §5）：type 从 meta 取，前端不留清单。
  const caseMeta = useDomainMeta('testCase')

  const submit = useMutation({
    mutationFn: async (allRows: Row[]) => {
      const filled = allRows.filter((row) => row.title.trim().length > 0)
      const data = await submitBatchCreateTestCases(
        productId,
        filled.map((row) => ({
          title: row.title,
          priority: row.priority,
          type: row.type,
          needReview: row.needReview,
        })),
      )
      return { results: data.results, filled }
    },
    onSuccess: ({ results: items, filled }) => {
      setResults(items)
      setRows((prev) =>
        prev.map((row) => {
          const index = filled.findIndex((item) => item.key === row.key)
          const result = index >= 0 ? items.find((item) => item.index === index) : undefined
          if (!result) {
            return row
          }
          return { ...row, result: result.ok ? `#${result.id ?? ''}` : (result.error ?? 'error') }
        }),
      )
    },
  })

  const update = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const columns = [
    {
      title: t('testCase.field.title'),
      dataIndex: 'title',
      render: (value: string, row: Row) => (
        <Input
          aria-label={`case-title-${row.key}`}
          value={value}
          maxLength={255}
          onChange={(event) => update(row.key, { title: event.target.value })}
        />
      ),
    },
    {
      title: t('testCase.field.priority'),
      dataIndex: 'priority',
      width: 130,
      render: (value: number, row: Row) => (
        <Select
          aria-label={`case-priority-${row.key}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.key, { priority: next })}
          options={metaNumberOptions(caseMeta.data, 'priority', t)}
        />
      ),
    },
    {
      title: t('testCase.field.type'),
      dataIndex: 'type',
      width: 150,
      render: (value: string, row: Row) => (
        <Select
          aria-label={`case-type-${row.key}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.key, { type: next })}
          options={metaOptions(caseMeta.data, 'type', t)}
        />
      ),
    },
    {
      title: t('testCase.field.needReview'),
      dataIndex: 'needReview',
      width: 110,
      render: (value: boolean, row: Row) => (
        <Select
          aria-label={`case-need-review-${row.key}`}
          value={value ? '1' : '0'}
          className="tw:w-full"
          onChange={(next) => update(row.key, { needReview: next === '1' })}
          options={[
            { value: '0', label: t('testCase.needReview.no') },
            { value: '1', label: t('testCase.needReview.yes') },
          ]}
        />
      ),
    },
    {
      title: t('common.action.manage'),
      dataIndex: 'result',
      width: 110,
      render: (value: string | undefined) =>
        value ? (
          <Typography.Text {...(value.startsWith('#') ? {} : { type: 'danger' as const })}>{value}</Typography.Text>
        ) : null,
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('quality.title.caseBatchCreate')}
        backTo={`/products/${productId}/test-cases`}
        extra={
          <>
            <Button
              disabled={rows.length >= MAX_ROWS}
              onClick={() => {
                setRows((prev) => [...prev, emptyRow(nextKey)])
                setNextKey((key) => key + 1)
              }}
            >
              {t('common.action.add')}
            </Button>
            <Button type="primary" loading={submit.isPending} onClick={() => submit.mutate(rows)}>
              {t('common.action.submit')}
            </Button>
          </>
        }
      />
      <Card>
        <Typography.Paragraph type="secondary">{t('testCase.message.batchHint')}</Typography.Paragraph>
        {submit.error ? (
          <Typography.Paragraph type="danger">
            {errorText(submit.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
        <Table rowKey="key" size="small" columns={columns} dataSource={rows} pagination={false} />
        <Typography.Paragraph type="secondary" className="tw:mt-3">
          {`${results.filter((result) => result.ok).length}/${results.length || rows.filter((row) => row.title.trim().length > 0).length}`}
        </Typography.Paragraph>
      </Card>
    </PageContainer>
  )
}
