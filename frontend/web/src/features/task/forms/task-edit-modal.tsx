import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, NumberField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { FileUploadField } from '../../platform'
import { fetchAccountOptions, fetchExecutionStories } from '../../project'
import { patchTask, type TaskView } from '../api/task.api'
import { TASK_TYPES } from '../model'

/** PATCH 白名单（task §5）：assignee 走 assign 动作、consumedHours/leftHours 由动作与工时回写。 */
export const taskEditSchema = z.object({
  title: z.string().min(1, 'common.message.required').max(255, 'task.message.titleTooLong'),
  type: z.enum(TASK_TYPES),
  priority: z.number().min(1).max(4),
  storyId: z.number().nullable(),
  estimateHours: z.number().min(0).max(999.99).nullable(),
  estStartedDate: z.string(),
  deadline: z.string(),
  keywords: z.string().max(255),
  notifyAccounts: z.array(z.string()),
  description: z.string(),
})

export type TaskEditFormValues = z.input<typeof taskEditSchema>

function valuesOf(task: TaskView | null): TaskEditFormValues {
  return {
    title: task?.title ?? '',
    type: task?.type ?? 'devel',
    priority: task?.priority ?? 3,
    storyId: task === null || task.storyId === 0 ? null : task.storyId,
    estimateHours: task?.estimateHours ?? null,
    estStartedDate: task?.estStartedDate ?? '',
    deadline: task?.deadline ?? '',
    keywords: task?.keywords ?? '',
    notifyAccounts: task?.notifyAccounts ?? [],
    description: task?.description ?? '',
  }
}

/** 只提交改动过的键（03 §1：键缺失 = 不修改，空串/0 = 清空）。 */
export function taskPatchBody(task: TaskView, values: TaskEditFormValues): Record<string, unknown> {
  const body: Record<string, unknown> = { lockVersion: task.lockVersion }
  if (values.title.trim() !== task.title) {
    body.title = values.title.trim()
  }
  if (values.type !== task.type) {
    body.type = values.type
  }
  if (values.priority !== task.priority) {
    body.priority = values.priority
  }
  if ((values.storyId ?? 0) !== task.storyId) {
    body.storyId = values.storyId ?? 0
  }
  if (values.estimateHours !== (task.estimateHours ?? null)) {
    body.estimateHours = values.estimateHours ?? 0
  }
  if (values.estStartedDate !== (task.estStartedDate ?? '')) {
    body.estStartedDate = values.estStartedDate === '' ? null : values.estStartedDate
  }
  if (values.deadline !== (task.deadline ?? '')) {
    body.deadline = values.deadline === '' ? null : values.deadline
  }
  if (values.keywords !== (task.keywords ?? '')) {
    body.keywords = values.keywords === '' ? null : values.keywords
  }
  if (values.notifyAccounts.join(',') !== (task.notifyAccounts ?? []).join(',')) {
    body.notifyAccounts = values.notifyAccounts
  }
  if (values.description !== (task.description ?? '')) {
    body.description = values.description === '' ? null : values.description
  }
  return body
}

/** 任务编辑弹窗（T-10 / task §6 F 范式）：PATCH + lockVersion 乐观锁。 */
export function TaskEditModal({
  task,
  open,
  onClose,
  onSaved,
}: {
  task: TaskView | null
  open: boolean
  onClose: () => void
  onSaved?: (() => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const stories = useQuery({
    queryKey: ['listExecutionStories', task?.executionId ?? 0, 'form'],
    queryFn: () => fetchExecutionStories(task?.executionId ?? 0, { limit: 200 }),
    enabled: task != null,
  })
  const { control, handleSubmit } = useForm<TaskEditFormValues>({
    resolver: zodResolver(taskEditSchema),
    defaultValues: valuesOf(task),
  })
  // 枚举字段选项唯一来源（03 §5）：type/priority 从 meta 取；TASK_TYPES 只留作 zod 校验的编译期字面量联合。
  const taskMeta = useDomainMeta('task')

  const save = useMutation({
    mutationFn: (values: TaskEditFormValues) => {
      if (!task) {
        throw new Error('task edit modal: no task')
      }
      return patchTask(task.id, taskPatchBody(task, values))
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['getTask'] })
      void queryClient.invalidateQueries({ queryKey: ['listExecutionTasks'] })
      onSaved?.()
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
      title={t('task.action.edit')}
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
      {task && open ? (
        // A-02 附件区：仅编辑态（创建无 objectId）且弹窗打开时挂载（forceRender 预渲染会白跑一次列表请求）
        <div className="tw:mt-4 tw:flex tw:flex-col tw:gap-2">
          <Typography.Text type="secondary">{t('task.field.files')}</Typography.Text>
          <FileUploadField objectType="task" objectId={task.id} />
        </div>
      ) : null}
    </Modal>
  )
}
