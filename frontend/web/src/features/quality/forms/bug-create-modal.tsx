import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { BugView } from '@zentao/api-client/generated/model/bugView'
import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import { Form, HasPerm, Modal, Select, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import {
  applyServerFields,
  DateField,
  errorProps,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../shared/form-fields'
import { dictOptions, metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { FileUploadField } from '../../platform'
import { fetchStories } from '../../story'
import {
  fetchAccountOptions,
  fetchBranches,
  fetchBugCategories,
  fetchBugDict,
  fetchBugs,
  fetchPlans,
  patchBug,
  submitBug,
} from '../api/quality.api'

export const bugFormSchema = z.object({
  title: z.string().min(1, 'common.message.required'),
  branchId: z.number(),
  categoryId: z.number(),
  planId: z.number().nullable(),
  storyId: z.number().nullable(),
  severity: z.number(),
  priority: z.number(),
  type: z.string(),
  os: z.string().nullable(),
  browser: z.string().nullable(),
  steps: z.string().nullable(),
  openedBuilds: z.string().nullable(),
  keywords: z.string().nullable(),
  assignee: z.string().nullable(),
  deadline: z.string().nullable(),
  relatedBugIds: z.array(z.number()),
  notifyAccounts: z.array(z.string()),
})

export type BugFormValues = z.input<typeof bugFormSchema>

function valuesOf(bug: BugView | null): BugFormValues {
  return {
    title: bug?.title ?? '',
    branchId: bug?.branchId ?? 0,
    categoryId: bug?.categoryId ?? 0,
    planId: bug?.planId ?? null,
    storyId: bug?.storyId ?? null,
    severity: bug?.severity ?? 3,
    priority: bug?.priority ?? 3,
    type: bug?.type ?? 'codeerror',
    os: bug?.os ?? null,
    browser: bug?.browser ?? null,
    steps: bug?.steps ?? null,
    openedBuilds: bug?.openedBuilds ?? null,
    keywords: bug?.keywords ?? null,
    assignee: bug?.assignee ?? null,
    deadline: bug?.deadline ?? null,
    relatedBugIds: bug?.relatedBugIds ?? [],
    notifyAccounts: bug?.notifyAccounts ?? [],
  }
}

/** Bug 创建/编辑共用表单壳（T-2；字段照 quality §3.1，PATCH 白名单内字段才上送；A-02 编辑态附件区、B-QUA-02 创建预填 testCaseId）。 */
export function BugFormModal({
  productId,
  bug,
  testCaseId,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  bug?: BugView | null
  /** 从用例提 Bug（B-QUA-02）：创建时预填关联用例，仅随创建体上送。 */
  testCaseId?: number | undefined
  open: boolean
  onClose: () => void
  onSaved?: ((bug: BugView) => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = bug != null
  // 枚举字段选项唯一来源（03 §5）：severity/priority/type 从 meta 取，前端不留清单。
  const bugMeta = useDomainMeta('bug')
  const { control, handleSubmit, setError, reset } = useForm<BugFormValues>({
    resolver: zodResolver(bugFormSchema),
    defaultValues: valuesOf(bug ?? null),
  })

  // 切换新建/编辑对象时重置表单（defaultValues 只在首挂载生效）
  useEffect(() => {
    reset(valuesOf(bug ?? null))
  }, [bug, reset])

  const branches = useQuery({
    queryKey: ['listBranches', productId, 'form'],
    queryFn: () => fetchBranches(productId, { limit: 200 }),
  })
  const categories = useQuery({
    queryKey: ['listCategories', productId, 'bug', 'form'],
    queryFn: () => fetchBugCategories(productId),
  })
  const plans = useQuery({
    queryKey: ['listPlans', productId, 'form'],
    queryFn: () => fetchPlans(productId, { limit: 200 }),
  })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const stories = useQuery({
    queryKey: ['listStories', productId, 'form'],
    queryFn: () => fetchStories(productId, { limit: 200 }),
  })
  const candidates = useQuery({
    queryKey: ['listBugs', productId, 'form'],
    queryFn: () => fetchBugs(productId, { limit: 200 }),
  })
  // os/browser 值域在 /dicts（meta 只声明 source）：前端不留清单。
  const osDict = useQuery({ queryKey: ['getDict', 'bug-os'], queryFn: () => fetchBugDict('bug-os') })
  const browserDict = useQuery({ queryKey: ['getDict', 'bug-browser'], queryFn: () => fetchBugDict('bug-browser') })

  const save = useMutation({
    mutationFn: async (values: BugFormValues) => {
      if (editing) {
        return patchBug(bug.id, { ...values, lockVersion: bug.lockVersion })
      }
      return submitBug(productId, { ...values, ...(testCaseId ? { testCaseId } : {}) })
    },
    onSuccess: (saved) => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listBugs'] })
      void queryClient.invalidateQueries({ queryKey: ['getBug'] })
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
      title={editing ? t('bug.action.edit') : t('bug.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField control={control} name="title" label={t('bug.field.title')} maxLength={255} aria-label="bug-title" />
        <Controller
          control={control}
          name="severity"
          render={({ field, fieldState }) => (
            <Form.Item label={t('bug.field.severity')} {...errorProps(fieldState.error, t)}>
              <Select
                aria-label="bug-severity"
                options={metaNumberOptions(bugMeta.data, 'severity', t)}
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
            <Form.Item label={t('bug.field.priority')} {...errorProps(fieldState.error, t)}>
              <Select
                aria-label="bug-priority"
                options={metaNumberOptions(bugMeta.data, 'priority', t)}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                onBlur={field.onBlur}
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="type"
          render={({ field, fieldState }) => (
            <Form.Item label={t('bug.field.type')} {...errorProps(fieldState.error, t)}>
              <Select
                aria-label="bug-type"
                options={metaOptions(bugMeta.data, 'type', t)}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                onBlur={field.onBlur}
              />
            </Form.Item>
          )}
        />
        <SelectField
          control={control}
          name="os"
          label={t('bug.field.os')}
          options={dictOptions(osDict.data, t)}
          aria-label="bug-os"
        />
        <SelectField
          control={control}
          name="browser"
          label={t('bug.field.browser')}
          options={dictOptions(browserDict.data, t)}
          aria-label="bug-browser"
        />
        <Controller
          control={control}
          name="branchId"
          render={({ field, fieldState }) => (
            <Form.Item label={t('bug.field.branch')} {...errorProps(fieldState.error, t)}>
              <Select
                aria-label="bug-branch"
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
            <Form.Item label={t('bug.field.category')} {...errorProps(fieldState.error, t)}>
              <Select
                aria-label="bug-category"
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
          label={t('bug.field.plan')}
          options={(plans.data?.items ?? []).map((plan) => ({ value: plan.id, label: plan.title }))}
          aria-label="bug-plan"
        />
        <SelectField
          control={control}
          name="storyId"
          label={t('bug.field.story')}
          options={(stories.data?.items ?? []).map((story: StoryView) => ({
            value: story.id,
            label: `#${story.id} ${story.title}`,
          }))}
          aria-label="bug-story"
        />
        <TextField
          control={control}
          name="openedBuilds"
          label={t('bug.field.openedBuilds')}
          maxLength={255}
          aria-label="bug-opened-builds"
        />
        {!editing && testCaseId ? (
          <Form.Item label={t('bug.field.testCase')}>
            <Typography.Text aria-label="bug-test-case-prefill">{`#${testCaseId}`}</Typography.Text>
          </Form.Item>
        ) : null}
        <SelectField
          control={control}
          name="assignee"
          label={t('bug.field.assignee')}
          options={accountOptions}
          aria-label="bug-assignee"
        />
        <DateField control={control} name="deadline" label={t('bug.field.deadline')} aria-label="bug-deadline" />
        <SelectField
          control={control}
          name="relatedBugIds"
          label={t('bug.field.relatedBugs')}
          options={(candidates.data?.items ?? [])
            .filter((item) => item.id !== bug?.id)
            .map((item) => ({ value: item.id, label: `#${item.id} ${item.title}` }))}
          multiple
          aria-label="bug-related"
        />
        <SelectField
          control={control}
          name="notifyAccounts"
          label={t('bug.field.notify')}
          options={accountOptions}
          multiple
          aria-label="bug-notify"
        />
        <TextField
          control={control}
          name="keywords"
          label={t('bug.field.keywords')}
          maxLength={255}
          aria-label="bug-keywords"
        />
        <TextAreaField control={control} name="steps" label={t('bug.field.steps')} aria-label="bug-steps" />
        {editing && bug ? (
          // A-02：编辑态附件区（objectType=bug + 已有 objectId）；创建态无 objectId 不加
          <Form.Item label={t('bug.field.files')}>
            <HasPerm perm="file-upload">
              <FileUploadField objectType="bug" objectId={bug.id} />
            </HasPerm>
          </Form.Item>
        ) : null}
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

/** Bug 创建弹窗（T-2；从产品 Bug 列表进入；testCaseId 为从用例提 Bug 的预填关联，B-QUA-02）。 */
export function BugCreateModal({
  productId,
  testCaseId,
  open,
  onClose,
  onCreated,
}: {
  productId: number
  testCaseId?: number | undefined
  open: boolean
  onClose: () => void
  onCreated?: (bug: BugView) => void
}) {
  return (
    <BugFormModal
      productId={productId}
      bug={null}
      testCaseId={testCaseId}
      open={open}
      onClose={onClose}
      onSaved={onCreated}
    />
  )
}
