/** @route /executions/:executionId/reports/burn @title report.title.burn @perm report-view @hide @activeMenu /executions */

import { useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Alert, Card, Descriptions, EmptyState, PageContainer, PageHeader, PageLoading } from '@zentao/design-system'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { fetchBurnReport, qk } from '../api/workspace.api'
import ReportChart from '../components/report-chart'
import { burnOption } from '../model'

/** 燃尽报表（T-12 / §6 C 范式：ideal 参考线 + remaining 实际线折线图，无过滤面板）。 */
export default function ReportBurnPage() {
  const { t } = useTranslation()
  const executionId = Number(useParams().executionId)

  const report = useQuery({
    queryKey: qk.workspace.burnReport(executionId),
    queryFn: () => fetchBurnReport(executionId),
  })
  const option = useMemo(
    () =>
      report.data
        ? burnOption(report.data, { ideal: t('report.series.ideal'), remaining: t('report.series.remaining') })
        : null,
    [report.data, t],
  )

  if (report.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  if (report.error || !report.data || option === null) {
    return (
      <PageContainer>
        <PageHeader title={t('report.title.burn')} backTo={`/executions/${executionId}`} />
        <Alert type="error" showIcon message={errorText(report.error, t, 'report.message.loadFailed')} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('report.title.burn')} backTo={`/executions/${executionId}`} />
      <Card>
        <Descriptions
          column={2}
          items={[
            { key: 'beginDate', label: t('report.burn.beginDate'), children: report.data.beginDate },
            { key: 'endDate', label: t('report.burn.endDate'), children: report.data.endDate },
          ]}
        />
        {report.data.dates.length === 0 ? (
          <EmptyState description={t('report.empty')} />
        ) : (
          <ReportChart option={option} ariaLabel={t('report.title.burn')} height={320} />
        )}
      </Card>
    </PageContainer>
  )
}
