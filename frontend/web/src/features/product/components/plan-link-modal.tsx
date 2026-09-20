import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  EmptyState,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fetchPlanStories,
  fetchProductStories,
  linkPlanAction,
  type PlanView,
  type StoryView,
  unlinkPlanAction,
} from '../api/product.api'

/** 关联对象弹窗（T-10 复用壳：plan/release/build 三族 link/unlink 同构，objectType 页签 = 需求/Bug）。 */
export function LinkObjectsModal({
  open,
  onClose,
  title,
  linked,
  candidates,
  onLink,
  onUnlink,
  onDone,
}: {
  open: boolean
  onClose: () => void
  title: string
  linked: StoryView[]
  candidates: StoryView[]
  onLink: (ids: number[]) => Promise<unknown>
  onUnlink: (ids: number[]) => Promise<unknown>
  onDone: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const [tab, setTab] = useState<'story' | 'bug'>('story')
  const [selected, setSelected] = useState<number[]>([])

  const link = useMutation({
    mutationFn: async () => {
      const ids = selected.length > 0 ? selected : []
      if (ids.length === 0) {
        return null
      }
      const result = await onLink(ids)
      setSelected([])
      return result
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      onDone()
    },
  })
  const unlink = useMutation({
    mutationFn: (ids: number[]) => onUnlink(ids),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      onDone()
    },
  })

  return (
    <Modal open={open} title={title} width={720} footer={null} onCancel={onClose}>
      <Segmented
        value={tab}
        onChange={(value) => setTab(value as 'story' | 'bug')}
        options={[
          { value: 'story', label: t('story.title.list') },
          { value: 'bug', label: t('plan.tab.bugs') },
        ]}
      />
      {tab === 'story' ? (
        <div className="tw:mt-3 tw:flex tw:flex-col tw:gap-3">
          <Space.Compact className="tw:w-full">
            <Select
              mode="multiple"
              className="tw:w-full"
              aria-label="link-stories"
              placeholder={t('plan.action.link')}
              optionFilterProp="label"
              value={selected}
              onChange={(value) => setSelected(value)}
              options={candidates.map((story) => ({
                value: story.id,
                label: `#${story.id} ${story.title}`,
              }))}
            />
            <Button type="primary" loading={link.isPending} onClick={() => link.mutate()}>
              {t('plan.action.link')}
            </Button>
          </Space.Compact>
          <Typography.Text type="secondary">{t('plan.message.linkHint')}</Typography.Text>
          {linked.length === 0 ? (
            <EmptyState description={t('common.empty')} />
          ) : (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={linked}
              columns={[
                { title: t('story.field.id'), dataIndex: 'id', width: 80 },
                { title: t('story.field.title'), dataIndex: 'title' },
                {
                  title: t('common.action.manage'),
                  render: (_: unknown, record: StoryView) => (
                    <Button size="small" loading={unlink.isPending} onClick={() => unlink.mutate([record.id])}>
                      {t('common.action.unlink')}
                    </Button>
                  ),
                },
              ]}
            />
          )}
          {link.error || unlink.error ? (
            <Typography.Paragraph type="danger">{errorText(link.error ?? unlink.error, t)}</Typography.Paragraph>
          ) : null}
        </div>
      ) : (
        <div className="tw:mt-3">
          <EmptyState description={t('plan.message.bugEmpty')} />
        </div>
      )}
    </Modal>
  )
}

/** 计划关联需求/Bug 弹窗（T-10；closed 计划 link → 42202 由后端守卫，错误在此 toast 展示）。 */
export function PlanLinkModal({ plan, open, onClose }: { plan: PlanView | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const planId = plan?.id ?? 0
  const stories = useQuery({
    queryKey: ['listStories', plan?.productId, 'link'],
    queryFn: () => fetchProductStories(plan?.productId ?? 0, { limit: 200 }),
    enabled: plan != null,
  })
  const linked = useQuery({
    queryKey: ['listPlanStories', planId],
    queryFn: () => fetchPlanStories(planId, { limit: 200 }),
    enabled: plan != null,
  })

  const linkedItems = linked.data?.items ?? []
  const linkedIds = new Set(linkedItems.map((story) => story.id))
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['listPlanStories'] })
    void queryClient.invalidateQueries({ queryKey: ['getPlan'] })
    void queryClient.invalidateQueries({ queryKey: ['listPlanActivities'] })
  }

  return (
    <LinkObjectsModal
      open={open}
      onClose={onClose}
      title={t('plan.action.link')}
      linked={linkedItems}
      candidates={(stories.data?.items ?? []).filter((story) => !linkedIds.has(story.id))}
      onLink={(ids) => linkPlanAction(planId, 'story', ids)}
      onUnlink={(ids) => unlinkPlanAction(planId, 'story', ids)}
      onDone={invalidate}
    />
  )
}
