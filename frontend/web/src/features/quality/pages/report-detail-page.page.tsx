/** @route /reports/:reportId @title quality.title.reportDetail @perm report-view @hide @activeMenu /executions */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Descriptions,
  EmptyState,
  HasPerm,
  PageContainer,
  PageHeader,
  PageLoading,
  Popconfirm,
  Tabs,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { withParam } from '../../../shared/url'
import { deleteReportAction, fetchReport, qk } from '../api/quality.api'
import { ReportEditModal } from '../forms/report-edit-modal'

/** 测试报告详情（T-10 / quality §6 D 范式：正文 content 按不透明文本渲染 + 关联测试单链接列表）。 */
export default function ReportDetailPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const reportId = Number(useParams().reportId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [editOpen, setEditOpen] = useState(false)

  const report = useQuery({ queryKey: qk.quality.report(reportId), queryFn: () => fetchReport(reportId) })
  const view = report.data

  const remove = useMutation({
    mutationFn: () => deleteReportAction(reportId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['getReport'] })
      void queryClient.invalidateQueries({ queryKey: ['listExecutionReports'] })
      navigate(`/executions/${view?.executionId ?? 0}/reports`)
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  if (report.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={view?.title ?? ''}
        backTo={`/executions/${view?.executionId ?? 0}/reports`}
        extra={
          <>
            <HasPerm perm="report-edit">
              <Button type="primary" onClick={() => setEditOpen(true)}>
                {t('report.action.edit')}
              </Button>
            </HasPerm>
            <HasPerm perm="report-delete">
              <Popconfirm title={t('report.message.deleteHint')} onConfirm={() => remove.mutate()}>
                <Button danger loading={remove.isPending}>
                  {t('common.action.delete')}
                </Button>
              </Popconfirm>
            </HasPerm>
          </>
        }
      />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('report.field.id'), children: view?.id ?? '-' },
            { key: 'execution', label: t('report.field.execution'), children: `#${view?.executionId ?? '-'}` },
            { key: 'project', label: t('report.field.project'), children: `#${view?.projectId ?? '-'}` },
            { key: 'product', label: t('report.field.product'), children: `#${view?.productId ?? '-'}` },
            { key: 'owner', label: t('report.field.owner'), children: view?.owner ?? '-' },
            { key: 'beginDate', label: t('report.field.beginDate'), children: view?.beginDate ?? '-' },
            { key: 'endDate', label: t('report.field.endDate'), children: view?.endDate ?? '-' },
            { key: 'createdBy', label: t('report.field.createdBy'), children: view?.createdBy ?? '-' },
            { key: 'createdAt', label: t('report.field.createdAt'), children: view?.createdAt ?? '-' },
          ]}
        />
      </Card>
      <Card>
        <Tabs
          activeKey={searchParams.get('tab') ?? 'content'}
          onChange={(key) => setSearchParams(withParam(searchParams, 'tab', key))}
          items={[
            {
              key: 'content',
              label: t('report.tab.content'),
              // content 为不透明富文本（§3.6）：前端只按 Markdown 原文/预格式文本渲染，不做解析
              children: view?.content ? (
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{view.content}</Typography.Paragraph>
              ) : (
                <EmptyState description={t('common.empty')} />
              ),
            },
            {
              key: 'runs',
              label: t('report.tab.runs'),
              children:
                (view?.testRunIds ?? []).length === 0 ? (
                  <EmptyState description={t('common.empty')} />
                ) : (
                  <ul className="tw:m-0 tw:list-none tw:p-0">
                    {(view?.testRunIds ?? []).map((testRunId) => (
                      <li key={testRunId}>
                        <Typography.Link onClick={() => navigate(`/test-runs/${testRunId}`)}>
                          {`#${testRunId}`}
                        </Typography.Link>
                      </li>
                    ))}
                  </ul>
                ),
            },
          ]}
        />
      </Card>
      {view ? <ReportEditModal report={view} open={editOpen} onClose={() => setEditOpen(false)} /> : null}
    </PageContainer>
  )
}
