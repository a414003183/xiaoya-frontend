import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, NumberField, TextAreaField } from '../../../shared/form-fields'
import { type EffortView, submitEffort, type TaskView } from '../api/task.api'
import { TaskEffortList } from '../components/task-effort-list'
import { effortValuesOf, TaskEffortEditModal } from './task-effort-edit-modal'

/** effort §3b 登记校验：workDate ≤ 今天、consumedHours > 0（leftHours 传 0 触发任务自动完成）。 */
export const effortRecordSchema = z
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

export type EffortRecordValues = z.input<typeof effortRecordSchema>

/**
 * 登记工时弹窗（T-11 / task §6 F 范式）：登记表单 + 本任务工时流水；
 * account 恒当前账号（不接受代登记），leftHours 传值覆写任务剩余、传 0 自动完成任务。
 */
export function TaskEffortModal({
  task,
  open,
  onClose,
}: {
  task: TaskView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<EffortView | null>(null)
  const { control, handleSubmit, reset } = useForm<EffortRecordValues>({
    resolver: zodResolver(effortRecordSchema),
    defaultValues: effortValuesOf(null),
  })

  const record = useMutation({
    mutationFn: (values: EffortRecordValues) => {
      if (!task) {
        throw new Error('task effort modal: no task')
      }
      return submitEffort(task.id, {
        workDate: values.workDate,
        consumedHours: values.consumedHours,
        leftHours: values.leftHours,
        work: values.work === '' ? null : values.work,
      })
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      reset(effortValuesOf(null))
      void queryClient.invalidateQueries({ queryKey: ['listTaskEfforts'] })
      void queryClient.invalidateQueries({ queryKey: ['getTask'] })
      void queryClient.invalidateQueries({ queryKey: ['listExecutionTasks'] })
      void queryClient.invalidateQueries({ queryKey: ['listTaskActivities'] })
    },
  })
  const submit = handleSubmit((values) => record.mutate(values))

  return (
    <Modal
      open={open}
      width={720}
      title={t('effort.title.record')}
      onCancel={onClose}
      okText={t('effort.action.record')}
      cancelText={t('common.action.close')}
      confirmLoading={record.isPending}
      okButtonProps={{ 'aria-label': 'effort-record' }}
      onOk={() => void submit()}
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
        <Typography.Text type="secondary" className="tw:block tw:-mt-3 tw:mb-3 tw:text-xs">
          {t('effort.message.leftHint')}
        </Typography.Text>
        <TextAreaField control={control} name="work" label={t('effort.field.work')} aria-label="effort-work" />
        {record.error ? (
          <Typography.Paragraph type="danger">
            {errorText(record.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
      </Form>
      <Typography.Title level={5} className="tw:mt-2">
        {t('effort.title.list')}
      </Typography.Title>
      {task ? <TaskEffortList taskId={task.id} onEdit={(effort) => setEditing(effort)} /> : null}
      <TaskEffortEditModal effort={editing} open={editing !== null} onClose={() => setEditing(null)} />
    </Modal>
  )
}
