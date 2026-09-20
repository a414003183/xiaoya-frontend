import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Checkbox, Form, Input, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { copyGroup, type GroupView } from '../api/org.api'

/** 复制权限组弹窗（org §5 copy：copyPrivileges/copyMembers 各自生效，源组不变）。 */

const copySchema = z.object({
  name: z.string().trim().min(1, 'common.message.required').max(60, 'common.message.required'),
  description: z.string().trim().max(255, 'common.message.required'),
  copyPrivileges: z.boolean(),
  copyMembers: z.boolean(),
})

type CopyValues = z.input<typeof copySchema>

export function GroupCopyModal({
  group,
  open,
  onClose,
}: {
  group: GroupView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { control, handleSubmit, reset } = useForm<CopyValues>({
    resolver: zodResolver(copySchema),
    defaultValues: {
      name: t('org.group.copy.defaultName', { name: group?.name ?? '' }),
      description: group?.description ?? '',
      copyPrivileges: true,
      copyMembers: true,
    },
  })

  // 换源组时重置（默认名 = 源组名-副本，勾选默认全开）
  useEffect(() => {
    reset({
      name: t('org.group.copy.defaultName', { name: group?.name ?? '' }),
      description: group?.description ?? '',
      copyPrivileges: true,
      copyMembers: true,
    })
  }, [group, reset, t])

  const save = useMutation({
    mutationFn: (values: CopyValues) =>
      copyGroup(group?.id ?? 0, {
        name: values.name,
        description: values.description === '' ? null : values.description,
        copyPrivileges: values.copyPrivileges,
        copyMembers: values.copyMembers,
      }),
    onSuccess: () => {
      message.success(t('common.message.created'))
      void queryClient.invalidateQueries({ queryKey: ['listGroups'] })
      onClose()
    },
  })

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={t('org.group.copy.title')}
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
              <Input {...field} value={field.value ?? ''} maxLength={60} aria-label="group-copy-name" />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Form.Item label={t('org.group.field.description')}>
              <Input {...field} value={field.value ?? ''} maxLength={255} aria-label="group-copy-description" />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="copyPrivileges"
          render={({ field }) => (
            <Form.Item>
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                {t('org.group.copy.privileges')}
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
                {t('org.group.copy.members')}
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
