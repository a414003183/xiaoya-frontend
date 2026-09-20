import type { ReleaseView } from '../api/product.api'
import { ReleaseFormModal } from './release-create-modal'

/** 发布编辑弹窗（T-10）：与创建共用表单壳，带 lockVersion 走 PATCH。 */
export function ReleaseEditModal({
  productId,
  release,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  release: ReleaseView
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  return <ReleaseFormModal productId={productId} release={release} open={open} onClose={onClose} onSaved={onSaved} />
}
