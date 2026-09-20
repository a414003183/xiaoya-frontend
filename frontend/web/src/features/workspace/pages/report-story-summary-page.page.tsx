/** @route /products/:productId/reports/story-summary @title report.title.storySummary @perm report-view @hide @activeMenu /products */

import { useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Alert, Card, EmptyState, PageContainer, PageHeader, PageLoading } from '@zentao/design-system'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { fetchStorySummaryReport, qk } from '../api/workspace.api'
import ReportChart from '../components/report-chart'
import { barOption, localizedPoints, storySummaryGroups } from '../model'

/** 需求统计（T-12 / §6 C 范式：状态/优先级/阶段/类型四组分布图）。 */
export default function ReportStorySummaryPage() {
  const { t } = useTranslation()
  const productId = Number(useParams().productId)

  const report = useQuery({
    queryKey: qk.workspace.storySummary(productId),
    queryFn: () => fetchStorySummaryReport(productId),
  })

  const groups = useMemo(() => {
    if (!report.data) {
      return []
    }
    const mapped = storySummaryGroups(report.data)
    return [
      { key: 'status', title: t('report.group.status'), points: localizedPoints(mapped.byStatus, t) },
      { key: 'priority', title: t('report.group.priority'), points: localizedPoints(mapped.byPriority, t) },
      { key: 'stage', title: t('report.group.stage'), points: localizedPoints(mapped.byStage, t) },
      { key: 'type', title: t('report.group.type'), points: localizedPoints(mapped.byType, t) },
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
        <PageHeader title={t('report.title.storySummary')} backTo={`/products/${productId}`} />
        <Alert type="error" showIcon message={errorText(report.error, t, 'report.message.loadFailed')} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('report.title.storySummary')}
        subtitle={`${t('report.summary.total')}: ${report.data.total}`}
        backTo={`/products/${productId}`}
      />
      {report.data.total === 0 ? (
        <Card>
          <EmptyState description={t('report.empty')} />
        </Card>
      ) : (
        <div className="tw:grid tw:grid-cols-1 tw:gap-4 tw:lg:grid-cols-2">
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
