import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { type GroupView, submitGroup, updateGroup } from '../api/org.api'

/** 权限组创建/编辑合一弹窗（org §6 F 范式：POST/PATCH /groups；编辑带 lockVersion）。 */

export const groupFormSchema = z.object({
  name: z.string().trim().min(1, 'common.message.required').max(60, 'common.message.required'),
  description: z.string().trim().max(255, 'common.message.required'),
})

export type GroupFormValues = z.input<typeof groupFormSchema>

export function GroupFormModal({
  group,
  open,
  onClose,
}: {
  group?: GroupView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = group != null
  const { control, handleSubmit, reset } = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: { name: group?.name ?? '', description: group?.description ?? '' },
  })

  // 创建/编辑共用一实例：切换 group（或关闭回到创建）时重置
  useEffect(() => {
    reset({ name: group?.name ?? '', description: group?.description ?? '' })
  }, [group, reset])

  const save = useMutation({
    mutationFn: (values: GroupFormValues) => {
      const body = { name: values.name, description: values.description === '' ? null : values.description }
      return editing ? updateGroup(group.id, { ...body, lockVersion: group.lockVersion }) : submitGroup(body)
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listGroups'] })
      void queryClient.invalidateQueries({ queryKey: ['getGroup'] })
      onClose()
    },
  })

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('org.group.editTitle') : t('org.group.action.create')}
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
          name="name"
          render={({ field }) => (
            <Form.Item label={t('org.group.field.name')} required>
              <Input {...field} value={field.value ?? ''} maxLength={60} aria-label="group-form-name" />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Form.Item label={t('org.group.field.description')}>
              <Input.TextArea
                {...field}
                value={field.value ?? ''}
                maxLength={255}
                rows={3}
                aria-label="group-form-description"
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
