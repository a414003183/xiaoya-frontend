/** @route /executions/:executionId/reports @title quality.title.reports @perm report-view @hide @activeMenu /executions */
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  HasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  type TableColumnsType,
  Typography,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { keywordField, ListFilterForm } from '../../../shared/list-filter'
import { withParam } from '../../../shared/url'
import { fetchExecutionReports, type ReportView } from '../api/quality.api'
import { ReportCreateModal } from '../forms/report-create-modal'

/** 测试报告列表（T-10 / quality §6 L 范式：执行下报告列表 + 建报告弹窗 + 详情入口）。 */
export default function ReportListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const executionId = Number(useParams().executionId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)

  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const reports = useQuery({
    queryKey: ['listExecutionReports', executionId, { q, page }],
    queryFn: () => fetchExecutionReports(executionId, { page, limit: 20, q }),
  })

  const columns: TableColumnsType<ReportView> = [
    { title: t('report.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('report.field.title'),
      dataIndex: 'title',
      render: (title: string, record: ReportView) => (
        <Typography.Link onClick={() => navigate(`/reports/${record.id}`)}>{title}</Typography.Link>
      ),
    },
    { title: t('report.field.owner'), dataIndex: 'owner', width: 110, render: (value: string | null) => value ?? '-' },
    {
      title: t('report.field.testRuns'),
      dataIndex: 'testRunIds',
      width: 200,
      render: (value: number[]) => (value.length === 0 ? '-' : value.map((id) => `#${id}`).join('、')),
    },
    {
      title: `${t('report.field.beginDate')} ~ ${t('report.field.endDate')}`,
      key: 'dateRange',
      width: 200,
      render: (_: unknown, record: ReportView) => `${record.beginDate} ~ ${record.endDate}`,
    },
    { title: t('report.field.createdBy'), dataIndex: 'createdBy', width: 110 },
    { title: t('report.field.createdAt'), dataIndex: 'createdAt', width: 190 },
  ]

  return (
    <PageContainer>
      <PageHeader title={t('quality.title.reports')} backTo={`/executions/${executionId}/tasks`} />
      <ListFilterForm fields={[keywordField(t('report.field.title'), t('common.action.search'))]} />
      <ListCard
        columns={columns}
        columnSettingKey="quality-reports"
        actions={
          <HasPerm perm="report-create">
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t('report.action.create')}
            </Button>
          </HasPerm>
        }
        rowKey="id"
        loading={reports.isPending}
        dataSource={reports.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: 20,
          total: reports.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <ReportCreateModal
        executionId={executionId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(item) => navigate(`/reports/${item.id}`)}
      />
    </PageContainer>
  )
}
