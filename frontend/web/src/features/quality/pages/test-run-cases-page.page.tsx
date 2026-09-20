/** @route /test-runs/:testRunId/cases @title quality.title.testRunCases @perm testrun-view @hide @activeMenu /executions */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Form,
  HasPerm,
  ListCard,
  Modal,
  PageContainer,
  PageHeader,
  Select,
  Space,
  StatusTag,
  type TableColumnsType,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { withParam } from '../../../shared/url'
import {
  assignRunCase,
  fetchAccountOptions,
  fetchTestRun,
  fetchTestRunCases,
  qk,
  type ResultView,
  unlinkTestRunCasesAction,
} from '../api/quality.api'
import { TestRunLinkCaseModal } from '../components/test-run-link-case-modal'
import { TestRunResultModal } from '../components/test-run-result-modal'
import { runResultTone, testRunTone } from '../model'

/** 指派执行人弹窗（§5 assignRunCase：行须已关联；行内选择器就地改派）。 */
function RunAssignModal({
  testRunId,
  run,
  open,
  onClose,
}: {
  testRunId: number
  run: ResultView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [assignee, setAssignee] = useState<string | null>(null)
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions, enabled: open })

  const assign = useMutation({
    mutationFn: () => assignRunCase(testRunId, run?.testCaseId ?? 0, assignee ?? ''),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listTestRunCases'] })
      setAssignee(null)
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      forceRender
      title={t('testRun.action.assignCase')}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" loading={assign.isPending} disabled={!assignee} onClick={() => assign.mutate()}>
            {t('common.action.submit')}
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">{run?.caseTitle ?? ''}</Typography.Paragraph>
      <Form layout="vertical">
        <Form.Item label={t('testRun.field.assignee')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            aria-label="run-assignee"
            value={assignee}
            onChange={(value) => setAssignee(value ?? null)}
            options={(accounts.data ?? []).map((account) => ({
              value: account.account,
              label: `${account.realName}（${account.account}）`,
            }))}
          />
        </Form.Item>
      </Form>
      {assign.error ? (
        <Typography.Paragraph type="danger">{errorText(assign.error, t, 'common.message.failed')}</Typography.Paragraph>
      ) : null}
    </Modal>
  )
}

/** 执行用例（T-9 / quality §6 L 范式：清单 + 逐条登记结果/指派执行人 + 关联/解除，登记后行内即时刷新）。 */
export default function TestRunCasesPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const testRunId = Number(useParams().testRunId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [linkOpen, setLinkOpen] = useState(false)
  const [resultRun, setResultRun] = useState<ResultView | null>(null)
  const [assignRun, setAssignRun] = useState<ResultView | null>(null)

  const result = searchParams.get('result') ?? ''
  const page = Number(searchParams.get('page') ?? 1)
  const runMeta = useMetaOptions('testRun')

  const testRun = useQuery({ queryKey: qk.quality.testRun(testRunId), queryFn: () => fetchTestRun(testRunId) })
  const runs = useQuery({
    queryKey: qk.quality.testRunCases(testRunId, { result, page }),
    queryFn: () => fetchTestRunCases(testRunId, { page, limit: 20, filters: { result } }),
  })

  const unlink = useMutation({
    mutationFn: (caseIds: number[]) => unlinkTestRunCasesAction(testRunId, caseIds),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      setSelectedIds([])
      void queryClient.invalidateQueries({ queryKey: ['listTestRunCases'] })
      void queryClient.invalidateQueries({ queryKey: ['getTestRun'] })
    },
  })

  const columns: TableColumnsType<ResultView> = [
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
      width: 120,
      render: (value: string | null) => value ?? '-',
    },
    {
      title: t('testRun.field.result'),
      dataIndex: 'result',
      width: 110,
      render: (value: string | null) =>
        value ? (
          <StatusTag tone={runResultTone(value)}>{t(`testCase.result.${value}`)}</StatusTag>
        ) : (
          <StatusTag tone="neutral">{t('testRun.summary.none')}</StatusTag>
        ),
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
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 200,
      render: (_: unknown, record: ResultView) => (
        <Space size={4}>
          <HasPerm perm="testrun-record-result">
            <Button
              size="small"
              type="link"
              disabled={testRun.data?.status !== 'doing'}
              onClick={() => setResultRun(record)}
            >
              {t('testRun.action.recordResult')}
            </Button>
          </HasPerm>
          <HasPerm perm="testrun-assign-case">
            <Button size="small" type="link" onClick={() => setAssignRun(record)}>
              {t('testRun.action.assignCase')}
            </Button>
          </HasPerm>
        </Space>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            {testRun.data?.name ?? t('quality.title.testRunCases')}
            <StatusTag tone={testRunTone(testRun.data?.status ?? 'wait')}>
              {t(`testRun.status.${testRun.data?.status ?? 'wait'}`)}
            </StatusTag>
          </Space>
        }
        backTo={`/test-runs/${testRunId}`}
      />
      <ListFilterForm fields={[selectField('result', t('testRun.field.result'), runMeta.options('result'))]} />
      <ListCard
        columns={columns}
        columnSettingKey="quality-test-run-cases"
        actions={
          <>
            <HasPerm perm="testrun-link-case">
              <Button type="primary" onClick={() => setLinkOpen(true)}>
                {t('testRun.action.linkCase')}
              </Button>
            </HasPerm>
            <HasPerm perm="testrun-link-case">
              <Button
                disabled={selectedIds.length === 0}
                loading={unlink.isPending}
                onClick={() => unlink.mutate(selectedIds)}
              >
                {t('testRun.action.unlinkCase')}
              </Button>
            </HasPerm>
          </>
        }
        rowKey="id"
        loading={runs.isPending}
        dataSource={runs.data?.items ?? []}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys.map((key) => Number(key))),
        }}
        pagination={{
          current: page,
          pageSize: 20,
          total: runs.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      {unlink.error ? (
        <Typography.Paragraph type="danger">{errorText(unlink.error, t, 'common.message.failed')}</Typography.Paragraph>
      ) : null}
      <TestRunLinkCaseModal testRun={testRun.data ?? null} open={linkOpen} onClose={() => setLinkOpen(false)} />
      <TestRunResultModal
        testRunId={testRunId}
        run={resultRun}
        open={resultRun !== null}
        onClose={() => setResultRun(null)}
      />
      <RunAssignModal
        testRunId={testRunId}
        run={assignRun}
        open={assignRun !== null}
        onClose={() => setAssignRun(null)}
      />
    </PageContainer>
  )
}
