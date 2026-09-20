/** @route /plans/:planId @title plan.title.detail @perm plan-view @hide @activeMenu /products */
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
  activatePlanAction,
  fetchPlan,
  fetchPlanActivities,
  fetchPlanMeta,
  fetchPlanStories,
  finishPlanAction,
  qk,
  startPlanAction,
} from '../api/product.api'
import { PlanCloseModal } from '../components/plan-close-modal'
import { PlanLinkModal } from '../components/plan-link-modal'
import { StoryTable } from '../components/story-table'
import { PlanEditModal } from '../forms/plan-edit-modal'
import { statusTone } from '../model'

/** 计划详情（T-10：页头动作区 start/finish/close/activate/link + 需求/Bug/动态页签；Bug 页签 P4 前空态）。 */
export default function PlanDetailPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const planId = Number(useParams().planId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [closeOpen, setCloseOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const plan = useQuery({ queryKey: qk.plan.detail(planId), queryFn: () => fetchPlan(planId) })
  const meta = useQuery({ queryKey: qk.plan.meta(), queryFn: fetchPlanMeta })
  const stories = useQuery({
    queryKey: qk.plan.stories(planId),
    queryFn: () => fetchPlanStories(planId, { limit: 200 }),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['getPlan'] })
    void queryClient.invalidateQueries({ queryKey: ['listPlanStories'] })
    void queryClient.invalidateQueries({ queryKey: ['listPlanActivities'] })
    void queryClient.invalidateQueries({ queryKey: ['listPlans'] })
  }
  const runAction = useMutation({
    mutationFn: async (action: string) => {
      switch (action) {
        case 'start':
          return startPlanAction(planId)
        case 'finish':
          return finishPlanAction(planId)
        case 'activate':
          return activatePlanAction(planId)
        default:
          return null
      }
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      invalidate()
    },
  })

  if (plan.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  const view = plan.data

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            <Typography.Text strong>{view?.title ?? ''}</Typography.Text>
            <StatusTag tone={statusTone(view?.status ?? 'wait')}>
              {t(`plan.status.${view?.status ?? 'wait'}`)}
            </StatusTag>
          </Space>
        }
        backTo={`/products/${view?.productId}/plans`}
        extra={actionsFor(meta.data?.actions, view?.status).map((action) => (
          <Button
            key={action.action}
            type={action.action === 'start' || action.action === 'activate' ? 'primary' : 'default'}
            onClick={() => {
              if (action.action === 'close') {
                setCloseOpen(true)
                return
              }
              if (action.action === 'link') {
                setLinkOpen(true)
                return
              }
              if (action.action === 'edit') {
                setEditOpen(true)
                return
              }
              runAction.mutate(action.action)
            }}
          >
            {action.i18n ? t(action.i18n) : t(`plan.action.${action.action}`)}
          </Button>
        ))}
      />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('plan.field.id'), children: view?.id ?? '-' },
            { key: 'beginDate', label: t('plan.field.beginDate'), children: view?.beginDate ?? '-' },
            { key: 'endDate', label: t('plan.field.endDate'), children: view?.endDate ?? '-' },
            { key: 'finishedAt', label: t('plan.field.finishedAt'), children: view?.finishedAt ?? '-' },
            { key: 'closedAt', label: t('plan.field.closedAt'), children: view?.closedAt ?? '-' },
            {
              key: 'closedReason',
              label: t('plan.field.closedReason'),
              children: view?.closedReason ? t(`plan.closeReason.${view.closedReason}`) : '-',
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
          activeKey={searchParams.get('tab') ?? 'stories'}
          onChange={(key) => setSearchParams(withParam(searchParams, 'tab', key))}
          items={[
            {
              key: 'stories',
              label: t('plan.tab.stories'),
              children: (
                <StoryTable stories={stories.data?.items ?? []} onOpen={(storyId) => navigate(`/stories/${storyId}`)} />
              ),
            },
            {
              key: 'bugs',
              label: t('plan.tab.bugs'),
              children: <EmptyState description={t('plan.message.bugEmpty')} />,
            },
            {
              key: 'activities',
              label: t('plan.tab.activities'),
              children: <ActivityTimeline fetchPage={(beforeId) => fetchPlanActivities(planId, beforeId)} />,
            },
          ]}
        />
      </Card>
      <PlanCloseModal plan={view ?? null} open={closeOpen} onClose={() => setCloseOpen(false)} />
      <PlanLinkModal plan={view ?? null} open={linkOpen} onClose={() => setLinkOpen(false)} />
      {view ? (
        <PlanEditModal
          productId={view.productId}
          plan={view}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={invalidate}
        />
      ) : null}
    </PageContainer>
  )
}
