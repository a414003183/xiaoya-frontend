// list-standard: exempt (modal) — 弹窗内失败行小表（上传回执，选择/呈现用），非列表页
import type { Translator } from '@zentao/api-client'
import type { LangImportView } from '@zentao/api-client/generated/model/langImportView'
import { Alert, Flex, ListCard, Modal, type TableColumnsType, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'

/** 上传结果：成功回执（成了几行）或失败明细（Excel 哪些行、什么原因）。 */
export type UploadOutcome =
  | { kind: 'success'; view: LangImportView }
  | { kind: 'failure'; fields: Record<string, string>; message: string }

/** 服务端行级原因码的 fields 键前缀（platform 卡 §3.12：`row:<Excel 行号>`）。 */
const ROW_PREFIX = 'row:'

/** 失败行（行号升序）；`file` 键是文件级错误，单独渲染。 */
function failedRows(fields: Record<string, string>): { row: number; reason: string }[] {
  return Object.entries(fields)
    .filter(([key]) => key.startsWith(ROW_PREFIX))
    .map(([key, reason]) => ({ row: Number(key.slice(ROW_PREFIX.length)), reason }))
    .sort((a, b) => a.row - b.row)
}

/** 原因码 → 文案：缺 i18n 键时回落原始码（码是 ASCII，en 界面不会因此冒中文）。 */
function reasonText(t: Translator, reason: string): string {
  const key = `platform.langUpload.reason.${reason}`
  const text = t(key)
  return text === key ? reason : text
}

export type LangUploadResultModalProps = {
  outcome: UploadOutcome | null
  onClose: () => void
}

/**
 * 上传结果弹窗（T21）：上传是瞬时动作，回执不该长期占着列表页——成功给计数，失败给到行级的明细。
 * 「上传即生效」的说明也在这里：覆盖层写的是同一个 `lang_item`，前端运行时与后端消息都读它。
 */
export function LangUploadResultModal({ outcome, onClose }: LangUploadResultModalProps) {
  const { t } = useTranslation()
  const rows = outcome?.kind === 'failure' ? failedRows(outcome.fields) : []
  const columns: TableColumnsType<{ row: number; reason: string }> = [
    { title: t('platform.langUpload.row'), dataIndex: 'row', width: 90 },
    {
      title: t('platform.langUpload.reason'),
      dataIndex: 'reason',
      render: (reason: string) => reasonText(t, reason),
    },
  ]

  return (
    <Modal
      open={outcome !== null}
      title={t('platform.langUpload.result.title')}
      onCancel={onClose}
      onOk={onClose}
      cancelButtonProps={{ style: { display: 'none' } }}
      okText={t('common.action.close')}
      width={720}
    >
      {outcome === null ? null : outcome.kind === 'success' ? (
        <Flex vertical gap={8}>
          <Alert
            type="success"
            showIcon
            message={`${t('platform.langUpload.success')}：${t('platform.langUpload.result.total', { total: outcome.view.totalRows })}、${t('platform.langUpload.result.applied', { applied: outcome.view.appliedRows })}`}
          />
          <Typography.Text type="secondary">{t('platform.langUpload.effectiveHint')}</Typography.Text>
        </Flex>
      ) : (
        <Flex vertical gap={8}>
          <Alert
            type="error"
            showIcon
            message={outcome.message}
            description={
              <Flex vertical gap={8}>
                <Typography.Text>{t('platform.langUpload.result.noChange')}</Typography.Text>
                {outcome.fields.file !== undefined ? (
                  <Typography.Text>
                    {`${t('platform.langUpload.reason')}：${reasonText(t, outcome.fields.file)}`}
                  </Typography.Text>
                ) : null}
                {rows.length > 0 ? (
                  <Typography.Text>{t('platform.langUpload.result.failed', { failed: rows.length })}</Typography.Text>
                ) : null}
              </Flex>
            }
          />
          {rows.length > 0 ? (
            <ListCard
              columns={columns}
              columnSettingKey="platform-lang-upload-failure"
              rowKey="row"
              size="small"
              pagination={false}
              dataSource={rows}
            />
          ) : null}
        </Flex>
      )}
    </Modal>
  )
}
