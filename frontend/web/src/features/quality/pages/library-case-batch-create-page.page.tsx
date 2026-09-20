/** @route /libraries/:libraryId/test-cases/batch @title quality.title.libraryCaseBatchCreate @perm library-edit @hide @activeMenu /libraries */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Card, Input, PageContainer, PageHeader, Select, Table, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { paramNumber } from '../../../shared/url'
import { submitLibraryCase } from '../api/quality.api'
import { TestCaseStepsEditor } from '../components/test-case-steps-editor'
import { normalizeSteps, type StepInput } from '../model'

type Row = {
  key: number
  title: string
  priority: number
  type: string
  needReview: boolean
  steps: StepInput[]
  /** 行结果：成功 `#id`，失败为服务端消息（本页逐行调用单条创建端点，契约无库内批量端点）。 */
  result?: string
}

const MAX_ROWS = 50

function emptyRow(key: number): Row {
  return { key, title: '', priority: 3, type: 'feature', needReview: false, steps: [] }
}

/** 库内用例批量创建（T-7 / quality §6 B 范式：整表可编辑 + 步骤子表；逐行 POST /libraries/{libraryId}/test-cases）。 */
export default function LibraryCaseBatchCreatePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const libraryId = Number(useParams().libraryId)
  const [searchParams] = useSearchParams()
  // 「建用例」入口带 rows=1，批量入口缺省 5 行（同一整表页承载两种入口，见 library-detail 页）
  const initialRows = Math.min(Math.max(paramNumber(searchParams, 'rows', 5), 1), MAX_ROWS)

  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: initialRows }, (_, index) => emptyRow(index + 1)))
  const [summary, setSummary] = useState<{ total: number; ok: number } | null>(null)
  const [nextKey, setNextKey] = useState(initialRows + 1)
  // 行内枚举列选项唯一来源（03 §5）：priority/type 从 meta 取，前端不留清单。
  const caseMeta = useDomainMeta('testCase')

  const submit = useMutation({
    mutationFn: async (allRows: Row[]) => {
      const filled = allRows.filter((row) => row.title.trim().length > 0)
      let ok = 0
      for (const row of filled) {
        try {
          const created = await submitLibraryCase(libraryId, {
            title: row.title,
            priority: row.priority,
            type: row.type,
            needReview: row.needReview,
            steps: normalizeSteps(row.steps),
          })
          ok += 1
          setRows((prev) => prev.map((item) => (item.key === row.key ? { ...item, result: `#${created.id}` } : item)))
        } catch (error) {
          const text = errorText(error, t, 'common.message.failed')
          setRows((prev) => prev.map((item) => (item.key === row.key ? { ...item, result: text } : item)))
        }
      }
      return { total: filled.length, ok }
    },
    onSuccess: (result) => {
      setSummary(result)
      void queryClient.invalidateQueries({ queryKey: ['listLibraryCases'] })
      void queryClient.invalidateQueries({ queryKey: ['getLibrary'] })
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
          aria-label={`library-case-title-${row.key}`}
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
          aria-label={`library-case-priority-${row.key}`}
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
          aria-label={`library-case-type-${row.key}`}
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
          aria-label={`library-case-need-review-${row.key}`}
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
      title: t('testCase.field.steps'),
      dataIndex: 'steps',
      width: 100,
      render: (steps: StepInput[]) => `${steps.length}`,
    },
    {
      title: t('common.action.manage'),
      dataIndex: 'result',
      width: 200,
      render: (value: string | undefined) =>
        value ? (
          <Typography.Text {...(value.startsWith('#') ? {} : { type: 'danger' as const })}>{value}</Typography.Text>
        ) : null,
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('quality.title.libraryCaseBatchCreate')}
        backTo={`/libraries/${libraryId}`}
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
            <Button type="primary" loading={submit.isPending} onClick={() => void submit.mutateAsync(rows)}>
              {t('common.action.submit')}
            </Button>
          </>
        }
      />
      <Card>
        <Typography.Paragraph type="secondary">{t('testCase.message.batchHint')}</Typography.Paragraph>
        <Table
          rowKey="key"
          size="small"
          columns={columns}
          dataSource={rows}
          pagination={false}
          expandable={{
            // 步骤子表复用 T-5 组件：展开行内编辑，提交时随该行单条创建上送（整体替换）
            expandedRowRender: (row: Row) => (
              <TestCaseStepsEditor value={row.steps} onChange={(next) => update(row.key, { steps: next })} />
            ),
          }}
        />
        {summary ? (
          <Typography.Paragraph type="secondary" className="tw:mt-3">
            {`${summary.ok}/${summary.total}`}
          </Typography.Paragraph>
        ) : null}
      </Card>
    </PageContainer>
  )
}
