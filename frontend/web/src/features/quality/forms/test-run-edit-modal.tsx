import type { TestRunView } from '@zentao/api-client/generated/model/testRunView'
import { TestRunFormModal } from './test-run-create-modal'

/** 测试单编辑弹窗（T-9；PATCH 白名单 + lockVersion，executionId 不可改，quality §5）。 */
export function TestRunEditModal({
  productId,
  testRun,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  testRun: TestRunView
  open: boolean
  onClose: () => void
  onSaved?: ((item: TestRunView) => void) | undefined
}) {
  return <TestRunFormModal productId={productId} testRun={testRun} open={open} onClose={onClose} onSaved={onSaved} />
}
