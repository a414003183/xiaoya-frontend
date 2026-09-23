import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { applyServerFields, NumberField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchAccountOptions, type ProductView, patchProduct, submitProduct } from '../api/product.api'

export const productFormSchema = z
  .object({
    name: z.string().min(1, 'common.message.required'),
    code: z.string().nullable(),
    type: z.string({ error: 'common.message.required' }),
    acl: z.string({ error: 'common.message.required' }),
    whitelist: z.array(z.string()),
    po: z.string().nullable(),
    qd: z.string().nullable(),
    rd: z.string().nullable(),
    description: z.string().nullable(),
    sort: z.number().nullable(),
  })
  // acl=custom 联动 whitelist 必填（旧 rules 的条件 required；报错落点 whitelist）
  .superRefine((values, ctx) => {
    if (values.acl === 'custom' && values.whitelist.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['whitelist'], message: 'product.message.whitelistRequired' })
    }
  })

/** 产品表单值（create/edit 共用；null 而非 undefined，规避 exactOptionalPropertyTypes 噪声）。 */
export type ProductFormValues = z.input<typeof productFormSchema>

function valuesOf(product: ProductView | null): ProductFormValues {
  return {
    name: product?.name ?? '',
    code: product?.code ?? null,
    type: product?.type ?? 'normal',
    acl: product?.acl ?? 'public',
    whitelist: product?.whitelist ?? [],
    po: product?.po ?? null,
    qd: product?.qd ?? null,
    rd: product?.rd ?? null,
    description: product?.description ?? null,
    sort: product?.sort ?? 0,
  }
}

/** 产品创建/编辑共用表单壳（acl=custom 联动 whitelist 必填，product §3.1）。 */
export function ProductFormModal({
  open,
  onClose,
  product,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  product?: ProductView | null
  onSaved?: ((product: ProductView) => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = product != null
  const { control, handleSubmit, setError, reset } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: valuesOf(product ?? null),
  })

  // 切换新建/编辑对象时重置表单（defaultValues 只在首挂载生效；旧 <Form key> 重挂载语义由此等价替代）
  useEffect(() => {
    reset(valuesOf(product ?? null))
  }, [product, reset])

  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  // 枚举字段选项唯一来源（03 §5）：type/acl 从 meta 取，前端不留清单。
  const productMeta = useDomainMeta('product')

  const save = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const body = {
        ...values,
        whitelist: values.acl === 'custom' ? values.whitelist : [],
      }
      return editing ? patchProduct(product.id, { ...body, lockVersion: product.lockVersion }) : submitProduct(body)
    },
    onSuccess: (saved) => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listProducts'] })
      void queryClient.invalidateQueries({ queryKey: ['getProduct'] })
      onSaved?.(saved)
      onClose()
    },
    onError: (error) => applyServerFields(error, setError),
  })

  const submit = handleSubmit((values) => save.mutate(values))

  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))

  const acl = useWatch({ control, name: 'acl' })

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('product.action.edit') : t('product.action.create')}
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
          label={t('product.field.name')}
          maxLength={90}
          aria-label="product-name"
        />
        <TextField
          control={control}
          name="code"
          label={t('product.field.code')}
          maxLength={45}
          aria-label="product-code"
        />
        <SelectField
          control={control}
          name="type"
          label={t('product.field.type')}
          options={metaOptions(productMeta.data, 'type', t)}
          aria-label="product-type"
        />
        <SelectField
          control={control}
          name="acl"
          label={t('product.field.acl')}
          options={metaOptions(productMeta.data, 'acl', t)}
          aria-label="product-acl"
        />
        {acl === 'custom' ? (
          <SelectField
            control={control}
            name="whitelist"
            label={t('product.field.whitelist')}
            options={accountOptions}
            multiple
            aria-label="product-whitelist"
          />
        ) : null}
        <SelectField
          control={control}
          name="po"
          label={t('product.field.po')}
          options={accountOptions}
          aria-label="product-po"
        />
        <SelectField
          control={control}
          name="qd"
          label={t('product.field.qd')}
          options={accountOptions}
          aria-label="product-qd"
        />
        <SelectField
          control={control}
          name="rd"
          label={t('product.field.rd')}
          options={accountOptions}
          aria-label="product-rd"
        />
        <NumberField control={control} name="sort" label={t('product.field.sort')} min={0} aria-label="product-sort" />
        <TextAreaField
          control={control}
          name="description"
          label={t('product.field.description')}
          rows={4}
          aria-label="product-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

/** 产品创建弹窗（T-3）。 */
export function ProductCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated?: (product: ProductView) => void
}) {
  return <ProductFormModal open={open} onClose={onClose} product={null} onSaved={onCreated} />
}
