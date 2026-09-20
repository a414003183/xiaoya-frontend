import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, NumberField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchAccountOptions, type ProjectView, patchProgram, submitProgram } from '../api/project.api'

/** 项目集表单值（create/edit 共用；'' = 未填，提交时转 null）。 */
/** program §3.1 校验：name 1–90 必填、code ≤45、beginDate ≤ endDate、acl=private 需白名单。 */
export const programSchema = z
  .object({
    name: z.string().min(1, 'common.message.required').max(90, 'project.message.nameTooLong'),
    code: z.string().max(45, 'project.message.codeTooLong'),
    beginDate: z.string(),
    endDate: z.string(),
    budget: z.number().nullable(),
    budgetUnit: z.string(),
    pm: z.string().nullable(),
    acl: z.string(),
    whitelist: z.array(z.string()),
    description: z.string(),
    sort: z.number(),
  })
  .refine((values) => values.beginDate === '' || values.endDate === '' || values.beginDate <= values.endDate, {
    path: ['endDate'],
    message: 'project.message.dateOrder',
  })
  .refine((values) => values.acl !== 'private' || values.whitelist.length > 0, {
    path: ['whitelist'],
    message: 'project.message.whitelistRequired',
  })

/** 表单值 = zod 输入类型（与校验同源，避免手写类型漂移）。 */
export type ProgramFormValues = z.input<typeof programSchema>

function valuesOf(program: ProjectView | null): ProgramFormValues {
  return {
    name: program?.name ?? '',
    code: program?.code ?? '',
    beginDate: program?.beginDate ?? '',
    endDate: program?.endDate ?? '',
    budget: program?.budget ?? null,
    budgetUnit: program?.budgetUnit ?? 'CNY',
    pm: program?.pm ?? null,
    acl: program?.acl ?? 'open',
    whitelist: program?.whitelist ?? [],
    description: program?.description ?? '',
    sort: program?.sort ?? 0,
  }
}

function bodyOf(values: ProgramFormValues): Record<string, unknown> {
  return {
    name: values.name,
    code: values.code === '' ? null : values.code,
    beginDate: values.beginDate === '' ? null : values.beginDate,
    endDate: values.endDate === '' ? null : values.endDate,
    budget: values.budget,
    budgetUnit: values.budgetUnit,
    pm: values.pm,
    acl: values.acl,
    whitelist: values.acl === 'private' ? values.whitelist : [],
    description: values.description === '' ? null : values.description,
    sort: values.sort,
  }
}

/** 项目集创建/编辑共用抽屉（T-3；project §3.1 字段表）。 */
export function ProgramFormModal({
  program,
  parentId,
  open,
  onClose,
  onSaved,
}: {
  program?: ProjectView | null
  parentId?: number
  open: boolean
  onClose: () => void
  onSaved?: (() => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const editing = program != null
  // 枚举字段选项唯一来源（03 §5）：budgetUnit/acl 从 meta 取（acl 排除自指的 program）。
  const programMeta = useDomainMeta('program')
  const { control, handleSubmit } = useForm<ProgramFormValues>({
    resolver: zodResolver(programSchema),
    defaultValues: valuesOf(program ?? null),
  })

  const save = useMutation({
    mutationFn: (values: ProgramFormValues) => {
      const body = {
        ...bodyOf(values),
        ...(editing ? { lockVersion: program.lockVersion } : { parentId: parentId ?? 0 }),
      }
      return editing ? patchProgram(program.id, body) : submitProgram(body)
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listPrograms'] })
      void queryClient.invalidateQueries({ queryKey: ['getProgram'] })
      void queryClient.invalidateQueries({ queryKey: ['listSubPrograms'] })
      onSaved?.()
      onClose()
    },
  })

  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))
  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('project.action.edit') : t('project.action.createProgram')}
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
          aria-label="program-name"
        />
        <TextField
          control={control}
          name="code"
          label={t('project.field.code')}
          maxLength={45}
          aria-label="program-code"
        />
        <SelectField
          control={control}
          name="pm"
          label={t('project.field.pm')}
          options={accountOptions}
          aria-label="program-pm"
        />
        <DateField
          control={control}
          name="beginDate"
          label={t('project.field.beginDate')}
          aria-label="program-begin-date"
        />
        <DateField control={control} name="endDate" label={t('project.field.endDate')} aria-label="program-end-date" />
        <NumberField
          control={control}
          name="budget"
          label={t('project.field.budget')}
          min={0}
          aria-label="program-budget"
        />
        <SelectField
          control={control}
          name="budgetUnit"
          label={t('project.field.budgetUnit')}
          options={metaOptions(programMeta.data, 'budgetUnit', t)}
          aria-label="program-budget-unit"
        />
        <SelectField
          control={control}
          name="acl"
          label={t('project.field.acl')}
          options={metaOptions(programMeta.data, 'acl', t).filter((option) => option.value !== 'program')}
          aria-label="program-acl"
        />
        <SelectField
          control={control}
          name="whitelist"
          label={t('project.field.whitelist')}
          options={accountOptions}
          multiple
          aria-label="program-whitelist"
        />
        <NumberField control={control} name="sort" label={t('common.field.sort')} min={0} aria-label="program-sort" />
        <TextAreaField
          control={control}
          name="description"
          label={t('project.field.description')}
          aria-label="program-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
