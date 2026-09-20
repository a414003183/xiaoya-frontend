import type { ReportView } from '@zentao/api-client/generated/model/reportView'
import { ReportFormModal } from './report-create-modal'

/** 报告编辑弹窗（T-10；PATCH 白名单 title/testRunIds/beginDate/endDate/owner/content + lockVersion，§3.6）。 */
export function ReportEditModal({
  report,
  open,
  onClose,
  onSaved,
}: {
  report: ReportView
  open: boolean
  onClose: () => void
  onSaved?: ((item: ReportView) => void) | undefined
}) {
  return (
    <ReportFormModal executionId={report.executionId} report={report} open={open} onClose={onClose} onSaved={onSaved} />
  )
}
