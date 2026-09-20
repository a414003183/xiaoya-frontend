/** @route /products/:productId/stories @title story.title.list @perm story-view @hide @activeMenu /products */
import { useQuery } from '@tanstack/react-query'
import { Button, ListCard, PageContainer, PageHeader, StatusTag, type TableColumnsType } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { RowNameLink } from '../../../shared/row-name-link'
import { withParam } from '../../../shared/url'
import { csvQuery, useCsvExport } from '../../../shared/use-csv-export'
import { fetchStories, qk, type StoryView, storiesCsvPath } from '../api/story.api'
import { StoryCreateModal } from '../forms/story-create-modal'
import { priorityKey, storyTone } from '../model'

/** 需求列表（T-5 / requirement §6：关键词 + 类型/状态/优先级下拉 = filters[*]，多选进批量页）。
 * 筛选值域一律来自 meta/story（前端不留常量清单）。 */
export default function StoryListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const productId = Number(useParams().productId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const csv = useCsvExport()
  const storyMeta = useMetaOptions('story')

  const type = searchParams.get('type') ?? ''
  const status = searchParams.get('status') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const stage = searchParams.get('stage') ?? ''
  const source = searchParams.get('source') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const stories = useQuery({
    queryKey: qk.story.list(productId, { type, status, priority, stage, source, q, page }),
    queryFn: () =>
      fetchStories(productId, {
        page,
        limit: 20,
        q,
        ...(type || status || priority || stage || source
          ? { filters: { type, status, priority, stage, source } }
          : {}),
      }),
  })

  const columns: TableColumnsType<StoryView> = [
    { title: t('story.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('story.field.title'),
      dataIndex: 'title',
      render: (title: string, record: StoryView) => <RowNameLink to={`/stories/${record.id}`}>{title}</RowNameLink>,
    },
    {
      title: t('story.field.type'),
      dataIndex: 'type',
      render: (value: string) => t(`story.type.${value}`),
    },
    {
      title: t('story.field.status'),
      dataIndex: 'status',
      render: (value: string) => <StatusTag tone={storyTone(value)}>{t(`story.status.${value}`)}</StatusTag>,
    },
    {
      title: t('story.field.priority'),
      dataIndex: 'priority',
      render: (value: number) => t(priorityKey(value)),
    },
    {
      title: t('story.field.stage'),
      dataIndex: 'stage',
      render: (value: string) => t(`story.stage.${value}`),
    },
    { title: t('story.field.assignee'), dataIndex: 'assignee' },
    { title: t('story.field.plan'), dataIndex: 'planId' },
  ]

  return (
    <PageContainer>
      <PageHeader title={t('story.title.list')} backTo={`/products/${productId}`} />
      <ListFilterForm
        fields={[
          keywordField(t('story.field.keywords'), t('common.action.search')),
          selectField('type', t('common.field.type'), storyMeta.options('type')),
          selectField('status', t('common.field.status'), storyMeta.options('status')),
          selectField('priority', t('common.field.priority'), storyMeta.options('priority')),
          selectField('stage', t('story.field.stage'), storyMeta.options('stage')),
          selectField('source', t('story.field.source'), storyMeta.options('source')),
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="story-list"
        actions={
          <>
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t('story.action.create')}
            </Button>
            <Button onClick={() => navigate(`/products/${productId}/stories/batch`)}>
              {t('story.action.batchCreate')}
            </Button>
            <Button
              disabled={selectedIds.length === 0}
              onClick={() => navigate(`/stories/batch-edit?productId=${productId}&ids=${selectedIds.join(',')}`)}
            >
              {t('story.action.batchEdit')}
            </Button>
            <Button
              loading={csv.exporting}
              onClick={() =>
                void csv.exportCsv(
                  storiesCsvPath(productId),
                  csvQuery({ q, filters: { type, status, priority, stage, source } }),
                  'stories',
                )
              }
            >
              {t('common.action.exportCsv')}
            </Button>
          </>
        }
        rowKey="id"
        loading={stories.isPending}
        dataSource={stories.data?.items ?? []}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys.map((key) => Number(key))),
        }}
        pagination={{
          current: page,
          pageSize: 20,
          total: stories.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <StoryCreateModal
        productId={productId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(story) => navigate(`/stories/${story.id}`)}
      />
    </PageContainer>
  )
}
