/** @route /products/:productId/stories/batch @title story.title.batchCreate @perm story-create @hide @activeMenu /products */
// list-standard: exempt (batch-form) — 表即表单（整表可编辑），不接列设置/分页
import { useMutation } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
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
import { type BatchCreateResultItem, submitBatchCreateStories } from '../api/story.api'

type Row = {
  key: number
  title: string
  type: string
  priority: number
  estimateHours: number | null
  source: string
  result?: string
}

const MAX_ROWS = 50

function emptyRow(key: number): Row {
  return { key, title: '', type: 'story', priority: 3, estimateHours: null, source: 'manual' }
}

/** 需求批量创建（T-5 / requirement §6 B 范式：整表可编辑 ≤50，逐项结果部分成功）。 */
export default function StoryBatchCreatePage() {
  const { t } = useTranslation()
  const productId = Number(useParams().productId)
  const [rows, setRows] = useState<Row[]>([1, 2, 3, 4, 5].map(emptyRow))
  const [results, setResults] = useState<BatchCreateResultItem[]>([])
  const [nextKey, setNextKey] = useState(6)
  // 行内枚举列选项唯一来源（03 §5）：type/priority/source 从 meta 取，前端不留清单。
  const storyMeta = useDomainMeta('story')

  const submit = useMutation({
    mutationFn: async (allRows: Row[]) => {
      const filled = allRows.filter((row) => row.title.trim().length > 0)
      const data = await submitBatchCreateStories(
        productId,
        filled.map((row) => ({
          title: row.title,
          type: row.type,
          priority: row.priority,
          source: row.source,
          estimateHours: row.estimateHours,
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
      title: t('story.field.title'),
      dataIndex: 'title',
      render: (value: string, row: Row) => (
        <Input
          aria-label={`story-title-${row.key}`}
          value={value}
          onChange={(event) => update(row.key, { title: event.target.value })}
        />
      ),
    },
    {
      title: t('story.field.type'),
      dataIndex: 'type',
      width: 140,
      render: (value: string, row: Row) => (
        <Select
          aria-label={`story-type-${row.key}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.key, { type: next })}
          options={metaOptions(storyMeta.data, 'type', t)}
        />
      ),
    },
    {
      title: t('story.field.priority'),
      dataIndex: 'priority',
      width: 120,
      render: (value: number, row: Row) => (
        <Select
          aria-label={`story-priority-${row.key}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.key, { priority: next })}
          options={metaNumberOptions(storyMeta.data, 'priority', t)}
        />
      ),
    },
    {
      title: t('story.field.estimate'),
      dataIndex: 'estimateHours',
      width: 110,
      render: (value: number | null, row: Row) => (
        <InputNumber
          aria-label={`story-estimate-${row.key}`}
          value={value}
          min={0}
          max={999.99}
          onChange={(next) => update(row.key, { estimateHours: next ?? null })}
        />
      ),
    },
    {
      title: t('story.field.source'),
      dataIndex: 'source',
      width: 140,
      render: (value: string, row: Row) => (
        <Select
          aria-label={`story-source-${row.key}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.key, { source: next })}
          options={metaOptions(storyMeta.data, 'source', t)}
        />
      ),
    },
    {
      title: t('story.title.batchCreate'),
      dataIndex: 'result',
      width: 90,
      render: (value: string | undefined) => (value ? <Typography.Text>{value}</Typography.Text> : null),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('story.title.batchCreate')}
        backTo={`/products/${productId}/stories`}
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
        <Typography.Paragraph type="secondary">{t('story.message.batchHint')}</Typography.Paragraph>
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
