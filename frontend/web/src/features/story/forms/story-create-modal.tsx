import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Input, InputNumber, Modal, Select, Switch, Typography, useMessage } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
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

export type StoryFormValues = {
  title: string
  branchId: number
  categoryId: number
  planId: number | null
  type: string
  priority: number
  estimateHours: number | null
  source: string
  keywords: string | null
  description: string | null
  assignee: string | null
  reviewers: string[]
  needNotReview: boolean
  notifyAccounts: string[]
  linkedStoryIds: number[]
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
  const [form] = Form.useForm<StoryFormValues>()
  const editing = story != null
  // 枚举字段选项唯一来源（03 §5）：type/priority/source 从 meta 取，前端不留清单。
  const storyMeta = useDomainMeta('story')

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
  })

  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t(`story.action.${mode === 'change-done' ? 'changeDone' : 'edit'}`) : t('story.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        key={`${story?.id ?? 'create'}-${mode}`}
        layout="vertical"
        initialValues={{
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
        }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="title"
          label={t('story.field.title')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="story-title" maxLength={255} />
        </Form.Item>
        <Form.Item name="type" label={t('story.field.type')}>
          <Select aria-label="story-type" options={metaOptions(storyMeta.data, 'type', t)} />
        </Form.Item>
        <Form.Item name="priority" label={t('story.field.priority')}>
          <Select aria-label="story-priority" options={metaNumberOptions(storyMeta.data, 'priority', t)} />
        </Form.Item>
        <Form.Item name="source" label={t('story.field.source')}>
          <Select aria-label="story-source" options={metaOptions(storyMeta.data, 'source', t)} />
        </Form.Item>
        <Form.Item name="branchId" label={t('story.field.branch')}>
          <Select
            aria-label="story-branch"
            options={[
              { value: 0, label: t('common.field.none') },
              ...(branches.data?.items ?? []).map((branch) => ({ value: branch.id, label: branch.name })),
            ]}
          />
        </Form.Item>
        <Form.Item name="categoryId" label={t('story.field.category')}>
          <Select
            aria-label="story-category"
            options={[
              { value: 0, label: t('common.field.none') },
              ...(categories.data?.items ?? []).map((category) => ({ value: category.id, label: category.name })),
            ]}
          />
        </Form.Item>
        <Form.Item name="planId" label={t('story.field.plan')}>
          <Select
            allowClear
            aria-label="story-plan"
            options={(plans.data?.items ?? []).map((plan) => ({ value: plan.id, label: plan.title }))}
          />
        </Form.Item>
        <Form.Item name="estimateHours" label={t('story.field.estimate')}>
          <InputNumber aria-label="story-estimate" min={0} max={999.99} className="tw:w-full" />
        </Form.Item>
        <Form.Item name="assignee" label={t('story.field.assignee')}>
          <Select allowClear showSearch optionFilterProp="label" aria-label="story-assignee" options={accountOptions} />
        </Form.Item>
        <Form.Item name="reviewers" label={t('story.field.reviewers')}>
          <Select
            mode="multiple"
            allowClear
            aria-label="story-reviewers"
            optionFilterProp="label"
            options={accountOptions}
          />
        </Form.Item>
        <Form.Item name="needNotReview" label={t('story.field.needNotReview')} valuePropName="checked">
          <Switch aria-label="story-need-not-review" />
        </Form.Item>
        <Form.Item name="notifyAccounts" label={t('story.field.notify')}>
          <Select
            mode="multiple"
            allowClear
            aria-label="story-notify"
            optionFilterProp="label"
            options={accountOptions}
          />
        </Form.Item>
        <Form.Item name="linkedStoryIds" label={t('story.field.linked')}>
          <Select
            mode="multiple"
            allowClear
            aria-label="story-linked"
            optionFilterProp="label"
            options={(candidates.data?.items ?? [])
              .filter((item) => item.id !== story?.id)
              .map((item) => ({ value: item.id, label: `#${item.id} ${item.title}` }))}
          />
        </Form.Item>
        <Form.Item name="keywords" label={t('story.field.keywords')}>
          <Input aria-label="story-keywords" maxLength={255} />
        </Form.Item>
        <Form.Item name="description" label={t('story.field.description')}>
          <Input.TextArea aria-label="story-description" rows={4} />
        </Form.Item>
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
      {story && open ? (
        // A-02 附件区：仅编辑态（创建无 objectId）且弹窗打开时挂载（避免预渲染白跑列表请求）
        <div className="tw:mt-4 tw:flex tw:flex-col tw:gap-2">
          <Typography.Text type="secondary">{t('story.field.files')}</Typography.Text>
          <FileUploadField objectType="story" objectId={story.id} />
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
