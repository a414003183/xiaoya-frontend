import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { BugView } from '@zentao/api-client/generated/model/bugView'
import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import { Form, Input, Modal, Select, Typography, useMessage } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
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

export type BugFormValues = {
  title: string
  branchId: number
  categoryId: number
  planId: number | null
  storyId: number | null
  severity: number
  priority: number
  type: string
  os: string | null
  browser: string | null
  steps: string | null
  openedBuilds: string | null
  keywords: string | null
  assignee: string | null
  deadline: string | null
  relatedBugIds: number[]
  notifyAccounts: string[]
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
  const [form] = Form.useForm<BugFormValues>()
  const editing = bug != null
  // 枚举字段选项唯一来源（03 §5）：severity/priority/type 从 meta 取，前端不留清单。
  const bugMeta = useDomainMeta('bug')

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
  })

  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('bug.action.edit') : t('bug.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        key={bug?.id ?? 'create'}
        layout="vertical"
        initialValues={{
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
        }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="title"
          label={t('bug.field.title')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="bug-title" maxLength={255} />
        </Form.Item>
        <Form.Item name="severity" label={t('bug.field.severity')}>
          <Select aria-label="bug-severity" options={metaNumberOptions(bugMeta.data, 'severity', t)} />
        </Form.Item>
        <Form.Item name="priority" label={t('bug.field.priority')}>
          <Select aria-label="bug-priority" options={metaNumberOptions(bugMeta.data, 'priority', t)} />
        </Form.Item>
        <Form.Item name="type" label={t('bug.field.type')}>
          <Select aria-label="bug-type" options={metaOptions(bugMeta.data, 'type', t)} />
        </Form.Item>
        <Form.Item name="os" label={t('bug.field.os')}>
          <Select allowClear aria-label="bug-os" options={dictOptions(osDict.data, t)} />
        </Form.Item>
        <Form.Item name="browser" label={t('bug.field.browser')}>
          <Select allowClear aria-label="bug-browser" options={dictOptions(browserDict.data, t)} />
        </Form.Item>
        <Form.Item name="branchId" label={t('bug.field.branch')}>
          <Select
            aria-label="bug-branch"
            options={[
              { value: 0, label: t('common.field.none') },
              ...(branches.data?.items ?? []).map((branch) => ({ value: branch.id, label: branch.name })),
            ]}
          />
        </Form.Item>
        <Form.Item name="categoryId" label={t('bug.field.category')}>
          <Select
            aria-label="bug-category"
            options={[
              { value: 0, label: t('common.field.none') },
              ...(categories.data?.items ?? []).map((category) => ({ value: category.id, label: category.name })),
            ]}
          />
        </Form.Item>
        <Form.Item name="planId" label={t('bug.field.plan')}>
          <Select
            allowClear
            aria-label="bug-plan"
            options={(plans.data?.items ?? []).map((plan) => ({ value: plan.id, label: plan.title }))}
          />
        </Form.Item>
        <Form.Item name="storyId" label={t('bug.field.story')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            aria-label="bug-story"
            options={(stories.data?.items ?? []).map((story: StoryView) => ({
              value: story.id,
              label: `#${story.id} ${story.title}`,
            }))}
          />
        </Form.Item>
        <Form.Item name="openedBuilds" label={t('bug.field.openedBuilds')}>
          <Input aria-label="bug-opened-builds" maxLength={255} />
        </Form.Item>
        {!editing && testCaseId ? (
          <Form.Item label={t('bug.field.testCase')}>
            <Typography.Text aria-label="bug-test-case-prefill">{`#${testCaseId}`}</Typography.Text>
          </Form.Item>
        ) : null}
        <Form.Item name="assignee" label={t('bug.field.assignee')}>
          <Select allowClear showSearch optionFilterProp="label" aria-label="bug-assignee" options={accountOptions} />
        </Form.Item>
        <Form.Item name="deadline" label={t('bug.field.deadline')}>
          <Input aria-label="bug-deadline" placeholder="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item name="relatedBugIds" label={t('bug.field.relatedBugs')}>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            aria-label="bug-related"
            options={(candidates.data?.items ?? [])
              .filter((item) => item.id !== bug?.id)
              .map((item) => ({ value: item.id, label: `#${item.id} ${item.title}` }))}
          />
        </Form.Item>
        <Form.Item name="notifyAccounts" label={t('bug.field.notify')}>
          <Select
            mode="multiple"
            allowClear
            aria-label="bug-notify"
            optionFilterProp="label"
            options={accountOptions}
          />
        </Form.Item>
        <Form.Item name="keywords" label={t('bug.field.keywords')}>
          <Input aria-label="bug-keywords" maxLength={255} />
        </Form.Item>
        <Form.Item name="steps" label={t('bug.field.steps')}>
          <Input.TextArea aria-label="bug-steps" rows={4} />
        </Form.Item>
        {editing && bug ? (
          // A-02：编辑态附件区（objectType=bug + 已有 objectId）；创建态无 objectId 不加
          <Form.Item label={t('bug.field.files')}>
            <FileUploadField objectType="bug" objectId={bug.id} />
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
