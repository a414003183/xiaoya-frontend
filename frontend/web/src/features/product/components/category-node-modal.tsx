import { useMutation, useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, InputNumber, Modal, Select, Typography, useMessage } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { type CategoryView, fetchAccountOptions, patchCategory, submitCategory } from '../api/product.api'

type CategoryFormValues = { name: string; parentId: number; owner: string | null; sort: number }

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
  const [form] = Form.useForm<CategoryFormValues>()
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const editing = category != null

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
  })

  return (
    <Modal
      open={open}
      title={editing ? t('category.action.edit') : t('category.action.create')}
      onCancel={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" loading={save.isPending} onClick={() => void form.submit()}>
            {t('common.action.submit')}
          </Button>
        </>
      }
    >
      <Form
        form={form}
        key={category?.id ?? `create-${parentId}`}
        layout="vertical"
        initialValues={{
          name: category?.name ?? '',
          parentId: category?.parentId ?? parentId,
          owner: category?.owner ?? null,
          sort: category?.sort ?? 0,
        }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="name"
          label={t('category.field.name')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="category-name" maxLength={60} />
        </Form.Item>
        <Form.Item name="parentId" label={t('category.field.parent')}>
          <Select
            aria-label="category-parent"
            options={[{ value: 0, label: t('category.field.root') }, ...parentOptions]}
          />
        </Form.Item>
        <Form.Item name="owner" label={t('category.field.owner')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            aria-label="category-owner"
            options={(accounts.data ?? []).map((account) => ({
              value: account.account,
              label: `${account.realName}(${account.account})`,
            }))}
          />
        </Form.Item>
        <Form.Item name="sort" label={t('category.field.sort')}>
          <InputNumber aria-label="category-sort" min={0} className="tw:w-full" />
        </Form.Item>
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
