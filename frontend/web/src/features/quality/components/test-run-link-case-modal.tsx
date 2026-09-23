// list-standard: exempt (modal) — 弹窗内关联小表，无列表页身份
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Form,
  LinkPickerModal,
  Select,
  Space,
  StatusTag,
  type TableColumnsType,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fetchAccountOptions,
  fetchSuite,
  fetchSuites,
  fetchTestCases,
  fetchTestRunCases,
  linkTestRunCasesAction,
  type TestCaseView,
  type TestRunView,
} from '../api/quality.api'
import { testCaseTone } from '../model'

/**
 * 测试单关联用例弹窗（T-9 / quality §5 linkTestRunCases）：
 * 候选 = 产品用例（排除 type=library 与已关联行）；可按套件筛选（选套件 → 拉该套件 caseIds 过滤）；
 * 可统一指派执行人；重复关联由服务端幂等兜底（UNIQUE(test_run_id, test_case_id)）。
 * 呈现面收敛到 design-system 的 LinkPickerModal（T72/FE-11 单源，table 形态 · 空选提示口径）。
 */
export function TestRunLinkCaseModal({
  testRun,
  open,
  onClose,
}: {
  testRun: TestRunView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [suiteId, setSuiteId] = useState<number | null>(null)
  const [assignee, setAssignee] = useState<string | null>(null)

  const productId = testRun?.productId ?? 0
  const testRunId = testRun?.id ?? 0

  const candidates = useQuery({
    queryKey: ['listTestCases', productId, 'run-link-form'],
    queryFn: () => fetchTestCases(productId, { limit: 200 }),
    enabled: open && testRun != null,
  })
  const linked = useQuery({
    queryKey: ['listTestRunCases', testRunId, 'run-link-form'],
    queryFn: () => fetchTestRunCases(testRunId, { limit: 200 }),
    enabled: open && testRun != null,
  })
  const suites = useQuery({
    queryKey: ['listSuites', productId, 'run-link-form'],
    queryFn: () => fetchSuites(productId, { limit: 200 }),
    enabled: open && testRun != null,
  })
  const suite = useQuery({
    queryKey: ['getSuite', suiteId, 'run-link-form'],
    queryFn: () => fetchSuite(suiteId ?? 0),
    enabled: open && suiteId != null,
  })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions, enabled: open })

  const linkedIds = new Set((linked.data?.items ?? []).map((row) => row.testCaseId))
  const suiteCaseIds = suiteId == null ? null : new Set(suite.data?.caseIds ?? [])
  const items = (candidates.data?.items ?? []).filter(
    (item) => !linkedIds.has(item.id) && (suiteCaseIds === null || suiteCaseIds.has(item.id)),
  )

  const close = () => {
    setSelectedIds([])
    setSuiteId(null)
    setAssignee(null)
    onClose()
  }

  const link = useMutation({
    mutationFn: (caseIds: number[]) => linkTestRunCasesAction(testRunId, { caseIds, assignee }),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listTestRunCases'] })
      void queryClient.invalidateQueries({ queryKey: ['getTestRun'] })
      close()
    },
  })

  const columns: TableColumnsType<TestCaseView> = [
    { title: t('testCase.field.id'), dataIndex: 'id', width: 70 },
    { title: t('testRun.field.caseTitle'), dataIndex: 'title' },
    {
      title: t('testCase.field.priority'),
      dataIndex: 'priority',
      width: 90,
      render: (value: number) => t(`common.priority.${value}`),
    },
    {
      title: t('testCase.field.type'),
      dataIndex: 'type',
      width: 130,
      render: (value: string) => t(`testCase.type.${value}`),
    },
    {
      title: t('testCase.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (value: string) => <StatusTag tone={testCaseTone(value)}>{t(`testCase.status.${value}`)}</StatusTag>,
    },
  ]

  return (
    <LinkPickerModal
      open={open}
      forceRender
      title={t('testRun.action.linkCase')}
      onCancel={close}
      error={link.error ? errorText(link.error, t, 'common.message.failed') : null}
      toolbar={
        <Form layout="vertical">
          <Space wrap align="start">
            <Form.Item label={t('suite.field.name')}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                className="tw:w-56"
                aria-label="run-link-suite"
                value={suiteId}
                onChange={(value) => setSuiteId(value ?? null)}
                placeholder={t('common.field.none')}
                options={(suites.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))}
              />
            </Form.Item>
            <Form.Item label={t('testRun.field.assignee')}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                className="tw:w-56"
                aria-label="run-link-assignee"
                value={assignee}
                onChange={(value) => setAssignee(value ?? null)}
                options={(accounts.data ?? []).map((account) => ({
                  value: account.account,
                  label: `${account.realName}（${account.account}）`,
                }))}
              />
            </Form.Item>
          </Space>
        </Form>
      }
      picker={{
        kind: 'table',
        rows: items,
        columns,
        loading: candidates.isPending,
        emptyLabel: t('common.empty'),
        selectedIds,
        onSelectionChange: setSelectedIds,
        confirm: {
          cancelLabel: t('common.action.cancel'),
          confirmLabel: t('common.action.link'),
          onConfirm: () => link.mutate(selectedIds),
          pending: link.isPending,
          onEmptySelection: 'warn',
          emptyWarnLabel: t('testRun.message.linkCasesEmpty'),
        },
      }}
    />
  )
}
