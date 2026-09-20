/** @route /builds/:buildId @title build.title.detail @perm build-view @hide @activeMenu /products */
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
  Popconfirm,
  Tabs,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { withParam } from '../../../shared/url'
import { ActivityTimeline } from '../../platform'
import { fetchBuild, fetchBuildActivities, fetchBuildStories, qk, removeBuild } from '../api/product.api'
import { BuildLinkModal } from '../components/build-link-modal'
import { StoryTable } from '../components/story-table'
import { BuildEditModal } from '../forms/build-edit-modal'

/** 构建详情（T-10：需求/Bug/动态页签 + 编辑/删除/关联动作）。 */
export default function BuildDetailPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const buildId = Number(useParams().buildId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [linkOpen, setLinkOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const build = useQuery({ queryKey: qk.build.detail(buildId), queryFn: () => fetchBuild(buildId) })
  const stories = useQuery({
    queryKey: qk.build.stories(buildId),
    queryFn: () => fetchBuildStories(buildId, { limit: 200 }),
  })
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['getBuild'] })
    void queryClient.invalidateQueries({ queryKey: ['listBuildStories'] })
    void queryClient.invalidateQueries({ queryKey: ['listBuildActivities'] })
  }
  const remove = useMutation({
    mutationFn: () => removeBuild(buildId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['listBuilds'] })
      navigate(`/products/${build.data?.productId ?? 0}/builds`)
    },
    onError: (error) => {
      message.error(errorText(error, t, 'build.message.referencedByRelease'))
    },
  })

  if (build.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  const view = build.data

  return (
    <PageContainer>
      <PageHeader
        title={view?.name ?? ''}
        backTo={`/products/${view?.productId}/builds`}
        extra={
          <>
            <Button onClick={() => setLinkOpen(true)}>{t('build.action.link')}</Button>
            <Button onClick={() => setEditOpen(true)}>{t('common.action.edit')}</Button>
            <Popconfirm title={t('build.message.deleteHint')} onConfirm={() => remove.mutate()}>
              <Button danger loading={remove.isPending}>
                {t('common.action.delete')}
              </Button>
            </Popconfirm>
          </>
        }
      />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('build.field.id'), children: view?.id ?? '-' },
            { key: 'buildDate', label: t('build.field.buildDate'), children: view?.buildDate ?? '-' },
            { key: 'builder', label: t('build.field.builder'), children: view?.builder ?? '-' },
            { key: 'scmPath', label: t('build.field.scmPath'), children: view?.scmPath ?? '-' },
            { key: 'filePath', label: t('build.field.filePath'), children: view?.filePath ?? '-' },
            { key: 'createdBy', label: t('common.field.createdBy'), children: view?.createdBy ?? '-' },
            {
              key: 'description',
              label: t('build.field.description'),
              span: 3,
              children: view?.description ?? '-',
            },
          ]}
        />
        {remove.error ? (
          <Typography.Paragraph type="danger">
            {errorText(remove.error, t, 'common.message.failed')}
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
              label: t('build.tab.stories'),
              children: (
                <StoryTable stories={stories.data?.items ?? []} onOpen={(storyId) => navigate(`/stories/${storyId}`)} />
              ),
            },
            {
              key: 'bugs',
              label: t('build.tab.bugs'),
              children: <EmptyState description={t('plan.message.bugEmpty')} />,
            },
            {
              key: 'activities',
              label: t('build.tab.activities'),
              children: <ActivityTimeline fetchPage={(beforeId) => fetchBuildActivities(buildId, beforeId)} />,
            },
          ]}
        />
      </Card>
      <BuildLinkModal build={view ?? null} open={linkOpen} onClose={() => setLinkOpen(false)} />
      {view ? (
        <BuildEditModal
          productId={view.productId}
          build={view}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={invalidate}
        />
      ) : null}
    </PageContainer>
  )
}
