import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, NumberField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchAccountOptions, fetchExecutionStories } from '../../project'
import { fetchTasks, submitTask, type TaskView } from '../api/task.api'
import { TASK_TYPES } from '../model'

/** task §3 创建校验：title 1–255 必填、priority 1–4、estimateHours ≥ 0。 */
export const taskCreateSchema = z.object({
  parentId: z.number().nullable(),
  storyId: z.number().nullable(),
  title: z.string().min(1, 'common.message.required').max(255, 'task.message.titleTooLong'),
  type: z.enum(TASK_TYPES),
  priority: z.number().min(1).max(4),
  estimateHours: z.number().min(0).max(999.99).nullable(),
  estStartedDate: z.string(),
  deadline: z.string(),
  assignee: z.string().nullable(),
  keywords: z.string().max(255),
  notifyAccounts: z.array(z.string()),
  description: z.string(),
})

export type TaskCreateFormValues = z.input<typeof taskCreateSchema>

/** 创建体（task §3）：status 恒 wait、consumedHours 恒 0 由服务端落，leftHours 由 start 初始化。 */
export function taskCreateBody(values: TaskCreateFormValues): Record<string, unknown> {
  return {
    parentId: values.parentId ?? 0,
    storyId: values.storyId ?? 0,
    title: values.title.trim(),
    type: values.type,
    priority: values.priority,
    estimateHours: values.estimateHours,
    estStartedDate: values.estStartedDate === '' ? null : values.estStartedDate,
    deadline: values.deadline === '' ? null : values.deadline,
    assignee: values.assignee,
    keywords: values.keywords === '' ? null : values.keywords,
    notifyAccounts: values.notifyAccounts,
    description: values.description === '' ? null : values.description,
  }
}

/**
 * 任务创建弹窗（T-10 / task §6 F 范式）：从列表或详情进入，带 parentId 即创建子任务；
 * 父任务候选只取顶层任务（父子仅一层，子任务不可再作父）。
 */
export function TaskCreateModal({
  executionId,
  defaultParentId = 0,
  open,
  onClose,
  onCreated,
}: {
  executionId: number
  defaultParentId?: number
  open: boolean
  onClose: () => void
  onCreated?: ((task: TaskView) => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  // 枚举字段选项唯一来源（03 §5）：type/priority 从 meta 取；TASK_TYPES 只留作 zod 校验的编译期字面量联合。
  const taskMeta = useDomainMeta('task')
  const stories = useQuery({
    queryKey: ['listExecutionStories', executionId, 'form'],
    queryFn: () => fetchExecutionStories(executionId, { limit: 200 }),
  })
  const parents = useQuery({
    queryKey: ['listExecutionTasks', executionId, 'parents'],
    queryFn: () => fetchTasks(executionId, { limit: 200, filters: { parentId: '@null' } }),
  })
  const { control, handleSubmit } = useForm<TaskCreateFormValues>({
    resolver: zodResolver(taskCreateSchema),
    defaultValues: {
      parentId: defaultParentId === 0 ? null : defaultParentId,
      storyId: null,
      title: '',
      type: 'devel',
      priority: 3,
      estimateHours: null,
      estStartedDate: '',
      deadline: '',
      assignee: null,
      keywords: '',
      notifyAccounts: [],
      description: '',
    },
  })

  const save = useMutation({
    mutationFn: (values: TaskCreateFormValues) => submitTask(executionId, taskCreateBody(values)),
    onSuccess: (task) => {
      message.success(t('common.message.created'))
      void queryClient.invalidateQueries({ queryKey: ['listExecutionTasks'] })
      void queryClient.invalidateQueries({ queryKey: ['getTask'] })
      onCreated?.(task)
      onClose()
    },
  })
  const submit = handleSubmit((values) => save.mutate(values))
  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))

  return (
    <Modal
      open={open}
      forceRender
      title={defaultParentId === 0 ? t('task.action.create') : t('task.action.createChild')}
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
          label={t('task.field.title')}
          maxLength={255}
          aria-label="task-title"
        />
        <SelectField
          control={control}
          name="type"
          label={t('task.field.type')}
          options={metaOptions(taskMeta.data, 'type', t)}
          aria-label="task-type"
        />
        <SelectField
          control={control}
          name="priority"
          label={t('task.field.priority')}
          options={metaNumberOptions(taskMeta.data, 'priority', t)}
          aria-label="task-priority"
        />
        <SelectField
          control={control}
          name="parentId"
          label={t('task.field.parent')}
          options={(parents.data?.items ?? []).map((task) => ({ value: task.id, label: `#${task.id} ${task.title}` }))}
          aria-label="task-parent"
        />
        <SelectField
          control={control}
          name="storyId"
          label={t('task.field.story')}
          options={(stories.data?.items ?? []).map((story) => ({
            value: story.id,
            label: `#${story.id} ${story.title}`,
          }))}
          aria-label="task-story"
        />
        <NumberField
          control={control}
          name="estimateHours"
          label={t('task.field.estimate')}
          min={0}
          max={999.99}
          aria-label="task-estimate"
        />
        <DateField
          control={control}
          name="estStartedDate"
          label={t('task.field.estStarted')}
          aria-label="task-est-started"
        />
        <DateField control={control} name="deadline" label={t('task.field.deadline')} aria-label="task-deadline" />
        <SelectField
          control={control}
          name="assignee"
          label={t('task.field.assignee')}
          options={accountOptions}
          aria-label="task-assignee"
        />
        <SelectField
          control={control}
          name="notifyAccounts"
          label={t('task.field.notify')}
          options={accountOptions}
          multiple
          aria-label="task-notify"
        />
        <TextField
          control={control}
          name="keywords"
          label={t('task.field.keywords')}
          maxLength={255}
          aria-label="task-keywords"
        />
        <TextAreaField
          control={control}
          name="description"
          label={t('task.field.description')}
          aria-label="task-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
