import type { BugView } from '@zentao/api-client/generated/model/bugView'
import { BugFormModal } from './bug-create-modal'

/** Bug 编辑弹窗（T-2；PATCH 白名单字段 + lockVersion，quality §5）。 */
export function BugEditModal({
  productId,
  bug,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  bug: BugView
  open: boolean
  onClose: () => void
  onSaved?: ((bug: BugView) => void) | undefined
}) {
  return <BugFormModal productId={productId} bug={bug} open={open} onClose={onClose} onSaved={onSaved} />
}
