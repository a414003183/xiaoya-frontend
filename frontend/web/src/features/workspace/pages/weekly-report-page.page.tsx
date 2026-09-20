/** @route /projects/:projectId/weekly-report @title weeklyReport.title @perm weekly-report-view @hide @activeMenu /projects */

import { useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { TaskSummaryView } from '@zentao/api-client/generated/model/taskSummaryView'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  EmptyState,
  ListCard,
  PageContainer,
  PageHeader,
  PageLoading,
  Space,
  StatusTag,
  type TableColumnsType,
  Typography,
} from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { withParam } from '../../../shared/url'
import { statusTone as taskStatusTone } from '../../task'
import { fetchWeeklyReport, qk } from '../api/workspace.api'
import { analysisLines, shiftWeek, todayIso } from '../model'

/** EVM 数字区字段（§3.2 字段表；sv/cv 带符号百分数）。 */
const EVM_FIELDS = ['pv', 'ev', 'ac', 'sv', 'cv'] as const

/**
 * 项目周报（T-12 / §6 C 范式：EVM 数字区 + analysis 逐行纯文本 + 三张任务表 + 周导航）。
 * date 为周内任意一天（URL 同步），服务端归一到周一并幂等重算；analysis 禁 HTML 注入。
 */
export default function WeeklyReportPage() {
  const { t } = useTranslation()
  const projectId = Number(useParams().projectId)
  const [searchParams, setSearchParams] = useSearchParams()
  const date = searchParams.get('date') ?? todayIso()

  const report = useQuery({
    queryKey: qk.workspace.weeklyReport(projectId, date),
    queryFn: () => fetchWeeklyReport(projectId, date),
  })

  const goto = (next: string): void => {
    setSearchParams(withParam(searchParams, 'date', next))
  }

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
        <PageHeader title={t('weeklyReport.title')} backTo={`/projects/${projectId}`} />
        <Alert type="error" showIcon message={errorText(report.error, t, 'weeklyReport.message.loadFailed')} />
      </PageContainer>
    )
  }
  const view = report.data
  const lines = analysisLines(view.analysis)

  return (
    <PageContainer>
      <PageHeader
        title={t('weeklyReport.title')}
        backTo={`/projects/${projectId}`}
        extra={
          <Space>
            <Button aria-label="weekly-prev" onClick={() => goto(shiftWeek(date, -1))}>
              {t('weeklyReport.nav.prev')}
            </Button>
            <Typography.Text strong>{`${view.weekStart} ~ ${view.weekEnd}`}</Typography.Text>
            <Button aria-label="weekly-next" onClick={() => goto(shiftWeek(date, 1))}>
              {t('weeklyReport.nav.next')}
            </Button>
            <Button type="link" aria-label="weekly-current" onClick={() => goto(todayIso())}>
              {t('weeklyReport.nav.current')}
            </Button>
          </Space>
        }
      />
      <Card>
        <Descriptions
          column={4}
          items={[
            {
              key: 'weekSN',
              label: t('weeklyReport.field.weekSN'),
              children: view.weekSN,
            },
            ...EVM_FIELDS.map((field) => ({
              key: field,
              label: t(`weeklyReport.field.${field}`),
              children: Number(view[field]).toFixed(2),
            })),
            { key: 'staff', label: t('weeklyReport.field.staff'), children: view.staff },
          ]}
        />
      </Card>
      <Card title={t('weeklyReport.analysis')}>
        {lines.length === 0 ? (
          <EmptyState description={t('common.empty')} />
        ) : (
          // §3.2：analysis 为纯文本，按 \n 逐行渲染，永不注入 HTML（结论行文本即稳定 key）
          lines.map((line) => (
            <Typography.Paragraph key={line} className="tw:mb-1">
              {line}
            </Typography.Paragraph>
          ))
        )}
      </Card>
      <TaskSummaryTable title={t('weeklyReport.table.finished')} items={view.finished} />
      <TaskSummaryTable title={t('weeklyReport.table.postponed')} items={view.postponed} />
      <TaskSummaryTable title={t('weeklyReport.table.nextWeek')} items={view.nextWeek} />
    </PageContainer>
  )
}

/** 任务摘要表（task 域 TaskSummaryView；§3.2 三张表共用列定义 = 同一个列设置资源）。 */
function TaskSummaryTable({ title, items }: { title: string; items: TaskSummaryView[] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const columns: TableColumnsType<TaskSummaryView> = [
    { title: t('task.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('task.field.title'),
      dataIndex: 'title',
      render: (value: string, record: TaskSummaryView) => (
        <Typography.Link onClick={() => navigate(`/tasks/${record.id}`)}>{value}</Typography.Link>
      ),
    },
    {
      title: t('task.field.status'),
      dataIndex: 'status',
      width: 100,
      render: (value: string) => <StatusTag tone={taskStatusTone(value)}>{t(`task.status.${value}`)}</StatusTag>,
    },
    {
      title: t('task.field.priority'),
      dataIndex: 'priority',
      width: 80,
      render: (value: number) => t(`common.priority.${value}`),
    },
    {
      title: t('task.field.assignee'),
      dataIndex: 'assignee',
      width: 110,
      render: (v: string | null) => v ?? '-',
    },
    { title: t('task.field.estimate'), dataIndex: 'estimateHours', width: 90 },
    { title: t('task.field.consumed'), dataIndex: 'consumedHours', width: 90 },
    { title: t('task.field.left'), dataIndex: 'leftHours', width: 90 },
    {
      title: t('task.field.deadline'),
      dataIndex: 'endDate',
      width: 110,
      render: (value: string | null) => value ?? '-',
    },
  ]

  return (
    <ListCard
      title={title}
      columns={columns}
      columnSettingKey="weekly-report-tasks"
      rowKey="id"
      dataSource={items}
      pagination={false}
    />
  )
}
