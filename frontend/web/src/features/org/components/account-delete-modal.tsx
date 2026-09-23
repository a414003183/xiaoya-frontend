import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { type AccountView, submitAccountDelete } from '../api/org.api'

/** 删除账号弹窗（org §5 delete：软删；守卫 ≠ 本人/内置 admin → 42203，前端先行提示）。 */
export function AccountDeleteModal({
  account,
  open,
  onClose,
}: {
  account: AccountView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const remove = useMutation({
    mutationFn: () => submitAccountDelete(account?.id ?? 0),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['listAccounts'] })
      void queryClient.invalidateQueries({ queryKey: ['getDepartmentTree'] })
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      forceRender
      title={t('org.account.deleteTitle')}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button danger loading={remove.isPending} onClick={() => remove.mutate()}>
            {t('common.action.delete')}
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph>{t('org.account.deleteHint', { account: account?.account ?? '' })}</Typography.Paragraph>
      <Typography.Paragraph type="warning">{t('org.account.deleteGuard')}</Typography.Paragraph>
      {remove.error ? (
        <Typography.Paragraph type="danger">{errorText(remove.error, t, 'common.message.failed')}</Typography.Paragraph>
      ) : null}
    </Modal>
  )
}
