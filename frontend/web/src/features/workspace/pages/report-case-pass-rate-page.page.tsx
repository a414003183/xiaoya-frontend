/** @route /test-runs/:testRunId/reports/case-pass-rate @title report.title.casePassRate @perm report-view @hide @activeMenu /executions */

import { useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Alert,
  Card,
  Descriptions,
  EmptyState,
  PageContainer,
  PageHeader,
  PageLoading,
  Typography,
} from '@zentao/design-system'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { fetchCasePassRateReport, qk } from '../api/workspace.api'
import ReportChart from '../components/report-chart'
import { caseResultPoints, donutOption, localizedPoints } from '../model'

/** 用例通过率（T-12 / §6 C 范式：环形图 + 各结果计数；passRate 为 null → 无有效执行）。 */
export default function ReportCasePassRatePage() {
  const { t } = useTranslation()
  const testRunId = Number(useParams().testRunId)

  const report = useQuery({
    queryKey: qk.workspace.casePassRate(testRunId),
    queryFn: () => fetchCasePassRateReport(testRunId),
  })

  const points = useMemo(() => (report.data ? localizedPoints(caseResultPoints(report.data), t) : []), [report.data, t])

  if (report.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  if (report.error || !report.data) {
    return (
      <PageContainer>
        <PageHeader title={t('report.title.casePassRate')} backTo={`/test-runs/${testRunId}`} />
        <Alert type="error" showIcon message={errorText(report.error, t, 'report.message.loadFailed')} />
      </PageContainer>
    )
  }

  const view = report.data
  return (
    <PageContainer>
      <PageHeader title={t('report.title.casePassRate')} backTo={`/test-runs/${testRunId}`} />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'total', label: t('report.passRate.total'), children: view.total },
            {
              key: 'passRate',
              label: t('report.passRate.label'),
              // §5：分母 total−na 为 0 时 passRate=null，展示「无有效执行」而非 0
              children:
                view.passRate === null ? (
                  <Typography.Text type="secondary">{t('report.passRate.none')}</Typography.Text>
                ) : (
                  `${view.passRate}%`
                ),
            },
            ...points.map((point) => ({ key: point.name, label: point.name, children: point.value })),
          ]}
        />
      </Card>
      <Card>
        {view.total === 0 ? (
          <EmptyState description={t('report.empty')} />
        ) : (
          <ReportChart option={donutOption(points)} ariaLabel={t('report.title.casePassRate')} height={300} />
        )}
      </Card>
    </PageContainer>
  )
}
