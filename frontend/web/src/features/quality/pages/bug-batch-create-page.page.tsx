/** @route /products/:productId/bugs/batch @title quality.title.bugBatchCreate @perm bug-create @hide @activeMenu /products */
// list-standard: exempt (batch-form) — 表即表单（整表可编辑），不接列设置/分页
import { useMutation } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Card, Input, PageContainer, PageHeader, Select, Table, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { type BatchCreateResultItem, submitBatchCreateBugs } from '../api/quality.api'

type Row = {
  key: number
  title: string
  severity: number
  priority: number
  type: string
  result?: string
}

const MAX_ROWS = 50

function emptyRow(key: number): Row {
  return { key, title: '', severity: 3, priority: 3, type: 'codeerror' }
}

/** Bug 批量创建（T-3 / quality §6 B 范式：整表可编辑 ≤50，逐项结果部分成功）。 */
export default function BugBatchCreatePage() {
  const { t } = useTranslation()
  const productId = Number(useParams().productId)
  const [rows, setRows] = useState<Row[]>([1, 2, 3, 4, 5].map(emptyRow))
  const [results, setResults] = useState<BatchCreateResultItem[]>([])
  const [nextKey, setNextKey] = useState(6)
  // 行内枚举列选项唯一来源（03 §5）：severity/priority/type 从 meta 取，前端不留清单。
  const bugMeta = useDomainMeta('bug')

  const submit = useMutation({
    mutationFn: async (allRows: Row[]) => {
      const filled = allRows.filter((row) => row.title.trim().length > 0)
      const data = await submitBatchCreateBugs(
        productId,
        filled.map((row) => ({
          title: row.title,
          severity: row.severity,
          priority: row.priority,
          type: row.type,
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
      title: t('bug.field.title'),
      dataIndex: 'title',
      render: (value: string, row: Row) => (
        <Input
          aria-label={`bug-title-${row.key}`}
          value={value}
          maxLength={255}
          onChange={(event) => update(row.key, { title: event.target.value })}
        />
      ),
    },
    {
      title: t('bug.field.severity'),
      dataIndex: 'severity',
      width: 130,
      render: (value: number, row: Row) => (
        <Select
          aria-label={`bug-severity-${row.key}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.key, { severity: next })}
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
          aria-label={`bug-priority-${row.key}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.key, { priority: next })}
          options={metaNumberOptions(bugMeta.data, 'priority', t)}
        />
      ),
    },
    {
      title: t('bug.field.type'),
      dataIndex: 'type',
      width: 150,
      render: (value: string, row: Row) => (
        <Select
          aria-label={`bug-type-${row.key}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.key, { type: next })}
          options={metaOptions(bugMeta.data, 'type', t)}
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
        title={t('quality.title.bugBatchCreate')}
        backTo={`/products/${productId}/bugs`}
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
        <Typography.Paragraph type="secondary">{t('bug.message.batchHint')}</Typography.Paragraph>
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
