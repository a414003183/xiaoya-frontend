import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { submitPasswordChange } from '../api/org.api'
import { accountPasswordSchema } from '../forms/account-create-modal'

/** 本人改密弹窗（org §5 password：accountId 必须 = 当前账号，验旧密码；/my/profile 与账号列表 @me 行复用）。 */

const passwordModalSchema = z.object({
  oldPassword: z.string().min(1, 'common.message.required').max(64, 'common.message.required'),
  newPassword: accountPasswordSchema,
})

export type AccountPasswordValues = z.input<typeof passwordModalSchema>

export function AccountPasswordModal({
  accountId,
  open,
  onClose,
}: {
  accountId: number | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { control, handleSubmit, reset } = useForm<AccountPasswordValues>({
    resolver: zodResolver(passwordModalSchema),
    defaultValues: { oldPassword: '', newPassword: '' },
  })

  const save = useMutation({
    mutationFn: (values: AccountPasswordValues) =>
      submitPasswordChange(accountId ?? 0, values.oldPassword, values.newPassword),
    onSuccess: () => {
      message.success(t('org.account.message.passwordChanged'))
      reset()
      onClose()
      // 06 A7-5：改密即清服务端首登强制改密标记，失效 /me 让会话门禁立刻放行业务路由
      void queryClient.invalidateQueries({ queryKey: ['getMe'] })
    },
  })

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={t('org.account.passwordTitle')}
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
        <Controller
          control={control}
          name="oldPassword"
          render={({ field }) => (
            <Form.Item label={t('org.account.field.oldPassword')} required>
              <Input.Password {...field} value={field.value ?? ''} maxLength={64} aria-label="account-password-old" />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="newPassword"
          render={({ field }) => (
            <Form.Item label={t('org.account.field.newPassword')} required>
              <Input.Password {...field} value={field.value ?? ''} maxLength={64} aria-label="account-password-new" />
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
