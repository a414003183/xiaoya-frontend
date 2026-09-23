import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { applyServerFields, NumberField, SelectField, TextField } from '../../../shared/form-fields'
import { type CategoryView, fetchAccountOptions, patchCategory, submitCategory } from '../api/product.api'

export const categoryFormSchema = z.object({
  name: z.string().min(1, 'common.message.required'),
  parentId: z.number({ error: 'common.message.required' }),
  owner: z.string().nullable(),
  sort: z.number().nullable(),
})

export type CategoryFormValues = z.input<typeof categoryFormSchema>

function valuesOf(category: CategoryView | null, parentId: number): CategoryFormValues {
  return {
    name: category?.name ?? '',
    parentId: category?.parentId ?? parentId,
    owner: category?.owner ?? null,
    sort: category?.sort ?? 0,
  }
}

/** 分类节点新建/改名弹窗（T-7；category §3.3）。 */
export function CategoryNodeModal({
  productId,
  type,
  category,
  parentId,
  parentOptions,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  type: string
  category: CategoryView | null
  parentId: number
  parentOptions: { value: number; label: string }[]
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const editing = category != null
  const { control, handleSubmit, setError, reset } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: valuesOf(category, parentId),
  })

  // 切换新建/编辑对象（或新建挂点）时重置表单（旧 <Form key> 重挂载语义由此等价替代）
  useEffect(() => {
    reset(valuesOf(category, parentId))
  }, [category, parentId, reset])

  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })

  const save = useMutation({
    mutationFn: async (values: CategoryFormValues) => {
      const body = { ...values, type, parentId: values.parentId ?? 0 }
      return editing
        ? patchCategory(category.id, { ...body, lockVersion: category.lockVersion })
        : submitCategory(productId, body)
    },
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
      title={editing ? t('category.action.edit') : t('category.action.create')}
      onCancel={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" loading={save.isPending} onClick={() => void submit()}>
            {t('common.action.submit')}
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="name"
          label={t('category.field.name')}
          maxLength={60}
          aria-label="category-name"
        />
        <SelectField
          control={control}
          name="parentId"
          label={t('category.field.parent')}
          options={[{ value: 0, label: t('category.field.root') }, ...parentOptions]}
          aria-label="category-parent"
        />
        <SelectField
          control={control}
          name="owner"
          label={t('category.field.owner')}
          options={(accounts.data ?? []).map((account) => ({
            value: account.account,
            label: `${account.realName}(${account.account})`,
          }))}
          aria-label="category-owner"
        />
        <NumberField
          control={control}
          name="sort"
          label={t('category.field.sort')}
          min={0}
          aria-label="category-sort"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
