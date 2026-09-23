import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, HasPerm, Modal, Select, Switch, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import {
  applyServerFields,
  errorProps,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../shared/form-fields'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { FileUploadField } from '../../platform'
import {
  changeDoneStoryAction,
  fetchAccountOptions,
  fetchBranches,
  fetchPlans,
  fetchStories,
  fetchStoryCategories,
  patchStory,
  type StoryView,
  submitStory,
} from '../api/story.api'

export const storyFormSchema = z.object({
  title: z.string().min(1, 'common.message.required'),
  branchId: z.number(),
  categoryId: z.number(),
  planId: z.number().nullable(),
  type: z.string(),
  priority: z.number(),
  estimateHours: z.number().nullable(),
  source: z.string(),
  keywords: z.string().nullable(),
  description: z.string().nullable(),
  assignee: z.string().nullable(),
  reviewers: z.array(z.string()),
  needNotReview: z.boolean(),
  notifyAccounts: z.array(z.string()),
  linkedStoryIds: z.array(z.number()),
})

export type StoryFormValues = z.input<typeof storyFormSchema>

function valuesOf(story: StoryView | null): StoryFormValues {
  return {
    title: story?.title ?? '',
    branchId: story?.branchId ?? 0,
    categoryId: story?.categoryId ?? 0,
    planId: story?.planId ?? null,
    type: story?.type ?? 'story',
    priority: story?.priority ?? 3,
    estimateHours: story?.estimateHours ?? null,
    source: story?.source ?? 'manual',
    keywords: story?.keywords ?? null,
    description: story?.description ?? null,
    assignee: story?.assignee ?? null,
    reviewers: story?.reviewers ?? [],
    needNotReview: story?.needNotReview ?? false,
    notifyAccounts: story?.notifyAccounts ?? [],
    linkedStoryIds: story?.linkedStoryIds ?? [],
  }
}

/** 需求创建/编辑（含 change-done 变更完成）共用表单壳（T-5；parentId 之外的字段照 requirement §3）。 */
export function StoryFormModal({
  productId,
  story,
  mode = 'edit',
  open,
  onClose,
  onSaved,
}: {
  productId: number
  story?: StoryView | null
  mode?: 'edit' | 'change-done'
  open: boolean
  onClose: () => void
  onSaved?: ((story: StoryView) => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = story != null
  // 枚举字段选项唯一来源（03 §5）：type/priority/source 从 meta 取，前端不留清单。
  const storyMeta = useDomainMeta('story')
  const { control, handleSubmit, setError, reset } = useForm<StoryFormValues>({
    resolver: zodResolver(storyFormSchema),
    defaultValues: valuesOf(story ?? null),
  })

  // 切换新建/编辑对象时重置表单（defaultValues 只在首挂载生效）
  useEffect(() => {
    reset(valuesOf(story ?? null))
  }, [story, reset])

  const branches = useQuery({
    queryKey: ['listBranches', productId, 'form'],
    queryFn: () => fetchBranches(productId, { limit: 200 }),
  })
  const categories = useQuery({
    queryKey: ['listCategories', productId, 'story', 'form'],
    queryFn: () => fetchStoryCategories(productId),
  })
  const plans = useQuery({
    queryKey: ['listPlans', productId, 'form'],
    queryFn: () => fetchPlans(productId, { limit: 200 }),
  })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const candidates = useQuery({
    queryKey: ['listStories', productId, 'form'],
    queryFn: () => fetchStories(productId, { limit: 200 }),
  })

  const save = useMutation({
    mutationFn: async (values: StoryFormValues) => {
      if (editing && mode === 'change-done') {
        return changeDoneStoryAction(story.id, { ...values, lockVersion: story.lockVersion })
      }
      return editing
        ? patchStory(story.id, { ...values, lockVersion: story.lockVersion })
        : submitStory(productId, values)
    },
    onSuccess: (saved) => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listStories'] })
      void queryClient.invalidateQueries({ queryKey: ['getStory'] })
      if (saved) {
        onSaved?.(saved)
      }
      onClose()
    },
    onError: (error) => applyServerFields(error, setError),
  })

  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t(`story.action.${mode === 'change-done' ? 'changeDone' : 'edit'}`) : t('story.action.create')}
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
          label={t('story.field.title')}
          maxLength={255}
          aria-label="story-title"
        />
        <Controller
          control={control}
          name="type"
          render={({ field, fieldState }) => (
            <Form.Item label={t('story.field.type')} {...errorProps(fieldState.error, t)}>
              <Select
                aria-label="story-type"
                options={metaOptions(storyMeta.data, 'type', t)}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                onBlur={field.onBlur}
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="priority"
          render={({ field, fieldState }) => (
            <Form.Item label={t('story.field.priority')} {...errorProps(fieldState.error, t)}>
              <Select
                aria-label="story-priority"
                options={metaNumberOptions(storyMeta.data, 'priority', t)}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                onBlur={field.onBlur}
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="source"
          render={({ field, fieldState }) => (
            <Form.Item label={t('story.field.source')} {...errorProps(fieldState.error, t)}>
              <Select
                aria-label="story-source"
                options={metaOptions(storyMeta.data, 'source', t)}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                onBlur={field.onBlur}
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="branchId"
          render={({ field, fieldState }) => (
            <Form.Item label={t('story.field.branch')} {...errorProps(fieldState.error, t)}>
              <Select
                aria-label="story-branch"
                options={[
                  { value: 0, label: t('common.field.none') },
                  ...(branches.data?.items ?? []).map((branch) => ({ value: branch.id, label: branch.name })),
                ]}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                onBlur={field.onBlur}
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="categoryId"
          render={({ field, fieldState }) => (
            <Form.Item label={t('story.field.category')} {...errorProps(fieldState.error, t)}>
              <Select
                aria-label="story-category"
                options={[
                  { value: 0, label: t('common.field.none') },
                  ...(categories.data?.items ?? []).map((category) => ({ value: category.id, label: category.name })),
                ]}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                onBlur={field.onBlur}
              />
            </Form.Item>
          )}
        />
        <SelectField
          control={control}
          name="planId"
          label={t('story.field.plan')}
          options={(plans.data?.items ?? []).map((plan) => ({ value: plan.id, label: plan.title }))}
          aria-label="story-plan"
        />
        <NumberField
          control={control}
          name="estimateHours"
          label={t('story.field.estimate')}
          min={0}
          max={999.99}
          aria-label="story-estimate"
        />
        <SelectField
          control={control}
          name="assignee"
          label={t('story.field.assignee')}
          options={accountOptions}
          aria-label="story-assignee"
        />
        <SelectField
          control={control}
          name="reviewers"
          label={t('story.field.reviewers')}
          options={accountOptions}
          multiple
          aria-label="story-reviewers"
        />
        <Controller
          control={control}
          name="needNotReview"
          render={({ field, fieldState }) => (
            <Form.Item label={t('story.field.needNotReview')} {...errorProps(fieldState.error, t)}>
              <Switch
                aria-label="story-need-not-review"
                checked={field.value}
                onChange={(checked) => field.onChange(checked)}
              />
            </Form.Item>
          )}
        />
        <SelectField
          control={control}
          name="notifyAccounts"
          label={t('story.field.notify')}
          options={accountOptions}
          multiple
          aria-label="story-notify"
        />
        <SelectField
          control={control}
          name="linkedStoryIds"
          label={t('story.field.linked')}
          options={(candidates.data?.items ?? [])
            .filter((item) => item.id !== story?.id)
            .map((item) => ({ value: item.id, label: `#${item.id} ${item.title}` }))}
          multiple
          aria-label="story-linked"
        />
        <TextField
          control={control}
          name="keywords"
          label={t('story.field.keywords')}
          maxLength={255}
          aria-label="story-keywords"
        />
        <TextAreaField
          control={control}
          name="description"
          label={t('story.field.description')}
          rows={4}
          aria-label="story-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
      {story && open ? (
        // A-02 附件区：仅编辑态（创建无 objectId）且弹窗打开时挂载（避免预渲染白跑列表请求）
        <div className="tw:mt-4 tw:flex tw:flex-col tw:gap-2">
          <Typography.Text type="secondary">{t('story.field.files')}</Typography.Text>
          <HasPerm perm="file-upload">
            <FileUploadField objectType="story" objectId={story.id} />
          </HasPerm>
        </div>
      ) : null}
    </Modal>
  )
}

/** 需求创建弹窗（T-5；从产品需求列表进入）。 */
export function StoryCreateModal({
  productId,
  open,
  onClose,
  onCreated,
}: {
  productId: number
  open: boolean
  onClose: () => void
  onCreated?: (story: StoryView) => void
}) {
  return <StoryFormModal productId={productId} story={null} open={open} onClose={onClose} onSaved={onCreated} />
}
