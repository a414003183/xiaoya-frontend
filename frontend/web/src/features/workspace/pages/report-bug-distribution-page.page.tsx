/** @route /products/:productId/reports/bug-distribution @title report.title.bugDistribution @perm report-view @hide @activeMenu /products */

import { useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Alert, Card, EmptyState, PageContainer, PageHeader, PageLoading } from '@zentao/design-system'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { fetchBugDistributionReport, qk } from '../api/workspace.api'
import ReportChart from '../components/report-chart'
import { barOption, bugDistributionGroups, localizedPoints } from '../model'

/** Bug 分布（T-12 / §6 C 范式：严重度/状态/解决方案三组分布图；resolution 空值计 unresolved 桶）。 */
export default function ReportBugDistributionPage() {
  const { t } = useTranslation()
  const productId = Number(useParams().productId)

  const report = useQuery({
    queryKey: qk.workspace.bugDistribution(productId),
    queryFn: () => fetchBugDistributionReport(productId),
  })

  const groups = useMemo(() => {
    if (!report.data) {
      return []
    }
    const mapped = bugDistributionGroups(report.data)
    return [
      { key: 'severity', title: t('report.group.severity'), points: localizedPoints(mapped.bySeverity, t) },
      { key: 'status', title: t('report.group.status'), points: localizedPoints(mapped.byStatus, t) },
      { key: 'resolution', title: t('report.group.resolution'), points: localizedPoints(mapped.byResolution, t) },
    ]
  }, [report.data, t])

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
        <PageHeader title={t('report.title.bugDistribution')} backTo={`/products/${productId}`} />
        <Alert type="error" showIcon message={errorText(report.error, t, 'report.message.loadFailed')} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('report.title.bugDistribution')}
        subtitle={`${t('report.summary.total')}: ${report.data.total}`}
        backTo={`/products/${productId}`}
      />
      {report.data.total === 0 ? (
        <Card>
          <EmptyState description={t('report.empty')} />
        </Card>
      ) : (
        <div className="tw:grid tw:grid-cols-1 tw:gap-4 tw:lg:grid-cols-3">
          {groups.map((group) => (
            <Card key={group.key} title={group.title}>
              <ReportChart option={barOption(group.points, t('report.series.count'))} ariaLabel={group.title} />
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
