/** @route /stories/batch-edit @title story.title.batchEdit @perm story-edit @hide @activeMenu /products */
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
import {
  type BatchResultItem,
  fetchAccountOptions,
  fetchStories,
  type StoryView,
  submitBatchStories,
} from '../api/story.api'

type Row = { id: number; title: string; priority: number; lockVersion: number }

/** 只挑改动过的字段（与 product 批量页同语义，域内自持避免跨域依赖）。 */
function pickChanged(original: StoryView | undefined, row: Row): { title?: string; priority?: number } | null {
  if (!original) {
    return null
  }
  const patch: { title?: string; priority?: number } = {}
  if (row.title !== original.title) {
    patch.title = row.title
  }
  if (row.priority !== original.priority) {
    patch.priority = row.priority
  }
  return Object.keys(patch).length > 0 ? patch : null
}

/** 需求批量编辑（T-5 / requirement §6 B 范式：action ∈ close|activate|assign|edit，逐项结果）。 */
export default function StoryBatchEditPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const ids = paramIds(searchParams)
  const productId = Number(searchParams.get('productId') ?? 0)
  const [edits, setEdits] = useState<Record<number, Partial<Row>>>({})
  const [assignee, setAssignee] = useState<string | null>(null)
  const [closedReason, setClosedReason] = useState('done')
  const [results, setResults] = useState<BatchResultItem[]>([])
  // 枚举字段选项唯一来源（03 §5）：priority/closedReason 从 meta 取，前端不留清单。
  const storyMeta = useDomainMeta('story')

  const stories = useQuery({
    queryKey: ['listStories', productId, 'batch', ids.join(',')],
    queryFn: () => fetchStories(productId, { limit: 200, filters: { id: ids.join(',') } }),
    enabled: ids.length > 0 && productId > 0,
  })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })

  const submit = useMutation({
    mutationFn: async (input: { action: string; params?: Record<string, unknown> }) =>
      submitBatchStories({ ids, action: input.action, ...(input.params ? { params: input.params } : {}) }),
    onSuccess: (data) => {
      setResults(data.results)
      void queryClient.invalidateQueries({ queryKey: ['listStories'] })
    },
  })

  if (ids.length === 0) {
    return (
      <PageContainer>
        <PageHeader title={t('story.title.batchEdit')} backTo={`/products/${productId}/stories`} />
        <Card>{t('common.empty')}</Card>
      </PageContainer>
    )
  }
  if (stories.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const rows: Row[] = (stories.data?.items ?? []).map((story: StoryView) => {
    const edited = edits[story.id] ?? {}
    return {
      id: story.id,
      title: edited.title ?? story.title,
      priority: edited.priority ?? story.priority,
      lockVersion: story.lockVersion,
    }
  })
  const update = (id: number, patch: Partial<Row>) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const columns = [
    { title: t('story.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('story.field.title'),
      dataIndex: 'title',
      render: (value: string, row: Row) => (
        <Input
          aria-label={`story-title-${row.id}`}
          value={value}
          onChange={(event) => update(row.id, { title: event.target.value })}
        />
      ),
    },
    {
      title: t('story.field.priority'),
      dataIndex: 'priority',
      width: 140,
      render: (value: number, row: Row) => (
        <Select
          aria-label={`story-priority-${row.id}`}
          value={value}
          className="tw:w-full"
          onChange={(next) => update(row.id, { priority: next })}
          options={metaNumberOptions(storyMeta.data, 'priority', t)}
        />
      ),
    },
    {
      title: t('story.title.batchEdit'),
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
        title={t('story.title.batchEdit')}
        backTo={`/products/${productId}/stories`}
        extra={
          <>
            <Button
              loading={submit.isPending}
              onClick={() =>
                submit.mutate({
                  action: 'edit',
                  params: {
                    items: rows
                      .map((row) => {
                        const original = (stories.data?.items ?? []).find((story) => story.id === row.id)
                        const changed = pickChanged(original, row)
                        return changed ? { id: row.id, ...changed } : null
                      })
                      .filter((item): item is { id: number; title?: string; priority?: number } => item !== null),
                  },
                })
              }
            >
              {t('common.action.save')}
            </Button>
            <Select
              aria-label="batch-assignee"
              placeholder={t('story.field.assignee')}
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
              {t('story.action.assign')}
            </Button>
            <Select
              aria-label="batch-closed-reason"
              className="tw:w-[140px]"
              value={closedReason}
              onChange={(value) => setClosedReason(value)}
              options={metaOptions(storyMeta.data, 'closedReason', t)}
            />
            <Button
              loading={submit.isPending}
              onClick={() => submit.mutate({ action: 'close', params: { closedReason } })}
            >
              {t('story.action.close')}
            </Button>
            <Button loading={submit.isPending} onClick={() => submit.mutate({ action: 'activate' })}>
              {t('story.action.activate')}
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
        <Table rowKey="id" size="small" columns={columns} dataSource={rows} pagination={false} />
      </Card>
    </PageContainer>
  )
}
