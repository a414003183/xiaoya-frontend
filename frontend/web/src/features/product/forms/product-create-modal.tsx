import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Input, InputNumber, Modal, Select, Typography, useMessage } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchAccountOptions, type ProductView, patchProduct, submitProduct } from '../api/product.api'

/** 产品表单值（create/edit 共用；null 而非 undefined，规避 exactOptionalPropertyTypes 噪声）。 */
export type ProductFormValues = {
  name: string
  code: string | null
  type: string
  acl: string
  whitelist: string[]
  po: string | null
  qd: string | null
  rd: string | null
  description: string | null
  sort: number
}

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
  const [form] = Form.useForm<ProductFormValues>()
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const editing = product != null
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
  })

  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('product.action.edit') : t('product.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        key={product?.id ?? 'create'}
        layout="vertical"
        initialValues={valuesOf(product ?? null)}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="name"
          label={t('product.field.name')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="product-name" maxLength={90} />
        </Form.Item>
        <Form.Item name="code" label={t('product.field.code')}>
          <Input aria-label="product-code" maxLength={45} />
        </Form.Item>
        <Form.Item name="type" label={t('product.field.type')}>
          <Select aria-label="product-type" options={metaOptions(productMeta.data, 'type', t)} />
        </Form.Item>
        <Form.Item name="acl" label={t('product.field.acl')}>
          <Select aria-label="product-acl" options={metaOptions(productMeta.data, 'acl', t)} />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(prev: ProductFormValues, next: ProductFormValues) => prev.acl !== next.acl}>
          {({ getFieldValue }) =>
            getFieldValue('acl') === 'custom' ? (
              <Form.Item
                name="whitelist"
                label={t('product.field.whitelist')}
                rules={[{ required: true, message: t('product.message.whitelistRequired') }]}
              >
                <Select
                  mode="multiple"
                  allowClear
                  aria-label="product-whitelist"
                  optionFilterProp="label"
                  options={accountOptions}
                />
              </Form.Item>
            ) : null
          }
        </Form.Item>
        <Form.Item name="po" label={t('product.field.po')}>
          <Select allowClear showSearch optionFilterProp="label" aria-label="product-po" options={accountOptions} />
        </Form.Item>
        <Form.Item name="qd" label={t('product.field.qd')}>
          <Select allowClear showSearch optionFilterProp="label" aria-label="product-qd" options={accountOptions} />
        </Form.Item>
        <Form.Item name="rd" label={t('product.field.rd')}>
          <Select allowClear showSearch optionFilterProp="label" aria-label="product-rd" options={accountOptions} />
        </Form.Item>
        <Form.Item name="sort" label={t('product.field.sort')}>
          <InputNumber aria-label="product-sort" min={0} className="tw:w-full" />
        </Form.Item>
        <Form.Item name="description" label={t('product.field.description')}>
          <Input.TextArea aria-label="product-description" rows={4} />
        </Form.Item>
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
