import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, NumberField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchAccountOptions, type ProjectView, patchExecution, submitExecution } from '../api/project.api'
import { EXECUTION_TYPES } from '../model'

/** execution §3.1 校验：name 1–90、type ∈ sprint|stage|kanban、beginDate ≤ endDate、beginDate/endDate 必填。 */
export const executionSchema = z
  .object({
    type: z.enum(['sprint', 'stage', 'kanban'], 'project.message.typeRequired'),
    name: z.string().min(1, 'common.message.required').max(90, 'project.message.nameTooLong'),
    code: z.string().max(45, 'project.message.codeTooLong'),
    beginDate: z.string().min(1, 'common.message.required'),
    endDate: z.string().min(1, 'common.message.required'),
    days: z.number().min(0).max(3650),
    acl: z.string(),
    whitelist: z.array(z.string()),
    description: z.string(),
    sort: z.number(),
  })
  .refine((values) => values.beginDate <= values.endDate, {
    path: ['endDate'],
    message: 'project.message.dateOrder',
  })
  .refine((values) => values.acl !== 'private' || values.whitelist.length > 0, {
    path: ['whitelist'],
    message: 'project.message.whitelistRequired',
  })

/** 表单值 = zod 输入类型（create/edit 共用，与校验同源；type 仅创建时可选）。 */
export type ExecutionFormValues = z.input<typeof executionSchema>

function valuesOf(execution: ProjectView | null): ExecutionFormValues {
  return {
    type: EXECUTION_TYPES.find((item) => item === execution?.type) ?? 'sprint',
    name: execution?.name ?? '',
    code: execution?.code ?? '',
    beginDate: execution?.beginDate ?? '',
    endDate: execution?.endDate ?? '',
    days: execution?.days ?? 0,
    acl: execution?.acl ?? 'open',
    whitelist: execution?.whitelist ?? [],
    description: execution?.description ?? '',
    sort: execution?.sort ?? 0,
  }
}

function bodyOf(values: ExecutionFormValues): Record<string, unknown> {
  return {
    name: values.name,
    code: values.code === '' ? null : values.code,
    beginDate: values.beginDate,
    endDate: values.endDate,
    days: values.days,
    acl: values.acl,
    whitelist: values.acl === 'private' ? values.whitelist : [],
    description: values.description === '' ? null : values.description,
    sort: values.sort,
  }
}

/** 执行创建/编辑共用抽屉（T-3；project §3.1 + §5 POST /projects/{projectId}/executions）。 */
export function ExecutionFormModal({
  projectId,
  execution,
  open,
  onClose,
  onSaved,
}: {
  projectId: number
  execution?: ProjectView | null
  open: boolean
  onClose: () => void
  onSaved?: (() => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = execution != null
  // 枚举字段选项唯一来源（03 §5）：type/acl 从 meta 取；EXECUTION_TYPES 只留作取值收窄。
  const executionMeta = useDomainMeta('execution')
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const { control, handleSubmit } = useForm<ExecutionFormValues>({
    resolver: zodResolver(executionSchema),
    defaultValues: valuesOf(execution ?? null),
  })

  const save = useMutation({
    mutationFn: (values: ExecutionFormValues) =>
      editing
        ? patchExecution(execution.id, { ...bodyOf(values), lockVersion: execution.lockVersion })
        : submitExecution(projectId, { ...bodyOf(values), type: values.type }),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listProjectExecutions'] })
      void queryClient.invalidateQueries({ queryKey: ['getExecution'] })
      void queryClient.invalidateQueries({ queryKey: ['listExecutions'] })
      onSaved?.()
      onClose()
    },
  })
  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('project.action.edit') : t('project.action.createExecution')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        {editing ? null : (
          <SelectField
            control={control}
            name="type"
            label={t('project.field.type')}
            options={metaOptions(executionMeta.data, 'type', t)}
            aria-label="execution-type"
          />
        )}
        <TextField
          control={control}
          name="name"
          label={t('project.field.name')}
          maxLength={90}
          aria-label="execution-name"
        />
        <TextField
          control={control}
          name="code"
          label={t('project.field.code')}
          maxLength={45}
          aria-label="execution-code"
        />
        <DateField
          control={control}
          name="beginDate"
          label={t('project.field.beginDate')}
          aria-label="execution-begin-date"
        />
        <DateField
          control={control}
          name="endDate"
          label={t('project.field.endDate')}
          aria-label="execution-end-date"
        />
        <NumberField
          control={control}
          name="days"
          label={t('project.field.days')}
          min={0}
          max={3650}
          aria-label="execution-days"
        />
        <SelectField
          control={control}
          name="acl"
          label={t('project.field.acl')}
          options={metaOptions(executionMeta.data, 'acl', t)}
          aria-label="execution-acl"
        />
        <SelectField
          control={control}
          name="whitelist"
          label={t('project.field.whitelist')}
          options={(accounts.data ?? []).map((account) => ({
            value: account.account,
            label: `${account.realName}(${account.account})`,
          }))}
          multiple
          aria-label="execution-whitelist"
        />
        <NumberField control={control} name="sort" label={t('common.field.sort')} min={0} aria-label="execution-sort" />
        <TextAreaField
          control={control}
          name="description"
          label={t('project.field.description')}
          aria-label="execution-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
