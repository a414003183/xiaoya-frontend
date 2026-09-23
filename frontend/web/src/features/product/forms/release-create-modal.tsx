import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Switch, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import {
  applyServerFields,
  DateField,
  errorProps,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../shared/form-fields'
import {
  fetchAccountOptions,
  fetchBranches,
  fetchBuilds,
  patchRelease,
  type ReleaseView,
  submitRelease,
} from '../api/product.api'
import { buildsOfBranch } from '../model'

export const releaseFormSchema = z.object({
  name: z.string().min(1, 'common.message.required'),
  branchId: z.number({ error: 'common.message.required' }),
  buildId: z.number().nullable(),
  releaseDate: z.string().min(1, 'common.message.required'),
  publishedAt: z.string().nullable(),
  isMilestone: z.boolean(),
  notifyAccounts: z.array(z.string()),
  description: z.string().nullable(),
})

export type ReleaseFormValues = z.input<typeof releaseFormSchema>

function valuesOf(release: ReleaseView | null): ReleaseFormValues {
  return {
    name: release?.name ?? '',
    branchId: release?.branchId ?? 0,
    buildId: release?.buildId ?? null,
    releaseDate: release?.releaseDate ?? '',
    publishedAt: release?.publishedAt ?? null,
    isMilestone: release?.isMilestone ?? false,
    notifyAccounts: release?.notifyAccounts ?? [],
    description: release?.description ?? null,
  }
}

/** 发布创建/编辑共用表单壳（T-10；buildId 选择器按 branchId 联动）。 */
export function ReleaseFormModal({
  productId,
  release,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  release?: ReleaseView | null
  open: boolean
  onClose: () => void
  onSaved?: (() => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = release != null
  const { control, handleSubmit, setError, reset } = useForm<ReleaseFormValues>({
    resolver: zodResolver(releaseFormSchema),
    defaultValues: valuesOf(release ?? null),
  })

  // 切换新建/编辑对象时重置表单（defaultValues 只在首挂载生效；旧 <Form key> 重挂载语义由此等价替代）
  useEffect(() => {
    reset(valuesOf(release ?? null))
  }, [release, reset])

  const branches = useQuery({
    queryKey: ['listBranches', productId, 'form'],
    queryFn: () => fetchBranches(productId, { limit: 200 }),
  })
  const builds = useQuery({
    queryKey: ['listBuilds', productId, 'form'],
    queryFn: () => fetchBuilds(productId, { limit: 200 }),
  })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })

  const save = useMutation({
    mutationFn: async (values: ReleaseFormValues) =>
      editing
        ? patchRelease(release.id, { ...values, lockVersion: release.lockVersion })
        : submitRelease(productId, values),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listReleases'] })
      void queryClient.invalidateQueries({ queryKey: ['getRelease'] })
      onSaved?.()
      onClose()
    },
    onError: (error) => applyServerFields(error, setError),
  })

  const submit = handleSubmit((values) => save.mutate(values))

  const branchOptions = (branches.data?.items ?? []).map((branch) => ({ value: branch.id, label: branch.name }))
  // buildId 选项按 branchId 联动（旧 shouldUpdate + getFieldValue 的等价替代）
  const branchId = useWatch({ control, name: 'branchId' })

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('release.action.edit') : t('release.action.create')}
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
          label={t('release.field.name')}
          maxLength={90}
          aria-label="release-name"
        />
        <SelectField
          control={control}
          name="branchId"
          label={t('release.field.branch')}
          options={[{ value: 0, label: t('common.field.none') }, ...branchOptions]}
          aria-label="release-branch"
        />
        <SelectField
          control={control}
          name="buildId"
          label={t('release.field.build')}
          options={buildsOfBranch(builds.data?.items ?? [], branchId ?? 0).map((build) => ({
            value: build.id,
            label: build.name,
          }))}
          aria-label="release-build"
        />
        <DateField
          control={control}
          name="releaseDate"
          label={t('release.field.releaseDate')}
          aria-label="release-date"
        />
        <DateField
          control={control}
          name="publishedAt"
          label={t('release.field.publishedAt')}
          aria-label="release-published-at"
        />
        <Controller
          control={control}
          name="isMilestone"
          render={({ field, fieldState }) => (
            <Form.Item label={t('release.field.isMilestone')} {...errorProps(fieldState.error, t)}>
              <Switch
                aria-label="release-milestone"
                checked={field.value}
                onChange={(checked) => field.onChange(checked)}
              />
            </Form.Item>
          )}
        />
        <SelectField
          control={control}
          name="notifyAccounts"
          label={t('release.field.notify')}
          options={(accounts.data ?? []).map((account) => ({
            value: account.account,
            label: `${account.realName}(${account.account})`,
          }))}
          multiple
          aria-label="release-notify"
        />
        <TextAreaField
          control={control}
          name="description"
          label={t('release.field.description')}
          rows={4}
          aria-label="release-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

/** 发布创建弹窗（T-10）；release 传入时为编辑同一壳。 */
export function ReleaseCreateModal({
  productId,
  release,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  release?: ReleaseView | null
  open: boolean
  onClose: () => void
  onSaved?: (() => void) | undefined
}) {
  return (
    <ReleaseFormModal
      productId={productId}
      release={release ?? null}
      open={open}
      onClose={onClose}
      {...(onSaved ? { onSaved } : {})}
    />
  )
}
