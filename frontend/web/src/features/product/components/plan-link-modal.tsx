// list-standard: exempt (modal) — 弹窗内关联小表，无列表页身份
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { LinkPickerModal, Segmented, useMessage } from '@zentao/design-system'
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

/** 关联对象弹窗（T-10 复用壳：plan/release/build 三族 link/unlink 同构，objectType 页签 = 需求/Bug）。
 * 呈现面收敛到 design-system 的 LinkPickerModal（T72/FE-11 单源）；本壳只留取数/变更/失效语义。 */
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
    <LinkPickerModal
      open={open}
      title={title}
      onCancel={onClose}
      error={link.error || unlink.error ? errorText(link.error ?? unlink.error, t) : null}
      toolbar={
        <Segmented
          value={tab}
          onChange={(value) => setTab(value as 'story' | 'bug')}
          options={[
            { value: 'story', label: t('story.title.list') },
            { value: 'bug', label: t('plan.tab.bugs') },
          ]}
        />
      }
      picker={
        tab === 'story'
          ? {
              kind: 'select',
              rows: candidates,
              labelOf: (story) => `#${story.id} ${story.title}`,
              placeholder: t('plan.action.link'),
              ariaLabel: 'link-stories',
              actionLabel: t('plan.action.link'),
              hint: t('plan.message.linkHint'),
              selectedIds: selected,
              onSelectionChange: setSelected,
              onAction: () => link.mutate(),
              pending: link.isPending,
            }
          : { kind: 'empty', description: t('plan.message.bugEmpty') }
      }
      linked={{
        rows: linked,
        columns: [
          { title: t('story.field.id'), dataIndex: 'id', width: 80 },
          { title: t('story.field.title'), dataIndex: 'title' },
        ],
        emptyLabel: t('common.empty'),
        manageLabel: t('common.action.manage'),
        unlinkLabel: t('common.action.unlink'),
        onUnlink: (id) => unlink.mutate([id]),
        pending: unlink.isPending,
      }}
    />
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
