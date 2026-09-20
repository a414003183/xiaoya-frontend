/** @route /test-runs/:testRunId @title quality.title.testRunDetail @perm testrun-view @hide @activeMenu /executions */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Descriptions,
  EmptyState,
  HasPerm,
  hasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  PageLoading,
  Popconfirm,
  Space,
  StatusTag,
  type TableColumnsType,
  Tabs,
  Typography,
  useMessage,
  usePrivileges,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { actionsFor } from '../../../shared/meta'
import { withParam } from '../../../shared/url'
import { ActivityTimeline } from '../../platform'
import {
  deleteTestRunAction,
  fetchTestRun,
  fetchTestRunActivities,
  fetchTestRunCases,
  fetchTestRunMeta,
  qk,
  type ResultView,
} from '../api/quality.api'
import { TestRunCloseModal } from '../components/test-run-close-modal'
import { TestRunConfirmModal } from '../components/test-run-confirm-modal'
import { TestRunEditModal } from '../forms/test-run-edit-modal'
import { actionI18nKey, runResultTone, summarizeResults, testRunTone } from '../model'

type ConfirmAction = 'start' | 'block' | 'activate'

/** 测试单详情（T-9 / quality §6 D 范式：动作区 meta 驱动 + 执行统计由 runs 现算 + 执行用例/描述/动态页签）。 */
export default function TestRunDetailPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const testRunId = Number(useParams().testRunId)
  const [searchParams, setSearchParams] = useSearchParams()
  const privileges = usePrivileges()
  const [editOpen, setEditOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  const testRun = useQuery({ queryKey: qk.quality.testRun(testRunId), queryFn: () => fetchTestRun(testRunId) })
  const meta = useQuery({ queryKey: qk.quality.testRunMeta(), queryFn: fetchTestRunMeta })
  const runs = useQuery({
    queryKey: qk.quality.testRunCases(testRunId, { limit: 200 }),
    queryFn: () => fetchTestRunCases(testRunId, { limit: 200 }),
  })

  const remove = useMutation({
    mutationFn: () => deleteTestRunAction(testRunId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['getTestRun'] })
      void queryClient.invalidateQueries({ queryKey: ['listTestRuns'] })
      navigate(`/products/${testRun.data?.productId ?? 0}/test-runs`)
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  if (testRun.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const view = testRun.data
  const items = runs.data?.items ?? []
  const summary = summarizeResults(items) // 执行统计现算（§6：无独立统计端点）
  const actions = actionsFor(meta.data?.actions, view?.status).filter(
    (action) => !action.code || hasPerm(privileges, action.code),
  )

  const openAction = (action: string) => {
    switch (action) {
      case 'edit':
        setEditOpen(true)
        return
      case 'close':
        setCloseOpen(true)
        return
      case 'start':
      case 'block':
      case 'activate':
        setConfirmAction(action)
        return
      default:
        return
    }
  }

  const runColumns: TableColumnsType<ResultView> = [
    {
      title: t('testRun.field.caseTitle'),
      dataIndex: 'caseTitle',
      render: (title: string | null, record: ResultView) => (
        <Typography.Link onClick={() => navigate(`/test-cases/${record.testCaseId}`)}>{title ?? '-'}</Typography.Link>
      ),
    },
    {
      title: t('testCase.field.priority'),
      dataIndex: 'casePriority',
      width: 90,
      render: (value: number | null) => (value ? t(`common.priority.${value}`) : '-'),
    },
    {
      title: t('testRun.field.assignee'),
      dataIndex: 'assignee',
      width: 110,
      render: (value: string | null) => value ?? '-',
    },
    {
      title: t('testRun.field.result'),
      dataIndex: 'result',
      width: 110,
      render: (value: string | null) =>
        value ? <StatusTag tone={runResultTone(value)}>{t(`testCase.result.${value}`)}</StatusTag> : '-',
    },
    {
      title: t('testRun.field.lastRunner'),
      dataIndex: 'runner',
      width: 110,
      render: (value: string | null) => value ?? '-',
    },
    {
      title: t('testRun.field.lastRunAt'),
      dataIndex: 'runAt',
      width: 190,
      render: (value: string | null) => value ?? '-',
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            {view?.name ?? ''}
            <StatusTag tone={testRunTone(view?.status ?? 'wait')}>
              {t(`testRun.status.${view?.status ?? 'wait'}`)}
            </StatusTag>
          </Space>
        }
        backTo={view ? `/products/${view.productId}/test-runs` : '/products'}
        extra={
          <>
            <Button onClick={() => navigate(`/test-runs/${testRunId}/cases`)}>{t('testRun.tab.cases')}</Button>
            {actions.map((action) => (
              <Button
                key={action.action}
                type={action.action === 'start' || action.action === 'close' ? 'primary' : 'default'}
                onClick={() => openAction(action.action)}
              >
                {t(actionI18nKey('testRun', action.action))}
              </Button>
            ))}
            <HasPerm perm="testrun-delete">
              <Popconfirm title={t('testRun.message.deleteHint')} onConfirm={() => remove.mutate()}>
                <Button danger loading={remove.isPending}>
                  {t('common.action.delete')}
                </Button>
              </Popconfirm>
            </HasPerm>
          </>
        }
      />
      <Card>
        <Space className="tw:mb-3" wrap>
          <Typography.Text type="secondary">{t('testRun.field.result')}</Typography.Text>
          {(['pass', 'fail', 'blocked', 'n/a'] as const).map((key) => (
            <StatusTag key={key} tone={runResultTone(key)}>
              {`${t(`testCase.result.${key}`)} ${summary[key]}`}
            </StatusTag>
          ))}
          <StatusTag tone="neutral">{`${t('testRun.summary.none')} ${summary.none}`}</StatusTag>
          <Typography.Text type="secondary">{t('testRun.message.statTotal', { total: items.length })}</Typography.Text>
        </Space>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('testRun.field.id'), children: view?.id ?? '-' },
            { key: 'product', label: t('testRun.field.product'), children: `#${view?.productId ?? '-'}` },
            { key: 'project', label: t('testRun.field.project'), children: `#${view?.projectId ?? '-'}` },
            { key: 'execution', label: t('testRun.field.execution'), children: `#${view?.executionId ?? '-'}` },
            { key: 'build', label: t('testRun.field.build'), children: view?.buildId ? `#${view.buildId}` : '-' },
            { key: 'owner', label: t('testRun.field.owner'), children: view?.owner ?? '-' },
            {
              key: 'priority',
              label: t('testRun.field.priority'),
              children: t(`common.priority.${view?.priority ?? 3}`),
            },
            {
              key: 'type',
              label: t('testRun.field.type'),
              children: view?.type ? t(`testRun.type.${view.type}`) : '-',
            },
            { key: 'beginDate', label: t('testRun.field.beginDate'), children: view?.beginDate ?? '-' },
            { key: 'endDate', label: t('testRun.field.endDate'), children: view?.endDate ?? '-' },
            { key: 'realBeganAt', label: t('testRun.field.realBeganAt'), children: view?.realBeganAt ?? '-' },
            {
              key: 'realFinishedAt',
              label: t('testRun.field.realFinishedAt'),
              children: view?.realFinishedAt ?? '-',
            },
            { key: 'members', label: t('testRun.field.members'), children: (view?.members ?? []).join('、') || '-' },
            {
              key: 'notify',
              label: t('testRun.field.notify'),
              children: (view?.notifyAccounts ?? []).join('、') || '-',
            },
            {
              key: 'report',
              label: t('testRun.field.report'),
              children: view?.reportId ? (
                <Typography.Link onClick={() => navigate(`/reports/${view.reportId}`)}>
                  {`#${view.reportId}`}
                </Typography.Link>
              ) : (
                '-'
              ),
            },
            { key: 'createdBy', label: t('common.field.createdBy'), children: view?.createdBy ?? '-' },
          ]}
        />
      </Card>
      <Card>
        <Tabs
          activeKey={searchParams.get('tab') ?? 'cases'}
          onChange={(key) => setSearchParams(withParam(searchParams, 'tab', key))}
          items={[
            {
              key: 'cases',
              label: t('testRun.tab.cases'),
              children: (
                <ListCard
                  columns={runColumns}
                  columnSettingKey="test-run-detail-cases"
                  rowKey="id"
                  loading={runs.isPending}
                  dataSource={items}
                  pagination={false}
                />
              ),
            },
            {
              key: 'description',
              label: t('testRun.tab.description'),
              children: view?.description ? (
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{view.description}</Typography.Paragraph>
              ) : (
                <EmptyState description={t('common.empty')} />
              ),
            },
            {
              key: 'activities',
              label: t('testRun.tab.activities'),
              children: <ActivityTimeline fetchPage={(beforeId) => fetchTestRunActivities(testRunId, beforeId)} />,
            },
          ]}
        />
      </Card>
      {view ? (
        <TestRunEditModal
          productId={view.productId}
          testRun={view}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
      <TestRunCloseModal testRun={view ?? null} open={closeOpen} onClose={() => setCloseOpen(false)} />
      {confirmAction !== null ? (
        <TestRunConfirmModal
          testRun={view ?? null}
          action={confirmAction}
          open
          onClose={() => setConfirmAction(null)}
        />
      ) : null}
    </PageContainer>
  )
}
