import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Checkbox, Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaNumberOptions } from '../../../shared/meta-options'
import {
  fetchAccountOptions,
  fetchMe,
  fetchTodoMeta,
  fetchTodoTypes,
  qk,
  submitTodo,
  type TodoView,
} from '../api/workspace.api'
import { TodoObjectPicker } from '../components/todo-object-picker'
import { metaFieldLabel, metaFieldMaxLength, todoCreateBody, todoObjectRequired, todoTypeKey } from '../model'

const TIME_PATTERN = /^$|^\d{2}:\d{2}$/

/** 创建守卫（§3.1）：title 1–150；type≠custom → objectId 必填；时间 HH:mm 且 end > begin。 */
export const todoCreateSchema = z
  .object({
    title: z.string().min(1, 'common.message.required').max(150, 'todo.message.titleTooLong'),
    type: z.string(),
    objectId: z.number().nullable(),
    date: z.string(),
    beginTime: z.string().regex(TIME_PATTERN, 'todo.message.timeFormat'),
    endTime: z.string().regex(TIME_PATTERN, 'todo.message.timeFormat'),
    priority: z.number().min(1).max(4),
    assignee: z.string().min(1, 'todo.message.assigneeRequired'),
    isPrivate: z.boolean(),
    description: z.string(),
  })
  .refine((values) => !todoObjectRequired(values.type) || values.objectId !== null, {
    path: ['objectId'],
    message: 'todo.message.objectRequired',
  })
  .refine((values) => values.beginTime === '' || values.endTime === '' || values.endTime > values.beginTime, {
    path: ['endTime'],
    message: 'todo.message.timeOrder',
  })

export type TodoCreateFormValues = z.input<typeof todoCreateSchema>

/** 待办创建弹窗（T-7 / §6 F 范式）：类型选项走 /dicts/todoType，字段标签/长度走 /meta/todo。 */
export function TodoCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated?: ((todo: TodoView) => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['getMe'], queryFn: fetchMe })
  const meta = useQuery({ queryKey: qk.workspace.todoMeta(), queryFn: fetchTodoMeta })
  const types = useQuery({ queryKey: qk.workspace.todoTypes(), queryFn: fetchTodoTypes })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const today = new Date().toISOString().slice(0, 10)

  const { control, handleSubmit, watch, reset } = useForm<TodoCreateFormValues>({
    resolver: zodResolver(todoCreateSchema),
    defaultValues: {
      title: '',
      type: 'custom',
      objectId: null,
      date: today,
      beginTime: '',
      endTime: '',
      priority: 3,
      assignee: me.data?.account.account ?? '',
      isPrivate: false,
      description: '',
    },
  })
  const type = watch('type')
  const titleMax = metaFieldMaxLength(meta.data?.fields, 'title', 150)
  const label = (key: string, fallback: string): string => t(metaFieldLabel(meta.data?.fields, key, fallback))

  const save = useMutation({
    mutationFn: (values: TodoCreateFormValues) => submitTodo(todoCreateBody(values)),
    onSuccess: (todo) => {
      message.success(t('common.message.created'))
      void queryClient.invalidateQueries({ queryKey: ['listTodos'] })
      void queryClient.invalidateQueries({ queryKey: ['getMySummary'] })
      reset()
      onCreated?.(todo)
      onClose()
    },
  })
  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={t('todo.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="title"
          label={label('title', 'todo.field.title')}
          maxLength={titleMax}
          aria-label="todo-title"
        />
        <SelectField
          control={control}
          name="type"
          label={label('type', 'todo.field.type')}
          options={(types.data ?? []).map((value) => ({ value, label: t(todoTypeKey(value)) }))}
          aria-label="todo-type"
        />
        {todoObjectRequired(type) ? (
          <Controller
            control={control}
            name="objectId"
            render={({ field, fieldState }) => (
              <Form.Item
                label={label('objectId', 'todo.field.object')}
                {...(fieldState.error
                  ? { validateStatus: 'error' as const, help: t(fieldState.error.message ?? '') }
                  : {})}
              >
                <TodoObjectPicker type={type} value={field.value ?? null} onChange={(value) => field.onChange(value)} />
              </Form.Item>
            )}
          />
        ) : null}
        <DateField control={control} name="date" label={label('date', 'todo.field.date')} aria-label="todo-date" />
        <TextField
          control={control}
          name="beginTime"
          label={label('beginTime', 'todo.field.begin')}
          placeholder="HH:mm"
          aria-label="todo-begin-time"
        />
        <TextField
          control={control}
          name="endTime"
          label={label('endTime', 'todo.field.end')}
          placeholder="HH:mm"
          aria-label="todo-end-time"
        />
        <SelectField
          control={control}
          name="priority"
          label={label('priority', 'common.field.priority')}
          options={metaNumberOptions(meta.data, 'priority', t)}
          aria-label="todo-priority"
        />
        <SelectField
          control={control}
          name="assignee"
          label={label('assignee', 'todo.field.assignee')}
          options={(accounts.data ?? []).map((account) => ({
            value: account.account,
            label: `${account.realName}(${account.account})`,
          }))}
          aria-label="todo-assignee"
        />
        <Controller
          control={control}
          name="isPrivate"
          render={({ field }) => (
            <Form.Item label={label('isPrivate', 'todo.field.isPrivate')}>
              <Checkbox
                aria-label="todo-private"
                checked={field.value}
                onChange={(event) => field.onChange(event.target.checked)}
              >
                {t('todo.message.privateHint')}
              </Checkbox>
            </Form.Item>
          )}
        />
        <TextAreaField
          control={control}
          name="description"
          label={label('description', 'todo.field.description')}
          aria-label="todo-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
