// list-standard: exempt (modal) — 弹窗内关联小表，无列表页身份
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  EmptyState,
  Form,
  Modal,
  Select,
  Space,
  StatusTag,
  Table,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchLibraries, fetchLibraryCases, importCasesFromLibrary, qk, type TestCaseView } from '../api/quality.api'
import { testCaseTone } from '../model'

/**
 * 从用例库导入弹窗（T-7 / quality §6：选库 → 勾选库内用例 → POST import-from-library）。
 * 服务端复制为产品用例（libraryId=0，步骤一并复制），返回 importedCount（§8）；库内源用例不动。
 */
export function TestCaseImportModal({
  productId,
  open,
  onClose,
}: {
  productId: number
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [libraryId, setLibraryId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const libraries = useQuery({
    queryKey: qk.quality.libraryList({ forSelect: true }),
    queryFn: () => fetchLibraries({ limit: 100 }),
    enabled: open,
  })
  const cases = useQuery({
    queryKey: qk.quality.libraryCases(libraryId ?? 0, { forSelect: true }),
    queryFn: () => fetchLibraryCases(libraryId ?? 0, { limit: 100 }),
    enabled: open && libraryId !== null,
  })

  const close = () => {
    setSelectedIds([])
    setLibraryId(null)
    onClose()
  }

  const run = useMutation({
    mutationFn: () => importCasesFromLibrary(productId, { libraryId: libraryId ?? 0, caseIds: selectedIds }),
    onSuccess: () => {
      message.success(t('library.message.imported'))
      void queryClient.invalidateQueries({ queryKey: ['listTestCases'] })
      void queryClient.invalidateQueries({ queryKey: ['getLibrary'] })
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

  const items = cases.data?.items ?? []

  return (
    <Modal
      open={open}
      width={760}
      title={t('common.action.import')}
      onCancel={close}
      footer={
        <Space>
          <Button onClick={close}>{t('common.action.cancel')}</Button>
          <Button
            type="primary"
            loading={run.isPending}
            disabled={libraryId === null || selectedIds.length === 0}
            onClick={() => run.mutate()}
          >
            {t('common.action.import')}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <Form.Item label={t('library.field.name')}>
          <Select
            aria-label="import-library"
            value={libraryId}
            onChange={(value) => {
              setLibraryId(value ?? null)
              setSelectedIds([])
            }}
            options={(libraries.data?.items ?? []).map((library) => ({ value: library.id, label: library.name }))}
          />
        </Form.Item>
      </Form>
      {libraryId === null || items.length === 0 ? (
        <EmptyState description={t('common.empty')} />
      ) : (
        <Table<TestCaseView>
          rowKey="id"
          size="small"
          loading={cases.isPending}
          columns={columns}
          dataSource={items}
          pagination={false}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys.map((key) => Number(key))),
          }}
        />
      )}
      {run.error ? (
        <Typography.Paragraph type="danger" className="tw:mt-3">
          {errorText(run.error, t, 'common.message.failed')}
        </Typography.Paragraph>
      ) : null}
    </Modal>
  )
}
