import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Checkbox, Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaNumberOptions } from '../../../shared/meta-options'
import { fetchTodoMeta, fetchTodoTypes, patchTodo, qk, type TodoView } from '../api/workspace.api'
import { TodoObjectPicker } from '../components/todo-object-picker'
import { metaFieldLabel, metaFieldMaxLength, todoObjectRequired, todoPatchBody, todoTypeKey } from '../model'

const TIME_PATTERN = /^$|^\d{2}:\d{2}$/

/** PATCH 白名单（§5）：status 走状态机、assignee 走 assign，动作列字段不进表单。 */
export const todoEditSchema = z
  .object({
    title: z.string().min(1, 'common.message.required').max(150, 'todo.message.titleTooLong'),
    type: z.string(),
    objectId: z.number().nullable(),
    date: z.string().min(1, 'todo.message.dateRequired'),
    beginTime: z.string().regex(TIME_PATTERN, 'todo.message.timeFormat'),
    endTime: z.string().regex(TIME_PATTERN, 'todo.message.timeFormat'),
    priority: z.number().min(1).max(4),
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

export type TodoEditFormValues = z.input<typeof todoEditSchema>

function valuesOf(todo: TodoView | null): TodoEditFormValues {
  return {
    title: todo?.title ?? '',
    type: todo?.type ?? 'custom',
    objectId: todo === null || todo.objectId === 0 ? null : todo.objectId,
    date: todo?.date ?? '',
    beginTime: todo?.beginTime ?? '',
    endTime: todo?.endTime ?? '',
    priority: todo?.priority ?? 3,
    isPrivate: todo?.isPrivate ?? false,
    description: todo?.description ?? '',
  }
}

/**
 * 待办编辑弹窗（T-7 / §6 F 范式）：PATCH + lockVersion 乐观锁（40901 → 提示刷新，ApiError 原样呈现）。
 * 日期在 PATCH 上不可清空（后端 null = 不修改），故表单要求日期非空。
 */
export function TodoEditModal({ todo, open, onClose }: { todo: TodoView | null; open: boolean; onClose: () => void }) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const meta = useQuery({ queryKey: qk.workspace.todoMeta(), queryFn: fetchTodoMeta })
  const types = useQuery({ queryKey: qk.workspace.todoTypes(), queryFn: fetchTodoTypes })
  const { control, handleSubmit, watch } = useForm<TodoEditFormValues>({
    resolver: zodResolver(todoEditSchema),
    values: valuesOf(todo),
    resetOptions: { keepDirtyValues: true },
  })
  const type = watch('type')
  const titleMax = metaFieldMaxLength(meta.data?.fields, 'title', 150)
  const label = (key: string, fallback: string): string => t(metaFieldLabel(meta.data?.fields, key, fallback))

  const save = useMutation({
    mutationFn: (values: TodoEditFormValues) => {
      if (!todo) {
        throw new Error('todo edit modal: no todo')
      }
      return patchTodo(todo.id, todoPatchBody(todo, values))
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['getTodo'] })
      void queryClient.invalidateQueries({ queryKey: ['listTodos'] })
      onClose()
    },
  })
  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={t('todo.action.edit')}
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
                <TodoObjectPicker
                  type={type}
                  value={field.value ?? null}
                  currentTitle={todo?.objectTitle ?? null}
                  onChange={(value) => field.onChange(value)}
                />
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
