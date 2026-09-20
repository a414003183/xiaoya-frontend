import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  fetchProductStories,
  fetchReleaseStories,
  linkReleaseAction,
  type ReleaseView,
  unlinkReleaseAction,
} from '../api/product.api'
import { LinkObjectsModal } from './plan-link-modal'

/** 发布关联需求/Bug 弹窗（T-10，与 plan-link-modal 同构复用）。 */
export function ReleaseLinkModal({
  release,
  open,
  onClose,
}: {
  release: ReleaseView | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const releaseId = release?.id ?? 0
  const stories = useQuery({
    queryKey: ['listStories', release?.productId, 'link'],
    queryFn: () => fetchProductStories(release?.productId ?? 0, { limit: 200 }),
    enabled: release != null,
  })
  const linked = useQuery({
    queryKey: ['listReleaseStories', releaseId],
    queryFn: () => fetchReleaseStories(releaseId, { limit: 200 }),
    enabled: release != null,
  })

  const linkedItems = linked.data?.items ?? []
  const linkedIds = new Set(linkedItems.map((story) => story.id))
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['listReleaseStories'] })
    void queryClient.invalidateQueries({ queryKey: ['getRelease'] })
    void queryClient.invalidateQueries({ queryKey: ['listReleaseActivities'] })
    void queryClient.invalidateQueries({ queryKey: ['listStories'] })
  }

  return (
    <LinkObjectsModal
      open={open}
      onClose={onClose}
      title={t('release.action.link')}
      linked={linkedItems}
      candidates={(stories.data?.items ?? []).filter((story) => !linkedIds.has(story.id))}
      onLink={(ids) => linkReleaseAction(releaseId, 'story', ids)}
      onUnlink={(ids) => unlinkReleaseAction(releaseId, 'story', ids)}
      onDone={invalidate}
    />
  )
}
