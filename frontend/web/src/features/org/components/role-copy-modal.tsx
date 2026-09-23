import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Checkbox, Form, Input, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { copyRole, type RoleView } from '../api/org.api'
import { ROLES_QUERY_KEY } from '../role-options'

/** 复制角色弹窗（T23：copyPrivileges/copyMembers 各自生效，源角色不变；副本不继承数据权限）。 */

const copySchema = z.object({
  name: z.string().trim().min(1, 'common.message.required').max(60, 'common.message.required'),
  description: z.string().trim().max(255, 'common.message.required'),
  copyPrivileges: z.boolean(),
  copyMembers: z.boolean(),
})

type CopyValues = z.input<typeof copySchema>

export function RoleCopyModal({ role, open, onClose }: { role: RoleView | null; open: boolean; onClose: () => void }) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { control, handleSubmit, reset } = useForm<CopyValues>({
    resolver: zodResolver(copySchema),
    defaultValues: {
      name: t('org.role.copy.defaultName', { name: role?.name ?? '' }),
      description: role?.description ?? '',
      copyPrivileges: true,
      copyMembers: true,
    },
  })

  // 换源角色时重置（默认名 = 源角色名-副本，勾选默认全开）
  useEffect(() => {
    reset({
      name: t('org.role.copy.defaultName', { name: role?.name ?? '' }),
      description: role?.description ?? '',
      copyPrivileges: true,
      copyMembers: true,
    })
  }, [role, reset, t])

  const save = useMutation({
    mutationFn: (values: CopyValues) =>
      copyRole(role?.id ?? 0, {
        name: values.name,
        description: values.description === '' ? null : values.description,
        copyPrivileges: values.copyPrivileges,
        copyMembers: values.copyMembers,
      }),
    onSuccess: () => {
      message.success(t('common.message.created'))
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY })
      onClose()
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  return (
    <Modal
      open={open}
      forceRender
      title={t('org.role.copy.title')}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" loading={save.isPending} onClick={() => void handleSubmit((v) => save.mutate(v))()}>
            {t('common.action.submit')}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Form.Item label={t('org.role.field.name')} required>
              <Input {...field} value={field.value ?? ''} maxLength={60} aria-label="role-copy-name" />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Form.Item label={t('org.role.field.description')}>
              <Input {...field} value={field.value ?? ''} maxLength={255} aria-label="role-copy-description" />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="copyPrivileges"
          render={({ field }) => (
            <Form.Item>
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                {t('org.role.copy.privileges')}
              </Checkbox>
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="copyMembers"
          render={({ field }) => (
            <Form.Item>
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                {t('org.role.copy.members')}
              </Checkbox>
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
