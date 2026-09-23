import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { applyServerFields, DateField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { fetchBranches, fetchPlans, type PlanView, patchPlan, submitPlan } from '../api/product.api'
import { parentPlanOptions } from '../model'

export const planFormSchema = z.object({
  title: z.string().min(1, 'common.message.required'),
  parentId: z.number({ error: 'common.message.required' }),
  branchId: z.number({ error: 'common.message.required' }),
  beginDate: z.string().nullable(),
  endDate: z.string().nullable(),
  description: z.string().nullable(),
})

export type PlanFormValues = z.input<typeof planFormSchema>

function valuesOf(plan: PlanView | null): PlanFormValues {
  return {
    title: plan?.title ?? '',
    parentId: plan?.parentId ?? 0,
    branchId: plan?.branchId ?? 0,
    beginDate: plan?.beginDate ?? null,
    endDate: plan?.endDate ?? null,
    description: plan?.description ?? null,
  }
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
  const editing = plan != null
  const { control, handleSubmit, setError, reset } = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: valuesOf(plan ?? null),
  })

  // 切换新建/编辑对象时重置表单（defaultValues 只在首挂载生效；旧 <Form key> 重挂载语义由此等价替代）
  useEffect(() => {
    reset(valuesOf(plan ?? null))
  }, [plan, reset])

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
    onError: (error) => applyServerFields(error, setError),
  })

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('plan.action.edit') : t('plan.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="title"
          label={t('plan.field.title')}
          maxLength={90}
          aria-label="plan-title"
        />
        <SelectField
          control={control}
          name="parentId"
          label={t('plan.field.parent')}
          options={[
            { value: 0, label: t('plan.field.parentNone') },
            ...parentPlanOptions(plans.data?.items ?? [], plan?.id).map((item) => ({
              value: item.id,
              label: item.title,
            })),
          ]}
          aria-label="plan-parent"
        />
        <SelectField
          control={control}
          name="branchId"
          label={t('plan.field.branch')}
          options={[
            { value: 0, label: t('common.field.none') },
            ...(branches.data?.items ?? []).map((branch) => ({ value: branch.id, label: branch.name })),
          ]}
          aria-label="plan-branch"
        />
        <DateField control={control} name="beginDate" label={t('plan.field.beginDate')} aria-label="plan-begin-date" />
        <DateField control={control} name="endDate" label={t('plan.field.endDate')} aria-label="plan-end-date" />
        <TextAreaField
          control={control}
          name="description"
          label={t('plan.field.description')}
          rows={3}
          aria-label="plan-description"
        />
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
