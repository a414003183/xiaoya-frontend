import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { SelectField, TextAreaField } from '../../../shared/form-fields'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { runTaskAction, TASK_QUERY_ROOTS, type TaskAction, type TaskView } from '../api/task.api'
import { closeReasonRequired } from '../model'

/** 通用确认动作（task §6：close/cancel/pause/resume 共用一个确认弹窗）。 */
export const CONFIRM_TASK_ACTIONS = ['close', 'cancel', 'pause', 'resume'] as const
export type ConfirmTaskAction = (typeof CONFIRM_TASK_ACTIONS)[number]

/** 关闭守卫（§4）：来源非 done/cancel 时 closedReason 必填，缺省按来源回填。 */
export function closeSchema(action: ConfirmTaskAction, status: string | undefined) {
  return z
    .object({
      closedReason: z.string(),
      comment: z.string(),
    })
    .refine((values) => action !== 'close' || !closeReasonRequired(status) || values.closedReason !== '', {
      path: ['closedReason'],
      message: 'task.message.closeReasonRequired',
    })
}

export type TaskCloseFormValues = z.input<ReturnType<typeof closeSchema>>

/** 请求体：close 才带 closedReason，其余动作只收 comment（§5 各动作请求体）。 */
export function taskConfirmBody(action: ConfirmTaskAction, values: TaskCloseFormValues): Record<string, unknown> {
  const comment = values.comment === '' ? null : values.comment
  if (action !== 'close') {
    return { comment }
  }
  return { closedReason: values.closedReason === '' ? null : values.closedReason, comment }
}

/**
 * 关闭/取消/暂停/继续确认弹窗（T-10 / task §6 F 范式）。
 * 关闭原因的默认值按来源状态回填（done → done、cancel → cancel），否则留空并要求选择。
 */
export function TaskCloseModal({
  task,
  action,
  open,
  onClose,
}: {
  task: TaskView | null
  action: ConfirmTaskAction
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const defaultReason = task?.status === 'cancel' ? 'cancel' : task?.status === 'done' ? 'done' : ''
  const { control, handleSubmit } = useForm<TaskCloseFormValues>({
    resolver: zodResolver(closeSchema(action, task?.status)),
    defaultValues: { closedReason: defaultReason, comment: '' },
  })
  // closedReason 选项唯一来源（03 §5）：从 meta 取，前端不留清单。
  const taskMeta = useDomainMeta('task')

  const submit = useMutation({
    mutationFn: (values: TaskCloseFormValues) => {
      if (!task) {
        throw new Error('task close modal: no task')
      }
      return runTaskAction(task.id, action as TaskAction, taskConfirmBody(action, values))
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
      title={t(`task.action.${action}`)}
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
        {action === 'close' ? (
          <SelectField
            control={control}
            name="closedReason"
            label={t('task.field.closedReason')}
            options={metaOptions(taskMeta.data, 'closedReason', t)}
            aria-label="task-close-reason"
          />
        ) : null}
        <TextAreaField
          control={control}
          name="comment"
          label={t('common.field.comment')}
          aria-label="task-close-comment"
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
