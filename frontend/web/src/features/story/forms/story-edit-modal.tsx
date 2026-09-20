import type { StoryView } from '../api/story.api'
import { StoryFormModal } from './story-create-modal'

/** 需求编辑弹窗（T-5）；mode='change-done' 时走 change-done 动作（requirement §4）。 */
export function StoryEditModal({
  productId,
  story,
  mode = 'edit',
  open,
  onClose,
  onSaved,
}: {
  productId: number
  story: StoryView
  mode?: 'edit' | 'change-done'
  open: boolean
  onClose: () => void
  onSaved?: ((story: StoryView) => void) | undefined
}) {
  return (
    <StoryFormModal productId={productId} story={story} mode={mode} open={open} onClose={onClose} onSaved={onSaved} />
  )
}
