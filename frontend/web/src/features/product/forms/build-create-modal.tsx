import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { applyServerFields, DateField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { type BuildView, fetchAccountOptions, fetchBranches, patchBuild, submitBuild } from '../api/product.api'

export const buildFormSchema = z.object({
  name: z.string().min(1, 'common.message.required'),
  branchId: z.number({ error: 'common.message.required' }),
  buildDate: z.string(),
  builder: z.string().nullable(),
  scmPath: z.string().nullable(),
  filePath: z.string().nullable(),
  description: z.string().nullable(),
})

export type BuildFormValues = z.input<typeof buildFormSchema>

function valuesOf(build: BuildView | null): BuildFormValues {
  return {
    name: build?.name ?? '',
    branchId: build?.branchId ?? 0,
    buildDate: build?.buildDate ?? '',
    builder: build?.builder ?? null,
    scmPath: build?.scmPath ?? null,
    filePath: build?.filePath ?? null,
    description: build?.description ?? null,
  }
}

/** 构建创建/编辑共用表单壳（T-10；build §3.6：builder 必填、buildDate 默认当天由后端落）。 */
export function BuildFormModal({
  productId,
  build,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  build?: BuildView | null
  open: boolean
  onClose: () => void
  onSaved?: (() => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = build != null
  const { control, handleSubmit, setError, reset } = useForm<BuildFormValues>({
    resolver: zodResolver(buildFormSchema),
    defaultValues: valuesOf(build ?? null),
  })

  // 切换新建/编辑对象时重置表单（defaultValues 只在首挂载生效；旧 <Form key> 重挂载语义由此等价替代）
  useEffect(() => {
    reset(valuesOf(build ?? null))
  }, [build, reset])

  const branches = useQuery({
    queryKey: ['listBranches', productId, 'form'],
    queryFn: () => fetchBranches(productId, { limit: 200 }),
  })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })

  const save = useMutation({
    mutationFn: async (values: BuildFormValues) =>
      editing ? patchBuild(build.id, { ...values, lockVersion: build.lockVersion }) : submitBuild(productId, values),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listBuilds'] })
      void queryClient.invalidateQueries({ queryKey: ['getBuild'] })
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
      title={editing ? t('build.action.edit') : t('build.action.create')}
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
          label={t('build.field.name')}
          maxLength={150}
          aria-label="build-name"
        />
        <SelectField
          control={control}
          name="branchId"
          label={t('build.field.branch')}
          options={[
            { value: 0, label: t('common.field.none') },
            ...(branches.data?.items ?? []).map((branch) => ({ value: branch.id, label: branch.name })),
          ]}
          aria-label="build-branch"
        />
        <DateField control={control} name="buildDate" label={t('build.field.buildDate')} aria-label="build-date" />
        <SelectField
          control={control}
          name="builder"
          label={t('build.field.builder')}
          options={(accounts.data ?? []).map((account) => ({
            value: account.account,
            label: `${account.realName}(${account.account})`,
          }))}
          aria-label="build-builder"
        />
        <TextField
          control={control}
          name="scmPath"
          label={t('build.field.scmPath')}
          maxLength={255}
          aria-label="build-scm-path"
        />
        <TextField
          control={control}
          name="filePath"
          label={t('build.field.filePath')}
          maxLength={255}
          aria-label="build-file-path"
        />
        <TextAreaField
          control={control}
          name="description"
          label={t('build.field.description')}
          rows={3}
          aria-label="build-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

/** 构建创建弹窗（T-10）；build 传入时为编辑同一壳。 */
export function BuildCreateModal({
  productId,
  build,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  build?: BuildView | null
  open: boolean
  onClose: () => void
  onSaved?: (() => void) | undefined
}) {
  return (
    <BuildFormModal
      productId={productId}
      build={build ?? null}
      open={open}
      onClose={onClose}
      {...(onSaved ? { onSaved } : {})}
    />
  )
}
