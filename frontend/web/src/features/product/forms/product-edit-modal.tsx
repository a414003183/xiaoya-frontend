import type { ProductView } from '../api/product.api'
import { ProductFormModal } from './product-create-modal'

/** 产品编辑弹窗（T-3）：与创建共用一个表单壳，带 lockVersion 走 PATCH。 */
export function ProductEditModal({
  product,
  open,
  onClose,
}: {
  product: ProductView | null
  open: boolean
  onClose: () => void
}) {
  return <ProductFormModal open={open} onClose={onClose} product={product} />
}
