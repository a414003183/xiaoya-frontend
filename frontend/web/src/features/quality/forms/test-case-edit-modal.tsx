import type { TestCaseView } from '@zentao/api-client/generated/model/testCaseView'
import { TestCaseFormModal } from './test-case-create-modal'

/** 用例编辑弹窗（T-5；steps 整体替换 + 标记态 status 直改，quality §4.2）。 */
export function TestCaseEditModal({
  productId,
  testCase,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  testCase: TestCaseView
  open: boolean
  onClose: () => void
  onSaved?: ((item: TestCaseView) => void) | undefined
}) {
  return <TestCaseFormModal productId={productId} testCase={testCase} open={open} onClose={onClose} onSaved={onSaved} />
}
