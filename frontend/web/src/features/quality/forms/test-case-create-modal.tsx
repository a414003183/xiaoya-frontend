import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { TestCaseView } from '@zentao/api-client/generated/model/testCaseView'
import { Form, Input, Modal, Select, Switch, Typography, useMessage } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchStories } from '../../story'
import { fetchBranches, fetchCaseCategories, patchTestCase, submitTestCase } from '../api/quality.api'
import { TestCaseStepsEditor } from '../components/test-case-steps-editor'
import type { StepInput } from '../model'
import { canPatchStatus, normalizeSteps, TEST_CASE_MARKER_STATUSES } from '../model'

export type TestCaseFormValues = {
  title: string
  branchId: number
  categoryId: number
  storyId: number | null
  priority: number
  type: string
  stage: string[]
  status?: string
  precondition: string | null
  keywords: string | null
  needReview: boolean
  steps: StepInput[]
}

/** 用例创建/编辑共用表单壳（T-5；步骤子表行内编辑随表单整体上送，quality §3.2）。 */
export function TestCaseFormModal({
  productId,
  testCase,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  testCase?: TestCaseView | null
  open: boolean
  onClose: () => void
  onSaved?: ((item: TestCaseView) => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<TestCaseFormValues>()
  const editing = testCase != null
  // 库用例（productId=0，quality 卡 §3.3）无产品归属：分支/分类/需求是产品维度，跳过查询与字段（gap B-QUA-16：产品维度查询打 0 号产品会 404）
  const libraryCase = editing && productId === 0
  // 枚举字段选项唯一来源（03 §5）：priority/type/stage 从 meta 取，前端不留清单。
  const caseMeta = useDomainMeta('testCase')

  const branches = useQuery({
    queryKey: ['listBranches', productId, 'form'],
    queryFn: () => fetchBranches(productId, { limit: 200 }),
    enabled: !libraryCase,
  })
  const categories = useQuery({
    queryKey: ['listCategories', productId, 'case', 'form'],
    queryFn: () => fetchCaseCategories(productId),
    enabled: !libraryCase,
  })
  const stories = useQuery({
    queryKey: ['listStories', productId, 'form'],
    queryFn: () => fetchStories(productId, { limit: 200 }),
    enabled: !libraryCase,
  })

  const save = useMutation({
    mutationFn: async (values: TestCaseFormValues) => {
      const steps = normalizeSteps(values.steps)
      return editing
        ? patchTestCase(testCase.id, {
            title: values.title,
            precondition: values.precondition,
            keywords: values.keywords,
            priority: values.priority,
            type: values.type,
            stage: values.stage,
            categoryId: values.categoryId,
            storyId: values.storyId,
            ...(values.status !== undefined ? { status: values.status } : {}), // 标记态直改（03 §1 例外）
            steps,
            lockVersion: testCase.lockVersion,
          })
        : submitTestCase(productId, { ...values, steps })
    },
    onSuccess: (saved) => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listTestCases'] })
      void queryClient.invalidateQueries({ queryKey: ['getTestCase'] })
      if (saved) {
        onSaved?.(saved)
      }
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      forceRender
      width={680}
      title={editing ? t('testCase.action.edit') : t('testCase.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        key={testCase?.id ?? 'create'}
        layout="vertical"
        initialValues={{
          title: testCase?.title ?? '',
          branchId: testCase?.branchId ?? 0,
          categoryId: testCase?.categoryId ?? 0,
          storyId: testCase?.storyId ?? null,
          priority: testCase?.priority ?? 3,
          type: testCase?.type ?? 'feature',
          stage: testCase?.stage ?? [],
          precondition: testCase?.precondition ?? null,
          keywords: testCase?.keywords ?? null,
          needReview: false,
          steps: testCase?.steps ?? [],
        }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="title"
          label={t('testCase.field.title')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="case-title" maxLength={255} />
        </Form.Item>
        <Form.Item name="priority" label={t('testCase.field.priority')}>
          <Select aria-label="case-priority" options={metaNumberOptions(caseMeta.data, 'priority', t)} />
        </Form.Item>
        <Form.Item name="type" label={t('testCase.field.type')}>
          <Select aria-label="case-type" options={metaOptions(caseMeta.data, 'type', t)} />
        </Form.Item>
        <Form.Item name="stage" label={t('testCase.field.stage')}>
          <Select mode="multiple" allowClear aria-label="case-stage" options={metaOptions(caseMeta.data, 'stage', t)} />
        </Form.Item>
        {libraryCase ? null : (
          <>
            <Form.Item name="branchId" label={t('testCase.field.branch')}>
              <Select
                aria-label="case-branch"
                options={[
                  { value: 0, label: t('common.field.none') },
                  ...(branches.data?.items ?? []).map((branch) => ({ value: branch.id, label: branch.name })),
                ]}
              />
            </Form.Item>
            <Form.Item name="categoryId" label={t('testCase.field.category')}>
              <Select
                aria-label="case-category"
                options={[
                  { value: 0, label: t('common.field.none') },
                  ...(categories.data?.items ?? []).map((category) => ({ value: category.id, label: category.name })),
                ]}
              />
            </Form.Item>
            <Form.Item name="storyId" label={t('testCase.field.story')}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                aria-label="case-story"
                options={(stories.data?.items ?? []).map((story) => ({
                  value: story.id,
                  label: `#${story.id} ${story.title}`,
                }))}
              />
            </Form.Item>
          </>
        )}
        {editing && canPatchStatus(testCase.status) ? (
          <Form.Item
            name="status"
            label={t('testCase.field.status')}
            extra={t('testCase.message.statusPatchHint')}
            initialValue={testCase.status}
          >
            <Select
              aria-label="case-status"
              options={TEST_CASE_MARKER_STATUSES.map((value) => ({
                value,
                label: t(`testCase.status.${value}`),
              }))}
            />
          </Form.Item>
        ) : null}
        {!editing ? (
          <Form.Item name="needReview" label={t('testCase.field.needReview')} valuePropName="checked">
            <Switch aria-label="case-need-review" />
          </Form.Item>
        ) : null}
        <Form.Item name="precondition" label={t('testCase.field.precondition')}>
          <Input.TextArea aria-label="case-precondition" rows={2} />
        </Form.Item>
        <Form.Item name="keywords" label={t('testCase.field.keywords')}>
          <Input aria-label="case-keywords" maxLength={255} />
        </Form.Item>
        <Form.Item label={t('testCase.field.steps')}>
          <Form.Item name="steps" noStyle>
            <TestCaseStepsEditorSlot />
          </Form.Item>
        </Form.Item>
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

/** Form.Item 嵌受控子表：RHF 之外 antd Form 也能用 value/onChange 挂子表（noStyle 挂载点）。 */
function TestCaseStepsEditorSlot({ value, onChange }: { value?: StepInput[]; onChange?: (next: StepInput[]) => void }) {
  return <TestCaseStepsEditor value={value ?? []} onChange={(next) => onChange?.(next)} />
}

/** 用例创建弹窗（T-5；从产品用例列表进入）。 */
export function TestCaseCreateModal({
  productId,
  open,
  onClose,
  onCreated,
}: {
  productId: number
  open: boolean
  onClose: () => void
  onCreated?: (item: TestCaseView) => void
}) {
  return <TestCaseFormModal productId={productId} testCase={null} open={open} onClose={onClose} onSaved={onCreated} />
}
