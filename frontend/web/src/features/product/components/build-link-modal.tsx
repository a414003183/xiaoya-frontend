import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  type BuildView,
  fetchBuildStories,
  fetchProductStories,
  linkBuildAction,
  unlinkBuildAction,
} from '../api/product.api'
import { LinkObjectsModal } from './plan-link-modal'

/** 构建关联需求/Bug 弹窗（T-10，与 plan-link-modal 同构复用）。 */
export function BuildLinkModal({
  build,
  open,
  onClose,
}: {
  build: BuildView | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const buildId = build?.id ?? 0
  const stories = useQuery({
    queryKey: ['listStories', build?.productId, 'link'],
    queryFn: () => fetchProductStories(build?.productId ?? 0, { limit: 200 }),
    enabled: build != null,
  })
  const linked = useQuery({
    queryKey: ['listBuildStories', buildId],
    queryFn: () => fetchBuildStories(buildId, { limit: 200 }),
    enabled: build != null,
  })

  const linkedItems = linked.data?.items ?? []
  const linkedIds = new Set(linkedItems.map((story) => story.id))
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['listBuildStories'] })
    void queryClient.invalidateQueries({ queryKey: ['getBuild'] })
    void queryClient.invalidateQueries({ queryKey: ['listBuildActivities'] })
  }

  return (
    <LinkObjectsModal
      open={open}
      onClose={onClose}
      title={t('build.action.link')}
      linked={linkedItems}
      candidates={(stories.data?.items ?? []).filter((story) => !linkedIds.has(story.id))}
      onLink={(ids) => linkBuildAction(buildId, 'story', ids)}
      onUnlink={(ids) => unlinkBuildAction(buildId, 'story', ids)}
      onDone={invalidate}
    />
  )
}
