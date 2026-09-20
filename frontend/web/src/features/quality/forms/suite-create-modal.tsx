import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { SuiteView } from '@zentao/api-client/generated/model/suiteView'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { NumberField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { patchSuite, submitSuite } from '../api/quality.api'
import { SUITE_TYPES } from '../model'

/**
 * 套件创建/编辑共用表单壳（T-7；字段照 quality §3.3：name 1–255 必填、type ∈ public|private、sort ≥ 0）。
 * 名称长度由输入 maxLength 兜住，编辑带 lockVersion（不符 → 40901）。
 */
export const suiteSchema = z.object({
  name: z.string().trim().min(1, 'common.message.required'),
  type: z.enum(SUITE_TYPES).nullish(),
  sort: z.number().min(0).nullish(),
  description: z.string().nullish(),
})

/** 表单值 = zod 输入类型（与校验同源）。 */
export type SuiteFormValues = z.input<typeof suiteSchema>

function valuesOf(suite: SuiteView | null): SuiteFormValues {
  return {
    name: suite?.name ?? '',
    type: suite?.type === 'private' ? 'private' : 'public',
    sort: suite?.sort ?? 0,
    description: suite?.description ?? null,
  }
}

function bodyOf(values: SuiteFormValues): Record<string, unknown> {
  return {
    name: values.name,
    type: values.type ?? 'public',
    sort: values.sort ?? 0,
    description: values.description ? values.description : null,
  }
}

export function SuiteFormModal({
  productId,
  suite,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  suite?: SuiteView | null
  open: boolean
  onClose: () => void
  onSaved?: ((item: SuiteView) => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = suite != null
  // type 选项唯一来源（03 §5）：从 meta 取；SUITE_TYPES 只留作 zod 校验的编译期字面量联合。
  const suiteMeta = useDomainMeta('suite')
  const { control, handleSubmit } = useForm<SuiteFormValues>({
    resolver: zodResolver(suiteSchema),
    defaultValues: valuesOf(suite ?? null),
  })

  const save = useMutation({
    mutationFn: (values: SuiteFormValues) => {
      const body = { ...bodyOf(values), ...(editing ? { lockVersion: suite.lockVersion } : {}) }
      return editing ? patchSuite(suite.id, body) : submitSuite(productId, body)
    },
    onSuccess: (saved) => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listSuites'] })
      void queryClient.invalidateQueries({ queryKey: ['getSuite'] })
      if (saved) {
        onSaved?.(saved)
      }
      onClose()
    },
  })

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('suite.action.edit') : t('suite.action.create')}
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
          label={t('suite.field.name')}
          maxLength={255}
          aria-label="suite-name"
        />
        <SelectField
          control={control}
          name="type"
          label={t('suite.field.type')}
          options={metaOptions(suiteMeta.data, 'type', t)}
          aria-label="suite-type"
        />
        <NumberField control={control} name="sort" label={t('suite.field.sort')} min={0} aria-label="suite-sort" />
        <TextAreaField
          control={control}
          name="description"
          label={t('suite.field.description')}
          aria-label="suite-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

/** 套件创建弹窗（T-7；从产品套件列表进入）。 */
export function SuiteCreateModal({
  productId,
  open,
  onClose,
  onCreated,
}: {
  productId: number
  open: boolean
  onClose: () => void
  onCreated?: (item: SuiteView) => void
}) {
  return <SuiteFormModal productId={productId} suite={null} open={open} onClose={onClose} onSaved={onCreated} />
}
