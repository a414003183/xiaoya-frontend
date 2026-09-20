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

/** start 表单（task §5）：可选改派 + 本次消耗（>0 落 effort）+ 剩余工时（缺省按 estimate − consumed 初始化）。 */
export const startSchema = z.object({
  assignee: z.string().nullable(),
  consumedHours: z.number().min(0).max(999.99).nullable(),
  leftHours: z.number().min(0).max(999.99).nullable(),
  comment: z.string(),
})

export type TaskStartFormValues = z.input<typeof startSchema>

export function taskStartBody(values: TaskStartFormValues): Record<string, unknown> {
  return {
    assignee: values.assignee,
    consumedHours: values.consumedHours !== null && values.consumedHours > 0 ? values.consumedHours : null,
    leftHours: values.leftHours,
    comment: values.comment === '' ? null : values.comment,
  }
}

/** 开始任务弹窗（T-10 / task §6 F 范式：wait → doing）。 */
export function TaskStartModal({ task, open, onClose }: { task: TaskView | null; open: boolean; onClose: () => void }) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const { control, handleSubmit } = useForm<TaskStartFormValues>({
    resolver: zodResolver(startSchema),
    defaultValues: { assignee: task?.assignee ?? null, consumedHours: null, leftHours: null, comment: '' },
  })

  const submit = useMutation({
    mutationFn: (values: TaskStartFormValues) => {
      if (!task) {
        throw new Error('task start modal: no task')
      }
      return runTaskAction(task.id, 'start', taskStartBody(values))
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
      title={t('task.action.start')}
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
          aria-label="task-start-assignee"
        />
        <NumberField
          control={control}
          name="consumedHours"
          label={t('task.field.consume')}
          min={0}
          max={999.99}
          aria-label="task-start-consumed"
        />
        <NumberField
          control={control}
          name="leftHours"
          label={t('task.field.left')}
          min={0}
          max={999.99}
          aria-label="task-start-left"
        />
        <TextAreaField
          control={control}
          name="comment"
          label={t('common.field.comment')}
          aria-label="task-start-comment"
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
