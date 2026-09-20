/** @route /projects/:projectId/stories @title project.title.stories @perm project-view @hide @activeMenu /projects */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  EmptyState,
  HasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  Select,
  type TableColumnsType,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { fetchProductStories } from '../../product'
import {
  fetchProjectProducts,
  fetchProjectStories,
  linkProjectStoriesAction,
  qk,
  type StoryView,
  unlinkProjectStoryAction,
} from '../api/project.api'

/** 项目关联需求（T-5 / project §6 L 范式：从产品需求挑选器添加关联，逐项结果提示）。 */
export default function ProjectStoryListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const projectId = Number(useParams().projectId)
  const [selected, setSelected] = useState<number[]>([])
  const [failed, setFailed] = useState<{ id: number; error?: string | null }[]>([])

  const linked = useQuery({
    queryKey: qk.project.stories(projectId),
    queryFn: () => fetchProjectStories(projectId, { limit: 200 }),
  })
  const products = useQuery({
    queryKey: qk.project.products(projectId),
    queryFn: () => fetchProjectProducts(projectId, { limit: 200 }),
  })
  const productIds = (products.data?.items ?? []).map((product) => product.id).join(',')
  const candidates = useQuery({
    queryKey: ['listProjectStoryCandidates', projectId, productIds],
    queryFn: async () => {
      const pages = await Promise.all(
        (products.data?.items ?? []).map((product) => fetchProductStories(product.id, { limit: 200 })),
      )
      return pages.flatMap((page) => page.items)
    },
    enabled: products.isSuccess,
  })

  const linkedItems = linked.data?.items ?? []
  const linkedIds = new Set(linkedItems.map((story) => story.id))
  const options = (candidates.data ?? [])
    .filter((story) => !linkedIds.has(story.id))
    .map((story) => ({ value: story.id, label: `#${story.id} ${story.title}` }))

  const link = useMutation({
    mutationFn: () => linkProjectStoriesAction(projectId, selected),
    onSuccess: (results) => {
      const failedItems = results.filter((item) => !item.ok)
      setFailed(failedItems)
      setSelected([])
      void queryClient.invalidateQueries({ queryKey: ['listProjectStories'] })
      void queryClient.invalidateQueries({ queryKey: ['getProject'] })
      if (failedItems.length === 0) {
        message.success(t('project.message.linked', { count: results.length }))
      } else {
        message.warning(t('project.message.linkedPartial', { count: results.length - failedItems.length }))
      }
    },
  })

  // 解除关联（B-PRJ-06）：删 project_story 行；执行需求列表/看板读的是同一张反查表，一并失效
  const unlink = useMutation({
    mutationFn: (storyId: number) => unlinkProjectStoryAction(projectId, storyId),
    onSuccess: (_data, storyId) => {
      message.success(t('project.message.unlinked', { title: `#${storyId}` }))
      void queryClient.invalidateQueries({ queryKey: ['listProjectStories'] })
      void queryClient.invalidateQueries({ queryKey: ['listExecutionStories'] })
      void queryClient.invalidateQueries({ queryKey: ['getExecutionKanban'] })
    },
  })

  const columns: TableColumnsType<StoryView> = [
    { title: t('story.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('story.field.title'),
      dataIndex: 'title',
      render: (title: string, record: StoryView) => (
        <Typography.Link onClick={() => navigate(`/stories/${record.id}`)}>{title}</Typography.Link>
      ),
    },
    {
      title: t('story.field.type'),
      dataIndex: 'type',
      width: 110,
      render: (type: string) => t(`story.type.${type}`),
    },
    {
      title: t('story.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (status: string) => t(`story.status.${status}`),
    },
    {
      title: t('story.field.stage'),
      dataIndex: 'stage',
      width: 110,
      render: (stage: string) => t(`story.stage.${stage}`),
    },
    { title: t('story.field.assignee'), dataIndex: 'assignee', width: 110 },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 110,
      render: (_: unknown, record: StoryView) => (
        <HasPerm perm="project-link-story">
          <Button
            size="small"
            danger
            aria-label={`story-unlink-${record.id}`}
            loading={unlink.isPending && unlink.variables === record.id}
            onClick={() => unlink.mutate(record.id)}
          >
            {t('common.action.unlink')}
          </Button>
        </HasPerm>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('project.title.stories')}
        backTo={`/projects/${projectId}`}
        extra={
          <HasPerm perm="project-link-story">
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              className="tw:w-[320px]"
              placeholder={t('project.message.pickStory')}
              aria-label="project-story-picker"
              value={selected}
              options={options}
              onChange={(value) => setSelected(value)}
            />
            <Button
              type="primary"
              loading={link.isPending}
              disabled={selected.length === 0}
              onClick={() => link.mutate()}
            >
              {t('project.action.linkStory')}
            </Button>
          </HasPerm>
        }
      />
      {failed.length > 0 ? (
        <Typography.Paragraph type="danger">
          {t('project.message.linkFailed', {
            items: failed.map((item) => `#${item.id}(${item.error ?? ''})`).join('、'),
          })}
        </Typography.Paragraph>
      ) : null}
      {link.error || unlink.error ? (
        <Typography.Paragraph type="danger">{errorText(link.error ?? unlink.error, t)}</Typography.Paragraph>
      ) : null}
      <ListCard
        columns={columns}
        columnSettingKey="project-stories"
        rowKey="id"
        loading={linked.isPending}
        dataSource={linkedItems}
        pagination={false}
        locale={{ emptyText: <EmptyState description={t('common.empty')} /> }}
      />
    </PageContainer>
  )
}
