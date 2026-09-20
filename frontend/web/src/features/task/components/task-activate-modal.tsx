import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { NumberField, SelectField, TextAreaField } from '../../../shared/form-fields'
import { fetchAccountOptions } from '../../project'
import { runTaskAction, TASK_QUERY_ROOTS, type TaskView } from '../api/task.api'

/** activate 守卫（task §4）：leftHours 必填且 > 0（否则 42201），可改派。 */
export const activateSchema = z.object({
  leftHours: z.number().gt(0, 'task.message.leftHoursRequired').max(999.99, 'task.message.leftHoursRequired'),
  assignee: z.string().nullable(),
  comment: z.string(),
})

export type TaskActivateFormValues = z.input<typeof activateSchema>

/** 激活任务弹窗（T-10 / task §6 F 范式：done/cancel/closed → doing，清空四件套并回写 activatedAt）。 */
export function TaskActivateModal({
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
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const { control, handleSubmit } = useForm<TaskActivateFormValues>({
    resolver: zodResolver(activateSchema),
    defaultValues: { leftHours: task?.leftHours ?? 0, assignee: task?.assignee ?? null, comment: '' },
  })

  const submit = useMutation({
    mutationFn: (values: TaskActivateFormValues) => {
      if (!task) {
        throw new Error('task activate modal: no task')
      }
      return runTaskAction(task.id, 'activate', {
        leftHours: values.leftHours,
        assignee: values.assignee,
        comment: values.comment === '' ? null : values.comment,
      })
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
      title={t('task.action.activate')}
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
          name="leftHours"
          label={t('task.field.left')}
          min={0}
          max={999.99}
          aria-label="task-activate-left"
        />
        <SelectField
          control={control}
          name="assignee"
          label={t('task.field.assignee')}
          options={(accounts.data ?? []).map((account) => ({
            value: account.account,
            label: `${account.realName}(${account.account})`,
          }))}
          aria-label="task-activate-assignee"
        />
        <TextAreaField
          control={control}
          name="comment"
          label={t('common.field.comment')}
          aria-label="task-activate-comment"
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
