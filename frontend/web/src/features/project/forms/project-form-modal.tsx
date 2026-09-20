import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, NumberField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchProducts } from '../../product'
import {
  fetchAccountOptions,
  fetchProjectProducts,
  type ProjectView,
  patchProject,
  replaceProjectProductsAction,
  submitProject,
} from '../api/project.api'

/** project §3.1 校验：name 1–90、model 必填、beginDate ≤ endDate、项目必须关联产品（productIds 非空）。 */
export const projectSchema = z
  .object({
    name: z.string().min(1, 'common.message.required').max(90, 'project.message.nameTooLong'),
    code: z.string().max(45, 'project.message.codeTooLong'),
    model: z.enum(['scrum', 'waterfall', 'kanban'], 'project.message.modelRequired'),
    priority: z.number().min(1).max(4),
    parentId: z.number(),
    beginDate: z.string().min(1, 'common.message.required'),
    endDate: z.string().min(1, 'common.message.required'),
    days: z.number().min(0).max(3650),
    budget: z.number().nullable(),
    budgetUnit: z.string(),
    pm: z.string().nullable(),
    po: z.string().nullable(),
    qd: z.string().nullable(),
    rd: z.string().nullable(),
    acl: z.string(),
    whitelist: z.array(z.string()),
    productIds: z.array(z.number()),
    description: z.string(),
    sort: z.number(),
  })
  .refine((values) => values.beginDate <= values.endDate, {
    path: ['endDate'],
    message: 'project.message.dateOrder',
  })
  .refine((values) => values.productIds.length > 0, {
    path: ['productIds'],
    message: 'project.message.productsRequired',
  })
  .refine((values) => values.acl !== 'private' || values.whitelist.length > 0, {
    path: ['whitelist'],
    message: 'project.message.whitelistRequired',
  })

/** 表单值 = zod 输入类型（create/edit 共用，与校验同源）。 */
export type ProjectFormValues = z.input<typeof projectSchema>

function valuesOf(project: ProjectView | null, parentId: number, productIds: number[]): ProjectFormValues {
  return {
    name: project?.name ?? '',
    code: project?.code ?? '',
    model: project?.model ?? 'scrum',
    priority: project?.priority ?? 1,
    parentId: project?.parentId ?? parentId,
    beginDate: project?.beginDate ?? '',
    endDate: project?.endDate ?? '',
    days: project?.days ?? 0,
    budget: project?.budget ?? null,
    budgetUnit: project?.budgetUnit ?? 'CNY',
    pm: project?.pm ?? null,
    po: project?.po ?? null,
    qd: project?.qd ?? null,
    rd: project?.rd ?? null,
    acl: project?.acl ?? 'open',
    whitelist: project?.whitelist ?? [],
    productIds,
    description: project?.description ?? '',
    sort: project?.sort ?? 0,
  }
}

function bodyOf(values: ProjectFormValues): Record<string, unknown> {
  return {
    name: values.name,
    code: values.code === '' ? null : values.code,
    model: values.model,
    priority: values.priority,
    parentId: values.parentId,
    beginDate: values.beginDate,
    endDate: values.endDate,
    days: values.days,
    budget: values.budget,
    budgetUnit: values.budgetUnit,
    pm: values.pm,
    po: values.po,
    qd: values.qd,
    rd: values.rd,
    acl: values.acl,
    whitelist: values.acl === 'private' ? values.whitelist : [],
    description: values.description === '' ? null : values.description,
    sort: values.sort,
  }
}

/**
 * 项目创建/编辑共用抽屉（T-3；project §3.1 + §5）：含关联产品多选——
 * 创建随 ProjectCreateRequest.productIds 一次落库，编辑走 POST /projects/{id}/products 全量替换。
 */
export function ProjectFormModal({
  project,
  defaultParentId = 0,
  open,
  onClose,
  onSaved,
}: {
  project?: ProjectView | null
  defaultParentId?: number
  open: boolean
  onClose: () => void
  onSaved?: (() => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = project != null
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  // 枚举字段选项唯一来源（03 §5）：model/priority/budgetUnit/acl 从 meta 取，前端不留清单。
  const projectMeta = useDomainMeta('project')
  const products = useQuery({ queryKey: ['listProducts', 'form'], queryFn: () => fetchProducts({ limit: 200 }) })
  const linked = useQuery({
    queryKey: ['listProjectProducts', project?.id ?? 0, 'form'],
    queryFn: () => fetchProjectProducts(project?.id ?? 0, { limit: 200 }),
    enabled: editing,
  })
  const { control, handleSubmit, reset } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: valuesOf(project ?? null, defaultParentId, []),
  })

  // 编辑态：关联产品列表到达后回填多选（创建态候选为空由表单自己选）。
  useEffect(() => {
    if (!linked.isSuccess) {
      return
    }
    reset(
      valuesOf(
        project ?? null,
        defaultParentId,
        (linked.data?.items ?? []).map((item) => item.id),
      ),
    )
  }, [linked.isSuccess, linked.data, project, defaultParentId, reset])

  const save = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const body = bodyOf(values)
      if (!editing) {
        return submitProject({ ...body, productIds: values.productIds })
      }
      const saved = await patchProject(project.id, { ...body, lockVersion: project.lockVersion })
      await replaceProjectProductsAction(project.id, values.productIds)
      return saved
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listProjects'] })
      void queryClient.invalidateQueries({ queryKey: ['getProject'] })
      void queryClient.invalidateQueries({ queryKey: ['listProjectProducts'] })
      onSaved?.()
      onClose()
    },
  })
  const submit = handleSubmit((values) => save.mutate(values))

  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))
  const productOptions = (products.data?.items ?? []).map((product) => ({
    value: product.id,
    label: `#${product.id} ${product.name}`,
  }))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('project.action.edit') : t('project.action.createProject')}
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
          label={t('project.field.name')}
          maxLength={90}
          aria-label="project-name"
        />
        <TextField
          control={control}
          name="code"
          label={t('project.field.code')}
          maxLength={45}
          aria-label="project-code"
        />
        <SelectField
          control={control}
          name="model"
          label={t('project.field.model')}
          options={metaOptions(projectMeta.data, 'model', t)}
          aria-label="project-model"
        />
        <SelectField
          control={control}
          name="priority"
          label={t('project.field.priority')}
          options={metaNumberOptions(projectMeta.data, 'priority', t)}
          aria-label="project-priority"
        />
        <DateField
          control={control}
          name="beginDate"
          label={t('project.field.beginDate')}
          aria-label="project-begin-date"
        />
        <DateField control={control} name="endDate" label={t('project.field.endDate')} aria-label="project-end-date" />
        <NumberField
          control={control}
          name="days"
          label={t('project.field.days')}
          min={0}
          max={3650}
          aria-label="project-days"
        />
        <NumberField
          control={control}
          name="budget"
          label={t('project.field.budget')}
          min={0}
          aria-label="project-budget"
        />
        <SelectField
          control={control}
          name="budgetUnit"
          label={t('project.field.budgetUnit')}
          options={metaOptions(projectMeta.data, 'budgetUnit', t)}
          aria-label="project-budget-unit"
        />
        <SelectField
          control={control}
          name="pm"
          label={t('project.field.pm')}
          options={accountOptions}
          aria-label="project-pm"
        />
        <SelectField
          control={control}
          name="po"
          label={t('project.field.po')}
          options={accountOptions}
          aria-label="project-po"
        />
        <SelectField
          control={control}
          name="qd"
          label={t('project.field.qd')}
          options={accountOptions}
          aria-label="project-qd"
        />
        <SelectField
          control={control}
          name="rd"
          label={t('project.field.rd')}
          options={accountOptions}
          aria-label="project-rd"
        />
        <SelectField
          control={control}
          name="acl"
          label={t('project.field.acl')}
          options={metaOptions(projectMeta.data, 'acl', t)}
          aria-label="project-acl"
        />
        <SelectField
          control={control}
          name="whitelist"
          label={t('project.field.whitelist')}
          options={accountOptions}
          multiple
          aria-label="project-whitelist"
        />
        <SelectField
          control={control}
          name="productIds"
          label={t('project.field.products')}
          options={productOptions}
          multiple
          aria-label="project-products"
        />
        <NumberField control={control} name="sort" label={t('common.field.sort')} min={0} aria-label="project-sort" />
        <TextAreaField
          control={control}
          name="description"
          label={t('project.field.description')}
          aria-label="project-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
