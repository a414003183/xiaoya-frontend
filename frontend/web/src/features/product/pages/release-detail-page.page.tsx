/** @route /releases/:releaseId @title release.title.detail @perm release-view @hide @activeMenu /products */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Descriptions,
  EmptyState,
  PageContainer,
  PageHeader,
  PageLoading,
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
import { ActivityTimeline } from '../../platform'
import {
  fetchRelease,
  fetchReleaseActivities,
  fetchReleaseMeta,
  fetchReleaseStories,
  qk,
  terminateReleaseAction,
} from '../api/product.api'
import { ReleaseLinkModal } from '../components/release-link-modal'
import { StoryTable } from '../components/story-table'
import { ReleaseEditModal } from '../forms/release-edit-modal'
import { statusTone } from '../model'

/** 发布详情（T-10：动作区 terminate + 需求/Bug/动态页签）。 */
export default function ReleaseDetailPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const releaseId = Number(useParams().releaseId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [linkOpen, setLinkOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const release = useQuery({ queryKey: qk.release.detail(releaseId), queryFn: () => fetchRelease(releaseId) })
  const meta = useQuery({ queryKey: qk.release.meta(), queryFn: fetchReleaseMeta })
  const stories = useQuery({
    queryKey: qk.release.stories(releaseId),
    queryFn: () => fetchReleaseStories(releaseId, { limit: 200 }),
  })
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['getRelease'] })
    void queryClient.invalidateQueries({ queryKey: ['listReleaseStories'] })
    void queryClient.invalidateQueries({ queryKey: ['listReleaseActivities'] })
    void queryClient.invalidateQueries({ queryKey: ['listReleases'] })
  }
  const terminate = useMutation({
    mutationFn: () => terminateReleaseAction(releaseId),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      invalidate()
    },
  })

  if (release.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  const view = release.data

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            <Typography.Text strong>{view?.name ?? ''}</Typography.Text>
            <StatusTag tone={statusTone(view?.status ?? 'normal')}>
              {t(`release.status.${view?.status ?? 'normal'}`)}
            </StatusTag>
          </Space>
        }
        backTo={`/products/${view?.productId}/releases`}
        extra={actionsFor(meta.data?.actions, view?.status).map((action) => (
          <Button
            key={action.action}
            type={action.action === 'terminate' ? 'primary' : 'default'}
            danger={action.action === 'terminate'}
            loading={terminate.isPending}
            onClick={() => {
              if (action.action === 'link') {
                setLinkOpen(true)
                return
              }
              if (action.action === 'edit') {
                setEditOpen(true)
                return
              }
              terminate.mutate()
            }}
          >
            {action.i18n ? t(action.i18n) : t(`release.action.${action.action}`)}
          </Button>
        ))}
      />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('release.field.id'), children: view?.id ?? '-' },
            { key: 'releaseDate', label: t('release.field.releaseDate'), children: view?.releaseDate ?? '-' },
            { key: 'publishedAt', label: t('release.field.publishedAt'), children: view?.publishedAt ?? '-' },
            { key: 'buildId', label: t('release.field.build'), children: view?.buildId ?? '-' },
            {
              key: 'isMilestone',
              label: t('release.field.isMilestone'),
              children: view?.isMilestone ? t('release.message.milestone') : '-',
            },
            {
              key: 'notify',
              label: t('release.field.notify'),
              children: (view?.notifyAccounts ?? []).join('、') || '-',
            },
            {
              key: 'description',
              label: t('release.field.description'),
              span: 3,
              children: view?.description ?? '-',
            },
          ]}
        />
        {terminate.error ? (
          <Typography.Paragraph type="danger">
            {errorText(terminate.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
      </Card>
      <Card>
        <Tabs
          activeKey={searchParams.get('tab') ?? 'stories'}
          onChange={(key) => setSearchParams(withParam(searchParams, 'tab', key))}
          items={[
            {
              key: 'stories',
              label: t('release.tab.stories'),
              children: (
                <StoryTable stories={stories.data?.items ?? []} onOpen={(storyId) => navigate(`/stories/${storyId}`)} />
              ),
            },
            {
              key: 'bugs',
              label: t('release.tab.bugs'),
              children: <EmptyState description={t('plan.message.bugEmpty')} />,
            },
            {
              key: 'activities',
              label: t('release.tab.activities'),
              children: <ActivityTimeline fetchPage={(beforeId) => fetchReleaseActivities(releaseId, beforeId)} />,
            },
          ]}
        />
      </Card>
      <ReleaseLinkModal release={view ?? null} open={linkOpen} onClose={() => setLinkOpen(false)} />
      {view ? (
        <ReleaseEditModal
          productId={view.productId}
          release={view}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={invalidate}
        />
      ) : null}
    </PageContainer>
  )
}
