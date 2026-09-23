import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { TestCaseView } from '@zentao/api-client/generated/model/testCaseView'
import { Form, Modal, Select, Switch, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { applyServerFields, errorProps, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchStories } from '../../story'
import { fetchBranches, fetchCaseCategories, patchTestCase, submitTestCase } from '../api/quality.api'
import { TestCaseStepsEditor } from '../components/test-case-steps-editor'
import type { StepInput } from '../model'
import { canPatchStatus, normalizeSteps, TEST_CASE_MARKER_STATUSES } from '../model'

export const testCaseFormSchema = z.object({
  title: z.string().min(1, 'common.message.required'),
  branchId: z.number(),
  categoryId: z.number(),
  storyId: z.number().nullable(),
  priority: z.number(),
  type: z.string(),
  stage: z.array(z.string()),
  status: z.string().optional(),
  precondition: z.string().nullable(),
  keywords: z.string().nullable(),
  needReview: z.boolean(),
  steps: z.custom<StepInput[]>(),
})

export type TestCaseFormValues = z.input<typeof testCaseFormSchema>

function valuesOf(testCase: TestCaseView | null): TestCaseFormValues {
  return {
    title: testCase?.title ?? '',
    branchId: testCase?.branchId ?? 0,
    categoryId: testCase?.categoryId ?? 0,
    storyId: testCase?.storyId ?? null,
    priority: testCase?.priority ?? 3,
    type: testCase?.type ?? 'feature',
    stage: testCase?.stage ?? [],
    // 标记态直改（03 §1 例外）才带 status；wait 进出只经 review，提交体不含它
    ...(testCase && canPatchStatus(testCase.status) ? { status: testCase.status } : {}),
    precondition: testCase?.precondition ?? null,
    keywords: testCase?.keywords ?? null,
    needReview: false,
    steps: testCase?.steps ?? [],
  }
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
  const editing = testCase != null
  // 库用例（productId=0，quality 卡 §3.3）无产品归属：分支/分类/需求是产品维度，跳过查询与字段（gap B-QUA-16：产品维度查询打 0 号产品会 404）
  const libraryCase = editing && productId === 0
  // 枚举字段选项唯一来源（03 §5）：priority/type/stage 从 meta 取，前端不留清单。
  const caseMeta = useDomainMeta('testCase')
  const { control, handleSubmit, setError, reset } = useForm<TestCaseFormValues>({
    resolver: zodResolver(testCaseFormSchema),
    defaultValues: valuesOf(testCase ?? null),
  })

  // 切换新建/编辑对象时重置表单（defaultValues 只在首挂载生效）
  useEffect(() => {
    reset(valuesOf(testCase ?? null))
  }, [testCase, reset])

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
    onError: (error) => applyServerFields(error, setError),
  })

  const submit = handleSubmit((values) => save.mutate(values))

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
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="title"
          label={t('testCase.field.title')}
          maxLength={255}
          aria-label="case-title"
        />
        <Controller
          control={control}
          name="priority"
          render={({ field, fieldState }) => (
            <Form.Item label={t('testCase.field.priority')} {...errorProps(fieldState.error, t)}>
              <Select
                aria-label="case-priority"
                options={metaNumberOptions(caseMeta.data, 'priority', t)}
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
            <Form.Item label={t('testCase.field.type')} {...errorProps(fieldState.error, t)}>
              <Select
                aria-label="case-type"
                options={metaOptions(caseMeta.data, 'type', t)}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                onBlur={field.onBlur}
              />
            </Form.Item>
          )}
        />
        <SelectField
          control={control}
          name="stage"
          label={t('testCase.field.stage')}
          options={metaOptions(caseMeta.data, 'stage', t)}
          multiple
          aria-label="case-stage"
        />
        {libraryCase ? null : (
          <>
            <Controller
              control={control}
              name="branchId"
              render={({ field, fieldState }) => (
                <Form.Item label={t('testCase.field.branch')} {...errorProps(fieldState.error, t)}>
                  <Select
                    aria-label="case-branch"
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
                <Form.Item label={t('testCase.field.category')} {...errorProps(fieldState.error, t)}>
                  <Select
                    aria-label="case-category"
                    options={[
                      { value: 0, label: t('common.field.none') },
                      ...(categories.data?.items ?? []).map((category) => ({
                        value: category.id,
                        label: category.name,
                      })),
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
              name="storyId"
              label={t('testCase.field.story')}
              options={(stories.data?.items ?? []).map((story) => ({
                value: story.id,
                label: `#${story.id} ${story.title}`,
              }))}
              aria-label="case-story"
            />
          </>
        )}
        {editing && canPatchStatus(testCase.status) ? (
          <Controller
            control={control}
            name="status"
            render={({ field, fieldState }) => (
              <Form.Item
                label={t('testCase.field.status')}
                extra={t('testCase.message.statusPatchHint')}
                {...errorProps(fieldState.error, t)}
              >
                <Select
                  aria-label="case-status"
                  options={TEST_CASE_MARKER_STATUSES.map((value) => ({
                    value,
                    label: t(`testCase.status.${value}`),
                  }))}
                  value={field.value}
                  onChange={(value) => field.onChange(value)}
                  onBlur={field.onBlur}
                />
              </Form.Item>
            )}
          />
        ) : null}
        {!editing ? (
          <Controller
            control={control}
            name="needReview"
            render={({ field, fieldState }) => (
              <Form.Item label={t('testCase.field.needReview')} {...errorProps(fieldState.error, t)}>
                <Switch
                  aria-label="case-need-review"
                  checked={field.value}
                  onChange={(checked) => field.onChange(checked)}
                />
              </Form.Item>
            )}
          />
        ) : null}
        <TextAreaField
          control={control}
          name="precondition"
          label={t('testCase.field.precondition')}
          rows={2}
          aria-label="case-precondition"
        />
        <TextField
          control={control}
          name="keywords"
          label={t('testCase.field.keywords')}
          maxLength={255}
          aria-label="case-keywords"
        />
        <Controller
          control={control}
          name="steps"
          render={({ field, fieldState }) => (
            <Form.Item label={t('testCase.field.steps')} {...errorProps(fieldState.error, t)}>
              <TestCaseStepsEditor value={field.value} onChange={(next) => field.onChange(next)} />
            </Form.Item>
          )}
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
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
