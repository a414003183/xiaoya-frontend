/** @route /stories/:storyId @title story.title.detail @perm story-view @hide @activeMenu /products */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Descriptions,
  EmptyState,
  HasPerm,
  PageContainer,
  PageHeader,
  PageLoading,
  Popconfirm,
  Space,
  StatusTag,
  Tabs,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { actionsFor } from '../../../shared/meta'
import { withParam } from '../../../shared/url'
import { ActivityTimeline, CommentPanel, FileUploadField } from '../../platform'
import {
  activateStoryAction,
  changeStoryAction,
  deleteStoryAction,
  fetchStories,
  fetchStory,
  fetchStoryActivities,
  fetchStoryMeta,
  qk,
} from '../api/story.api'
import { StoryAssignModal } from '../components/story-assign-modal'
import { StoryCloseModal } from '../components/story-close-modal'
import { StoryReviewModal } from '../components/story-review-modal'
import { StoryEditModal } from '../forms/story-edit-modal'
import { actionI18nKey, priorityKey, reviewModeFor, storyTone } from '../model'

/** 需求详情（T-5 / requirement §6 D 范式：页头动作区 meta 驱动 + 描述/动态/关联需求页签）。 */
export default function StoryDetailPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const storyId = Number(useParams().storyId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [editMode, setEditMode] = useState<'edit' | 'change-done' | null>(null)

  const story = useQuery({ queryKey: qk.story.detail(storyId), queryFn: () => fetchStory(storyId) })
  const meta = useQuery({ queryKey: qk.story.meta(), queryFn: fetchStoryMeta })
  const view = story.data
  const linked = useQuery({
    queryKey: ['listStories', view?.productId, 'linked'],
    queryFn: () => fetchStories(view?.productId ?? 0, { limit: 200 }),
    enabled: view != null,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['getStory'] })
    void queryClient.invalidateQueries({ queryKey: ['listStories'] })
    void queryClient.invalidateQueries({ queryKey: ['listStoryActivities'] })
  }
  const runAction = useMutation({
    mutationFn: async (action: string) => {
      if (action === 'change') {
        return changeStoryAction(storyId)
      }
      if (action === 'activate') {
        return activateStoryAction(storyId)
      }
      return null
    },
    onSuccess: (result, action) => {
      if (result !== null || action === 'change' || action === 'activate') {
        message.success(t('common.message.saved'))
      }
      invalidate()
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteStoryAction(storyId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      invalidate()
      navigate(`/products/${view?.productId ?? 0}/stories`)
    },
    // 存在未删任务/子需求引用 → 42203，按 code 映射统一文案（§5）
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  if (story.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const linkedStories = (linked.data?.items ?? []).filter((item) => (view?.linkedStoryIds ?? []).includes(item.id))

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            <Typography.Text strong>{view?.title ?? ''}</Typography.Text>
            <StatusTag tone={storyTone(view?.status ?? 'draft')}>
              {t(`story.status.${view?.status ?? 'draft'}`)}
            </StatusTag>
          </Space>
        }
        backTo={view ? `/products/${view.productId}/stories` : '/products'}
        extra={
          <>
            {actionsFor(meta.data?.actions, view?.status).map((action) => (
              <Button
                key={action.action}
                type={action.action === 'pass' || action.action === 'activate' ? 'primary' : 'default'}
                onClick={() => {
                  switch (action.action) {
                    case 'submit-review':
                    case 'pass':
                    case 'reject':
                      setReviewOpen(true)
                      return
                    case 'close':
                      setCloseOpen(true)
                      return
                    case 'assign':
                      setAssignOpen(true)
                      return
                    case 'edit':
                      setEditMode('edit')
                      return
                    case 'change-done':
                      setEditMode('change-done')
                      return
                    default:
                      runAction.mutate(action.action)
                  }
                }}
              >
                {t(actionI18nKey(action.action))}
              </Button>
            ))}
            <HasPerm perm="story-delete">
              <Popconfirm title={t('story.message.deleteHint')} onConfirm={() => remove.mutate()}>
                <Button danger loading={remove.isPending}>
                  {t('common.action.delete')}
                </Button>
              </Popconfirm>
            </HasPerm>
          </>
        }
      />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('story.field.id'), children: view?.id ?? '-' },
            { key: 'type', label: t('story.field.type'), children: t(`story.type.${view?.type ?? 'story'}`) },
            { key: 'priority', label: t('story.field.priority'), children: t(priorityKey(view?.priority)) },
            { key: 'stage', label: t('story.field.stage'), children: t(`story.stage.${view?.stage ?? 'wait'}`) },
            { key: 'assignee', label: t('story.field.assignee'), children: view?.assignee ?? '-' },
            { key: 'planId', label: t('story.field.plan'), children: view?.planId ?? '-' },
            { key: 'estimate', label: t('story.field.estimate'), children: view?.estimateHours ?? '-' },
            {
              key: 'reviewers',
              label: t('story.field.reviewers'),
              children: (view?.reviewers ?? []).join('、') || '-',
            },
            {
              key: 'closedReason',
              label: t('story.field.closedReason'),
              children: view?.closedReason ? t(`story.closeReason.${view.closedReason}`) : '-',
            },
          ]}
        />
        {runAction.error ? (
          <Typography.Paragraph type="danger">
            {errorText(runAction.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
      </Card>
      <Card>
        <Tabs
          activeKey={searchParams.get('tab') ?? 'description'}
          onChange={(key) => setSearchParams(withParam(searchParams, 'tab', key))}
          items={[
            {
              key: 'description',
              label: t('story.tab.description'),
              children: view?.description ? (
                <Typography.Paragraph>{view.description}</Typography.Paragraph>
              ) : (
                <Typography.Text type="secondary">{t('story.message.noDescription')}</Typography.Text>
              ),
            },
            {
              key: 'activities',
              label: t('story.tab.activities'),
              children: <ActivityTimeline fetchPage={(beforeId) => fetchStoryActivities(storyId, beforeId)} />,
            },
            {
              key: 'linked',
              label: t('story.tab.linked'),
              children:
                linkedStories.length === 0 ? (
                  <EmptyState description={t('common.empty')} />
                ) : (
                  <ul className="tw:m-0 tw:list-none tw:p-0">
                    {linkedStories.map((item) => (
                      <li key={item.id}>
                        <Typography.Link onClick={() => navigate(`/stories/${item.id}`)}>
                          {`#${item.id} ${item.title}`}
                        </Typography.Link>
                      </li>
                    ))}
                  </ul>
                ),
            },
            {
              key: 'comments',
              label: t('platform.comment.title'),
              children: <CommentPanel objectType="story" objectId={storyId} />,
            },
            {
              key: 'files',
              label: t('story.tab.files'),
              children: (
                <HasPerm perm="file-upload">
                  <FileUploadField objectType="story" objectId={storyId} />
                </HasPerm>
              ),
            },
          ]}
        />
      </Card>
      <StoryReviewModal
        story={view ?? null}
        mode={reviewModeFor(meta.data?.actions, view?.status)}
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
      />
      <StoryCloseModal story={view ?? null} open={closeOpen} onClose={() => setCloseOpen(false)} />
      <StoryAssignModal story={view ?? null} open={assignOpen} onClose={() => setAssignOpen(false)} />
      {view && editMode !== null ? (
        <StoryEditModal
          productId={view.productId}
          story={view}
          mode={editMode}
          open
          onClose={() => setEditMode(null)}
          onSaved={invalidate}
        />
      ) : null}
    </PageContainer>
  )
}
