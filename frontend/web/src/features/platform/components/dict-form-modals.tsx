import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { applyServerFields, NumberField, TextField } from '../../../shared/form-fields'
import {
  createDictItemAction,
  createDictTypeAction,
  type DictDataView,
  type DictTypeView,
  updateDictItemAction,
  updateDictTypeAction,
} from '../api/platform.api'

export type DictTypeFormModalProps = {
  /** 有值 = 编辑（code 只读）；null = 新建。 */
  type: DictTypeView | null
  open: boolean
  onClose: () => void
}

/** 类型守卫（对齐旧 rules）：code 仅新建必填（编辑态只读、无校验），name 恒必填。 */
export function dictTypeSchema(creating: boolean) {
  return z.object({
    code: creating ? z.string().min(1, 'common.message.required') : z.string(),
    name: z.string().min(1, 'common.message.required'),
  })
}

export type DictTypeValues = z.input<ReturnType<typeof dictTypeSchema>>

/** 字典类型新建/编辑（T16）：code 是读取侧的查询键，建后不可改。 */
export function DictTypeFormModal({ type, open, onClose }: DictTypeFormModalProps) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { control, handleSubmit, setError, reset } = useForm<DictTypeValues>({
    resolver: zodResolver(dictTypeSchema(type === null)),
    defaultValues: { code: type?.code ?? '', name: type?.name ?? '' },
  })

  // 切换新建/编辑对象时重置表单（defaultValues 只在首挂载生效）
  useEffect(() => {
    reset({ code: type?.code ?? '', name: type?.name ?? '' })
  }, [type, reset])

  const save = useMutation({
    mutationFn: (values: DictTypeValues) =>
      type === null ? createDictTypeAction(values) : updateDictTypeAction(type.code, { name: values.name }),
    onSuccess: () => {
      message.success(type === null ? t('platform.dict.message.created') : t('platform.dict.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listDictTypes'] })
      onClose()
    },
    // code 撞内置字典名/格式非法/重复：后端只回 42201 + 字段码 → 字段级落点 + 整体提示（T70）
    onError: (error) => {
      applyServerFields(error, setError)
      message.error(errorText(error, t, 'platform.dict.message.invalid'))
    },
  })

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={type === null ? t('platform.dict.action.createType') : t('platform.dict.action.editType')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="code"
          label={t('platform.dict.field.code')}
          maxLength={60}
          placeholder="demo-level"
          disabled={type !== null}
          extra={t('platform.dict.codeHint')}
          aria-label="dict-code"
        />
        <TextField
          control={control}
          name="name"
          label={t('platform.dict.field.name')}
          maxLength={60}
          aria-label="dict-name"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">
            {errorText(save.error, t, 'platform.dict.message.invalid')}
          </Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

export type DictItemFormModalProps = {
  /** 所属类型 code（新建时必填）。 */
  typeCode: string
  /** 有值 = 编辑；null = 新建。 */
  item: DictDataView | null
  open: boolean
  onClose: () => void
}

/** 数据项守卫（对齐旧 rules）：标签/值恒必填，sortNo 无校验（清空即 null 原样上送；同类下值唯一由服务端守卫）。 */
export const dictItemSchema = z.object({
  itemLabel: z.string().min(1, 'common.message.required'),
  itemValue: z.string().min(1, 'common.message.required'),
  sortNo: z.number().nullable(),
})

export type DictItemValues = z.input<typeof dictItemSchema>

/** 数据项新建/编辑（T16）：标签是下拉里显示的字面文案，值是存储值（同类下唯一）。 */
export function DictItemFormModal({ typeCode, item, open, onClose }: DictItemFormModalProps) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { control, handleSubmit, setError, reset } = useForm<DictItemValues>({
    resolver: zodResolver(dictItemSchema),
    defaultValues: { itemLabel: item?.itemLabel ?? '', itemValue: item?.itemValue ?? '', sortNo: item?.sortNo ?? 0 },
  })

  // 切换新建/编辑对象时重置表单（defaultValues 只在首挂载生效）
  useEffect(() => {
    reset({ itemLabel: item?.itemLabel ?? '', itemValue: item?.itemValue ?? '', sortNo: item?.sortNo ?? 0 })
  }, [item, reset])

  const save = useMutation({
    // sortNo 清空为 null 时上送体原样带 null（对齐旧 antd 表单）；action 入参 sortNo?: number 未含 null，断言补平类型差
    mutationFn: (values: DictItemValues) =>
      item === null
        ? createDictItemAction(typeCode, values as Parameters<typeof createDictItemAction>[1])
        : updateDictItemAction(item.id, values as Parameters<typeof updateDictItemAction>[1]),
    onSuccess: () => {
      message.success(item === null ? t('platform.dict.message.created') : t('platform.dict.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listDictItems'] })
      onClose()
    },
    // itemValue 同类下重复：后端只回 42201 + 字段码 → 字段级落点 + 整体提示（T70）
    onError: (error) => {
      applyServerFields(error, setError)
      message.error(errorText(error, t, 'platform.dict.message.invalid'))
    },
  })

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={item === null ? t('platform.dict.action.createItem') : t('platform.dict.action.editItem')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="itemLabel"
          label={t('platform.dict.field.itemLabel')}
          maxLength={120}
          extra={t('platform.dict.labelHint')}
          aria-label="dict-item-label"
        />
        <TextField
          control={control}
          name="itemValue"
          label={t('platform.dict.field.itemValue')}
          maxLength={120}
          aria-label="dict-item-value"
        />
        <NumberField
          control={control}
          name="sortNo"
          label={t('platform.dict.field.sortNo')}
          aria-label="dict-item-sort"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">
            {errorText(save.error, t, 'platform.dict.message.invalid')}
          </Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
