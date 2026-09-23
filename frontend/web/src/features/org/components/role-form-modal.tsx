import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { TextField } from '../../../shared/form-fields'
import { type RoleView, submitRole, updateRole } from '../api/org.api'
import { ROLES_QUERY_KEY } from '../role-options'

/**
 * 角色创建/编辑合一弹窗（T23）：POST/PATCH `/roles`。
 *
 * 角色码（code）只在创建时能填：它是外部引用角色的稳定标识（迁移来的岗位角色带码），创建后不可改，
 * 编辑时只读展示。名字（name）全库唯一；描述与数据权限分开维护（数据权限在行内的「数据权限」里）。
 */

const roleFormSchema = z.object({
  name: z.string().trim().min(1, 'common.message.required').max(60, 'common.message.required'),
  code: z.string().trim().max(32, 'common.message.required'),
  description: z.string().trim().max(255, 'common.message.required'),
})

export type RoleFormValues = z.input<typeof roleFormSchema>

export function RoleFormModal({ role, open, onClose }: { role?: RoleView | null; open: boolean; onClose: () => void }) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = role != null
  const { control, handleSubmit, reset } = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: { name: role?.name ?? '', code: role?.code ?? '', description: role?.description ?? '' },
  })

  useEffect(() => {
    reset({ name: role?.name ?? '', code: role?.code ?? '', description: role?.description ?? '' })
  }, [role, reset])

  const save = useMutation({
    mutationFn: (values: RoleFormValues) => {
      const description = values.description === '' ? null : values.description
      if (editing) {
        return updateRole(role.id, { name: values.name, description, lockVersion: role.lockVersion })
      }
      return submitRole({ name: values.name, code: values.code === '' ? null : values.code, description })
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY })
      onClose()
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('org.role.action.edit') : t('org.role.action.create')}
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
        <TextField
          control={control}
          name="name"
          label={t('org.role.field.name')}
          maxLength={60}
          aria-label="role-form-name"
        />
        <Controller
          control={control}
          name="code"
          render={({ field }) => (
            <Form.Item
              label={t('org.role.field.code')}
              extra={editing ? t('org.role.form.codeFixed') : t('org.role.codeHint')}
            >
              <Input
                {...field}
                value={field.value ?? ''}
                maxLength={32}
                disabled={editing}
                aria-label="role-form-code"
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Form.Item label={t('org.role.field.description')}>
              <Input.TextArea
                {...field}
                value={field.value ?? ''}
                maxLength={255}
                rows={3}
                aria-label="role-form-description"
              />
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
