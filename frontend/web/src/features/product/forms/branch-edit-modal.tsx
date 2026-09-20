import { useMutation } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Input, InputNumber, Modal, Typography, useMessage } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { type BranchView, patchBranch, submitBranch } from '../api/product.api'

export type BranchFormValues = { name: string; description: string | null; sort: number }

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
  const [form] = Form.useForm<BranchFormValues>()
  const editing = branch != null

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
  })

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('branch.action.edit') : t('branch.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        key={branch?.id ?? 'create'}
        layout="vertical"
        initialValues={{
          name: branch?.name ?? '',
          description: branch?.description ?? null,
          sort: branch?.sort ?? 0,
        }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="name"
          label={t('branch.field.name')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="branch-name" maxLength={255} />
        </Form.Item>
        <Form.Item name="sort" label={t('branch.field.sort')}>
          <InputNumber aria-label="branch-sort" min={0} className="tw:w-full" />
        </Form.Item>
        <Form.Item name="description" label={t('branch.field.description')}>
          <Input.TextArea aria-label="branch-description" rows={3} maxLength={255} />
        </Form.Item>
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
