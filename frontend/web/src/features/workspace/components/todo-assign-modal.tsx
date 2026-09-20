import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { SelectField, TextAreaField } from '../../../shared/form-fields'
import { fetchAccountOptions, runTodoAction, type TodoView, WORKSPACE_QUERY_ROOTS } from '../api/workspace.api'

/** assign 守卫（§4）：assignee 必填；指派给本人由服务端 42203 拦下，前端不预判。 */
export const todoAssignSchema = z.object({
  assignee: z.string().min(1, 'todo.message.assigneeRequired'),
  comment: z.string(),
})

export type TodoAssignFormValues = z.input<typeof todoAssignSchema>

/** 待办指派弹窗（§6 F 范式：assignee 更新 + assignedBy/At 回写 + 通知 assignee）。 */
export function TodoAssignModal({
  todo,
  open,
  onClose,
}: {
  todo: TodoView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const { control, handleSubmit } = useForm<TodoAssignFormValues>({
    resolver: zodResolver(todoAssignSchema),
    defaultValues: { assignee: todo?.assignee ?? '', comment: '' },
  })

  const submit = useMutation({
    mutationFn: (values: TodoAssignFormValues) => {
      if (!todo) {
        throw new Error('todo assign modal: no todo')
      }
      return runTodoAction(todo.id, 'assign', {
        assignee: values.assignee,
        comment: values.comment === '' ? null : values.comment,
      })
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      for (const root of WORKSPACE_QUERY_ROOTS) {
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
      title={t('todo.action.assign')}
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
          label={t('todo.field.assignee')}
          options={(accounts.data ?? []).map((account) => ({
            value: account.account,
            label: `${account.realName}(${account.account})`,
          }))}
          aria-label="todo-assign-assignee"
        />
        <TextAreaField
          control={control}
          name="comment"
          label={t('common.field.comment')}
          aria-label="todo-assign-comment"
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
