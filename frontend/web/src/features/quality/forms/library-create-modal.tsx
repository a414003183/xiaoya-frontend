import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { SuiteView } from '@zentao/api-client/generated/model/suiteView'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { TextAreaField, TextField } from '../../../shared/form-fields'
import { patchLibrary, submitLibrary } from '../api/quality.api'

/**
 * 用例库创建/编辑共用表单壳（T-7；字段照 quality §3.3：name 1–255 必填、description 可选）。
 * type=library/productId=0 由服务端写入面强制，前端不参与；编辑带 lockVersion（不符 → 40901）。
 */
export const librarySchema = z.object({
  name: z.string().trim().min(1, 'common.message.required'),
  description: z.string().nullish(),
})

/** 表单值 = zod 输入类型（与校验同源）。 */
export type LibraryFormValues = z.input<typeof librarySchema>

function valuesOf(library: SuiteView | null): LibraryFormValues {
  return { name: library?.name ?? '', description: library?.description ?? null }
}

function bodyOf(values: LibraryFormValues): { name: string; description: string | null } {
  return { name: values.name, description: values.description ? values.description : null }
}

export function LibraryFormModal({
  library,
  open,
  onClose,
  onSaved,
}: {
  library?: SuiteView | null
  open: boolean
  onClose: () => void
  onSaved?: ((item: SuiteView) => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = library != null
  const { control, handleSubmit } = useForm<LibraryFormValues>({
    resolver: zodResolver(librarySchema),
    defaultValues: valuesOf(library ?? null),
  })

  const save = useMutation({
    mutationFn: (values: LibraryFormValues) => {
      const body = bodyOf(values)
      return editing ? patchLibrary(library.id, { ...body, lockVersion: library.lockVersion }) : submitLibrary(body)
    },
    onSuccess: (saved) => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listLibraries'] })
      void queryClient.invalidateQueries({ queryKey: ['getLibrary'] })
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
      title={editing ? t('library.action.edit') : t('library.action.create')}
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
          label={t('library.field.name')}
          maxLength={255}
          aria-label="library-name"
        />
        <TextAreaField
          control={control}
          name="description"
          label={t('library.field.description')}
          aria-label="library-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

/** 用例库创建弹窗（T-7；从用例库列表进入）。 */
export function LibraryCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated?: (item: SuiteView) => void
}) {
  return <LibraryFormModal library={null} open={open} onClose={onClose} onSaved={onCreated} />
}
