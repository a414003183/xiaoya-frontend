import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { applyServerFields, TextAreaField, TextField } from '../../../shared/form-fields'
import { createSettingEntryAction, type SettingEntryView, updateSettingEntryAction } from '../api/platform.api'

export type ParamFormModalProps = {
  /** 有值 = 编辑（键只读、值可改）；null = 新建（键可填）。 */
  entry: SettingEntryView | null
  open: boolean
  onClose: () => void
}

type ParamForm = { key: string; value: string }

/**
 * 参数新建/编辑（T15）。值是 **JSON 文本**（字符串要带引号）——服务端按 JSON 解析，
 * 非法值 422 拒绝，故这里只做「必填」，格式对不对由服务端说了算（前端不重复实现 JSON 校验）。
 * key 仅新建必填（编辑态键只读，无校验）。
 */
const paramFormSchema = (creating: boolean) =>
  z.object({
    key: creating ? z.string().min(1, 'common.message.required') : z.string(),
    value: z.string().min(1, 'common.message.required'),
  })

export function ParamFormModal({ entry, open, onClose }: ParamFormModalProps) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { control, handleSubmit, setError, reset } = useForm<ParamForm>({
    resolver: zodResolver(paramFormSchema(entry === null)),
    defaultValues: { key: entry?.key ?? '', value: entry?.value ?? '' },
  })

  // 切换新建/编辑对象时重置表单（defaultValues 只在首挂载生效）
  useEffect(() => {
    reset({ key: entry?.key ?? '', value: entry?.value ?? '' })
  }, [entry, reset])

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['listSettingEntries'] })
  }

  const save = useMutation({
    mutationFn: (values: ParamForm) =>
      entry === null ? createSettingEntryAction(values) : updateSettingEntryAction(entry.key, { value: values.value }),
    onSuccess: () => {
      message.success(entry === null ? t('platform.param.message.created') : t('platform.param.message.saved'))
      invalidate()
      onClose()
    },
    // 键重复/格式非法/值不是 JSON：后端只回 42201 + 字段码 → 字段级落点 + 整体提示（T70）
    onError: (error) => {
      applyServerFields(error, setError, { invalidJson: 'platform.param.message.invalid' })
      message.error(errorText(error, t, 'platform.param.message.invalid'))
    },
  })

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={entry === null ? t('platform.param.action.create') : t('platform.param.action.edit')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="key"
          label={t('platform.param.field.key')}
          maxLength={121}
          placeholder="<domain>.<key>"
          disabled={entry !== null}
          aria-label="param-key"
        />
        <TextAreaField
          control={control}
          name="value"
          label={t('platform.param.field.value')}
          rows={4}
          maxLength={8000}
          extra={t('platform.param.valueHint')}
          aria-label="param-value"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">
            {errorText(save.error, t, 'platform.param.message.invalid')}
          </Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
