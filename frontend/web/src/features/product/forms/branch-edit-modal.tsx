import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { applyServerFields, NumberField, TextAreaField, TextField } from '../../../shared/form-fields'
import { type BranchView, patchBranch, submitBranch } from '../api/product.api'

export const branchFormSchema = z.object({
  name: z.string().min(1, 'common.message.required'),
  description: z.string().nullable(),
  sort: z.number().nullable(),
})

export type BranchFormValues = z.input<typeof branchFormSchema>

/** 分支创建/编辑合一弹窗（T-7；branch §3.2）。 */
export function BranchEditModal({
  productId,
  branch,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  branch: BranchView | null
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const editing = branch != null
  const { control, handleSubmit, setError, reset } = useForm<BranchFormValues>({
    resolver: zodResolver(branchFormSchema),
    defaultValues: {
      name: branch?.name ?? '',
      description: branch?.description ?? null,
      sort: branch?.sort ?? 0,
    },
  })

  // 切换新建/编辑对象时重置表单（defaultValues 只在首挂载生效）
  useEffect(() => {
    reset({
      name: branch?.name ?? '',
      description: branch?.description ?? null,
      sort: branch?.sort ?? 0,
    })
  }, [branch, reset])

  const save = useMutation({
    mutationFn: async (values: BranchFormValues) =>
      editing
        ? patchBranch(branch.id, { ...values, lockVersion: branch.lockVersion })
        : submitBranch(productId, values),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      onSaved?.()
      onClose()
    },
    onError: (error) => applyServerFields(error, setError),
  })

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('branch.action.edit') : t('branch.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="name"
          label={t('branch.field.name')}
          maxLength={255}
          aria-label="branch-name"
        />
        <NumberField control={control} name="sort" label={t('branch.field.sort')} min={0} aria-label="branch-sort" />
        <TextAreaField
          control={control}
          name="description"
          label={t('branch.field.description')}
          rows={3}
          maxLength={255}
          aria-label="branch-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
