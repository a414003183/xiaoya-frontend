import type { BuildView } from '../api/product.api'
import { BuildFormModal } from './build-create-modal'

/** 构建编辑弹窗（T-10）：与创建共用表单壳，带 lockVersion 走 PATCH。 */
export function BuildEditModal({
  productId,
  build,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  build: BuildView
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  return <BuildFormModal productId={productId} build={build} open={open} onClose={onClose} onSaved={onSaved} />
}
