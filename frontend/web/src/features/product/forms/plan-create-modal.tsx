import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Input, Modal, Select, Typography, useMessage } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { fetchBranches, fetchPlans, type PlanView, patchPlan, submitPlan } from '../api/product.api'
import { parentPlanOptions } from '../model'

export type PlanFormValues = {
  title: string
  parentId: number
  branchId: number
  beginDate: string | null
  endDate: string | null
  description: string | null
}

/** 计划创建/编辑共用表单壳（T-10；plan §3.4：parentId 选项 = 同产品一级计划、父子仅两级）。 */
export function PlanFormModal({
  productId,
  plan,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  plan?: PlanView | null
  open: boolean
  onClose: () => void
  onSaved?: (() => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<PlanFormValues>()
  const editing = plan != null

  const plans = useQuery({
    queryKey: ['listPlans', productId, 'form'],
    queryFn: () => fetchPlans(productId, { limit: 200 }),
  })
  const branches = useQuery({
    queryKey: ['listBranches', productId, 'form'],
    queryFn: () => fetchBranches(productId, { limit: 200 }),
  })

  const save = useMutation({
    mutationFn: async (values: PlanFormValues) =>
      editing ? patchPlan(plan.id, { ...values, lockVersion: plan.lockVersion }) : submitPlan(productId, values),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listPlans'] })
      void queryClient.invalidateQueries({ queryKey: ['getPlan'] })
      onSaved?.()
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('plan.action.edit') : t('plan.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        key={plan?.id ?? 'create'}
        layout="vertical"
        initialValues={{
          title: plan?.title ?? '',
          parentId: plan?.parentId ?? 0,
          branchId: plan?.branchId ?? 0,
          beginDate: plan?.beginDate ?? null,
          endDate: plan?.endDate ?? null,
          description: plan?.description ?? null,
        }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="title"
          label={t('plan.field.title')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="plan-title" maxLength={90} />
        </Form.Item>
        <Form.Item name="parentId" label={t('plan.field.parent')}>
          <Select
            aria-label="plan-parent"
            options={[
              { value: 0, label: t('plan.field.parentNone') },
              ...parentPlanOptions(plans.data?.items ?? [], plan?.id).map((item) => ({
                value: item.id,
                label: item.title,
              })),
            ]}
          />
        </Form.Item>
        <Form.Item name="branchId" label={t('plan.field.branch')}>
          <Select
            aria-label="plan-branch"
            options={[
              { value: 0, label: t('common.field.none') },
              ...(branches.data?.items ?? []).map((branch) => ({ value: branch.id, label: branch.name })),
            ]}
          />
        </Form.Item>
        <Form.Item name="beginDate" label={t('plan.field.beginDate')}>
          <Input aria-label="plan-begin-date" placeholder="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item name="endDate" label={t('plan.field.endDate')}>
          <Input aria-label="plan-end-date" placeholder="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item name="description" label={t('plan.field.description')}>
          <Input.TextArea aria-label="plan-description" rows={3} />
        </Form.Item>
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

/** 计划创建弹窗（T-10）；plan 传入时为编辑同一壳。 */
export function PlanCreateModal({
  productId,
  plan,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  plan?: PlanView | null
  open: boolean
  onClose: () => void
  onSaved?: (() => void) | undefined
}) {
  return (
    <PlanFormModal
      productId={productId}
      plan={plan ?? null}
      open={open}
      onClose={onClose}
      {...(onSaved ? { onSaved } : {})}
    />
  )
}
