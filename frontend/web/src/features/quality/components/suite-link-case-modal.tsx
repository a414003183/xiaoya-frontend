// list-standard: exempt (modal) — 弹窗内关联小表，无列表页身份
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { LinkPickerModal, StatusTag, type TableColumnsType, useMessage } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchTestCases, linkSuiteCasesAction, type SuiteView, type TestCaseView } from '../api/quality.api'
import { testCaseTone } from '../model'

/**
 * 套件关联用例弹窗（T-7 / quality §6：按产品选**未关联**用例；UNIQUE 幂等由后端兜底，前端只滤已关联行）。
 * 候选来源 = 产品用例列表（已排除 type=library 的库用例）。
 * 呈现面收敛到 design-system 的 LinkPickerModal（T72/FE-11 单源，table 形态 · 空选禁用口径）。
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

  const columns: TableColumnsType<TestCaseView> = [
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
    <LinkPickerModal
      open={open}
      title={t('suite.action.linkCase')}
      onCancel={close}
      error={link.error ? errorText(link.error, t, 'common.message.failed') : null}
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
          onEmptySelection: 'disable',
        },
      }}
    />
  )
}
