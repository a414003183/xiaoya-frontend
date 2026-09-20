import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { type AccountView, submitPasswordReset } from '../api/org.api'
import { accountPasswordSchema } from '../forms/account-create-modal'
import { randomPassword } from '../model'

/** 管理员重置密码弹窗（org §5 reset-password：免旧密码，重置后通知账号本人）。 */

const resetSchema = z.object({ newPassword: accountPasswordSchema })

export function AccountResetPasswordModal({
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
  const { control, handleSubmit, reset } = useForm<z.input<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: '' },
  })

  const save = useMutation({
    mutationFn: (values: { newPassword: string }) => submitPasswordReset(account?.id ?? 0, values.newPassword),
    onSuccess: () => {
      message.success(t('org.account.message.passwordReset'))
      reset()
      onClose()
    },
  })

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={t('org.account.resetTitle')}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" loading={save.isPending} onClick={() => void submit()}>
            {t('common.action.submit')}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <Typography.Paragraph type="secondary">
          {t('org.account.resetHint', { account: account?.account ?? '' })}
        </Typography.Paragraph>
        <Controller
          control={control}
          name="newPassword"
          render={({ field }) => (
            <Form.Item label={t('org.account.field.newPassword')} required>
              <Space.Compact className="tw:w-full">
                <Input {...field} value={field.value ?? ''} maxLength={64} aria-label="account-reset-password" />
                <Button aria-label="account-reset-password-random" onClick={() => field.onChange(randomPassword())}>
                  {t('org.account.action.randomPassword')}
                </Button>
              </Space.Compact>
            </Form.Item>
          )}
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
