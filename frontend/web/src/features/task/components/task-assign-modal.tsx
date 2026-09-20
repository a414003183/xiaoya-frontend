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

/** assign 守卫（task §4）：assignee 必填且为存在账号，可覆写 leftHours。 */
export const assignSchema = z.object({
  assignee: z.string().min(1, 'task.message.assigneeRequired'),
  leftHours: z.number().min(0).max(999.99).nullable(),
  comment: z.string(),
})

export type TaskAssignFormValues = z.input<typeof assignSchema>

/** 指派任务弹窗（T-10 / task §6 F 范式：closed/cancel 不可指派，回写 assignedAt 并通知）。 */
export function TaskAssignModal({
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
  const { control, handleSubmit } = useForm<TaskAssignFormValues>({
    resolver: zodResolver(assignSchema),
    defaultValues: { assignee: task?.assignee ?? '', leftHours: null, comment: '' },
  })

  const submit = useMutation({
    mutationFn: (values: TaskAssignFormValues) => {
      if (!task) {
        throw new Error('task assign modal: no task')
      }
      return runTaskAction(task.id, 'assign', {
        assignee: values.assignee,
        leftHours: values.leftHours,
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
      title={t('task.action.assign')}
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
        <SelectField
          control={control}
          name="assignee"
          label={t('task.field.assignee')}
          options={(accounts.data ?? []).map((account) => ({
            value: account.account,
            label: `${account.realName}(${account.account})`,
          }))}
          aria-label="task-assign-assignee"
        />
        <NumberField
          control={control}
          name="leftHours"
          label={t('task.field.left')}
          min={0}
          max={999.99}
          aria-label="task-assign-left"
        />
        <TextAreaField
          control={control}
          name="comment"
          label={t('common.field.comment')}
          aria-label="task-assign-comment"
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
