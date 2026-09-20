import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, EmptyState, Modal, Space, StatusTag, Table, Typography, useMessage } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchTestCases, linkSuiteCasesAction, type SuiteView, type TestCaseView } from '../api/quality.api'
import { testCaseTone } from '../model'

/**
 * 套件关联用例弹窗（T-7 / quality §6：按产品选**未关联**用例；UNIQUE 幂等由后端兜底，前端只滤已关联行）。
 * 候选来源 = 产品用例列表（已排除 type=library 的库用例）。
 */
export function SuiteLinkCaseModal({
  suite,
  open,
  onClose,
}: {
  suite: SuiteView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const productId = suite?.productId ?? 0
  const candidates = useQuery({
    queryKey: ['listTestCases', productId, 'link-form'],
    queryFn: () => fetchTestCases(productId, { limit: 200 }),
    enabled: open && suite != null,
  })

  const linked = new Set(suite?.caseIds ?? [])
  const items = (candidates.data?.items ?? []).filter((item) => !linked.has(item.id))

  const close = () => {
    setSelectedIds([])
    onClose()
  }

  const link = useMutation({
    mutationFn: (caseIds: number[]) => linkSuiteCasesAction(suite?.id ?? 0, caseIds),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['getSuite'] })
      void queryClient.invalidateQueries({ queryKey: ['listSuites'] })
      close()
    },
  })

  const columns = [
    { title: t('testCase.field.id'), dataIndex: 'id', width: 70 },
    { title: t('testCase.field.title'), dataIndex: 'title' },
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
    <Modal
      open={open}
      width={760}
      title={t('suite.action.linkCase')}
      onCancel={close}
      footer={
        <Space>
          <Button onClick={close}>{t('common.action.cancel')}</Button>
          <Button
            type="primary"
            loading={link.isPending}
            disabled={selectedIds.length === 0}
            onClick={() => link.mutate(selectedIds)}
          >
            {t('common.action.link')}
          </Button>
        </Space>
      }
    >
      {items.length === 0 ? (
        <EmptyState description={t('common.empty')} />
      ) : (
        <Table<TestCaseView>
          rowKey="id"
          size="small"
          loading={candidates.isPending}
          columns={columns}
          dataSource={items}
          pagination={false}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys.map((key) => Number(key))),
          }}
        />
      )}
      {link.error ? (
        <Typography.Paragraph type="danger" className="tw:mt-3">
          {errorText(link.error, t, 'common.message.failed')}
        </Typography.Paragraph>
      ) : null}
    </Modal>
  )
}
