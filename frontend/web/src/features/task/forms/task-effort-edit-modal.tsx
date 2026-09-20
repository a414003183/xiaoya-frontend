import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Modal, Popconfirm, Space, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, NumberField, TextAreaField } from '../../../shared/form-fields'
import { deleteEffortAction, type EffortView, patchEffort } from '../api/task.api'

/** effort §3b 校验：workDate ≤ 今天、consumedHours > 0、leftHours ≥ 0。 */
export const effortSchema = z
  .object({
    workDate: z.string().min(1, 'common.message.required'),
    consumedHours: z.number().gt(0, 'effort.message.consumedRequired').max(999.99, 'effort.message.consumedRequired'),
    leftHours: z.number().min(0).max(999.99).nullable(),
    work: z.string().max(255),
  })
  .refine((values) => values.workDate <= new Date().toISOString().slice(0, 10), {
    path: ['workDate'],
    message: 'effort.message.dateFuture',
  })

export type EffortFormValues = z.input<typeof effortSchema>

export function effortValuesOf(effort: EffortView | null): EffortFormValues {
  return {
    workDate: effort?.workDate ?? new Date().toISOString().slice(0, 10),
    consumedHours: effort?.consumedHours ?? 0,
    leftHours: effort?.leftHours ?? null,
    work: effort?.work ?? '',
  }
}

/** 编辑工时（T-11 / task §6 F 范式）：仅 workDate/consumedHours/leftHours/work 可改，删除走软删 + 任务回算。 */
export function TaskEffortEditModal({
  effort,
  open,
  onClose,
}: {
  effort: EffortView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { control, handleSubmit } = useForm<EffortFormValues>({
    resolver: zodResolver(effortSchema),
    defaultValues: effortValuesOf(effort),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['listTaskEfforts'] })
    void queryClient.invalidateQueries({ queryKey: ['getTask'] })
    void queryClient.invalidateQueries({ queryKey: ['listExecutionTasks'] })
  }
  const save = useMutation({
    mutationFn: (values: EffortFormValues) => {
      if (!effort) {
        throw new Error('effort edit modal: no effort')
      }
      return patchEffort(effort.id, {
        workDate: values.workDate,
        consumedHours: values.consumedHours,
        leftHours: values.leftHours,
        work: values.work === '' ? null : values.work,
      })
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      invalidate()
      onClose()
    },
  })
  const remove = useMutation({
    mutationFn: () => deleteEffortAction(effort?.id ?? 0),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      invalidate()
      onClose()
    },
  })
  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      width={480}
      title={t('effort.title.edit')}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Popconfirm title={t('effort.message.deleteHint')} onConfirm={() => remove.mutate()}>
            <Button danger loading={remove.isPending} aria-label="effort-delete">
              {t('effort.action.delete')}
            </Button>
          </Popconfirm>
          <Button type="primary" loading={save.isPending} onClick={() => void submit()}>
            {t('common.action.submit')}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <DateField control={control} name="workDate" label={t('effort.field.workDate')} aria-label="effort-work-date" />
        <NumberField
          control={control}
          name="consumedHours"
          label={t('effort.field.consumed')}
          min={0}
          max={999.99}
          aria-label="effort-consumed"
        />
        <NumberField
          control={control}
          name="leftHours"
          label={t('effort.field.left')}
          min={0}
          max={999.99}
          aria-label="effort-left"
        />
        <TextAreaField control={control} name="work" label={t('effort.field.work')} aria-label="effort-work" />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
