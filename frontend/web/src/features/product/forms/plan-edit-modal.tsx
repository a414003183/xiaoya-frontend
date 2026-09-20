import type { PlanView } from '../api/product.api'
import { PlanFormModal } from './plan-create-modal'

/** 计划编辑弹窗（T-10）：与创建共用表单壳，带 lockVersion 走 PATCH。 */
export function PlanEditModal({
  productId,
  plan,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  plan: PlanView
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  return <PlanFormModal productId={productId} plan={plan} open={open} onClose={onClose} onSaved={onSaved} />
}
