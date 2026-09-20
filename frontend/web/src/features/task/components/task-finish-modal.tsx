import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { NumberField, TextAreaField } from '../../../shared/form-fields'
import { runTaskAction, TASK_QUERY_ROOTS, type TaskView } from '../api/task.api'

/**
 * finish 守卫（task §4/§5）：本次消耗 + 累计消耗必须 > 0（否则 42203）；
 * 本次消耗 > 0 时自动落一条 effort（leftHours=0、work 缺省取 comment）。
 */
export function finishSchema(task: Pick<TaskView, 'consumedHours'> | null) {
  return z
    .object({
      consumedHours: z.number().min(0).max(999.99).nullable(),
      leftHours: z.number().min(0).max(999.99).nullable(),
      work: z.string().max(255),
      comment: z.string(),
    })
    .refine((values) => (values.consumedHours ?? 0) + (task?.consumedHours ?? 0) > 0, {
      path: ['consumedHours'],
      message: 'task.message.finishConsumedRequired',
    })
}

export type TaskFinishFormValues = z.input<ReturnType<typeof finishSchema>>

export function taskFinishBody(values: TaskFinishFormValues): Record<string, unknown> {
  return {
    consumedHours: values.consumedHours !== null && values.consumedHours > 0 ? values.consumedHours : null,
    leftHours: values.leftHours,
    work: values.work === '' ? null : values.work,
    comment: values.comment === '' ? null : values.comment,
  }
}

/** 完成任务弹窗（T-10 / task §6 F 范式：wait/doing/pause → done，累计为 0 时本次消耗必填）。 */
export function TaskFinishModal({
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
  const { control, handleSubmit } = useForm<TaskFinishFormValues>({
    resolver: zodResolver(finishSchema(task)),
    defaultValues: { consumedHours: null, leftHours: null, work: '', comment: '' },
  })

  const submit = useMutation({
    mutationFn: (values: TaskFinishFormValues) => {
      if (!task) {
        throw new Error('task finish modal: no task')
      }
      return runTaskAction(task.id, 'finish', taskFinishBody(values))
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      for (const root of TASK_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
      onClose()
    },
  })
  const run = handleSubmit((values) => submit.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={t('task.action.finish')}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" loading={submit.isPending} onClick={() => void run()}>
            {t('common.action.submit')}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <NumberField
          control={control}
          name="consumedHours"
          label={t('task.field.consume')}
          min={0}
          max={999.99}
          aria-label="task-finish-consumed"
        />
        <NumberField
          control={control}
          name="leftHours"
          label={t('task.field.left')}
          min={0}
          max={999.99}
          aria-label="task-finish-left"
        />
        <TextAreaField control={control} name="work" label={t('task.field.work')} aria-label="task-finish-work" />
        <TextAreaField
          control={control}
          name="comment"
          label={t('common.field.comment')}
          aria-label="task-finish-comment"
        />
        {submit.error ? (
          <Typography.Paragraph type="danger">
            {errorText(submit.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
