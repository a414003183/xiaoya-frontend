import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { TestRunView } from '@zentao/api-client/generated/model/testRunView'
import { Form, Modal, Select, Typography, useMessage } from '@zentao/design-system'
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
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchBuilds } from '../../product'
import { fetchExecutions } from '../../project'
import { fetchAccountOptions, patchTestRun, submitTestRun } from '../api/quality.api'

export const testRunFormSchema = z.object({
  name: z.string().min(1, 'common.message.required'),
  executionId: z
    .number()
    .nullable()
    .refine((value) => value !== null, 'common.message.required'),
  priority: z.number(),
  type: z.string().nullable(),
  beginDate: z.string().min(1, 'common.message.required'),
  endDate: z.string().min(1, 'common.message.required'),
  owner: z.string().nullable(),
  buildId: z.number().nullable(),
  description: z.string().nullable(),
  members: z.array(z.string()),
  notifyAccounts: z.array(z.string()),
})

export type TestRunFormValues = z.input<typeof testRunFormSchema>

function valuesOf(testRun: TestRunView | null): TestRunFormValues {
  const today = new Date().toISOString().slice(0, 10)
  return {
    name: testRun?.name ?? '',
    executionId: testRun?.executionId ?? null,
    priority: testRun?.priority ?? 3,
    type: testRun?.type ?? null,
    beginDate: testRun?.beginDate ?? today,
    endDate: testRun?.endDate ?? today,
    owner: testRun?.owner ?? null,
    buildId: testRun?.buildId ?? null,
    description: testRun?.description ?? null,
    members: testRun?.members ?? [],
    notifyAccounts: testRun?.notifyAccounts ?? [],
  }
}

/** 提交体（quality §3.4 ✓项）：productId/executionId 创建后不可改，改单走 PATCH 白名单（§5）。 */
export function testRunSubmitBody(values: TestRunFormValues): Record<string, unknown> {
  return {
    executionId: values.executionId,
    name: values.name.trim(),
    owner: values.owner,
    priority: values.priority,
    type: values.type,
    beginDate: values.beginDate,
    endDate: values.endDate,
    buildId: values.buildId ?? 0,
    description: values.description === '' ? null : values.description,
    members: values.members,
    notifyAccounts: values.notifyAccounts,
  }
}

/** PATCH 白名单（§5 updateTestRun）+ lockVersion：name/owner/priority/type/beginDate/endDate/buildId/description/members/notifyAccounts。 */
export function testRunPatchBody(values: TestRunFormValues, lockVersion: number): Record<string, unknown> {
  const body = testRunSubmitBody(values)
  delete body.executionId
  return { ...body, lockVersion }
}

/** 测试单创建/编辑共用表单壳（T-9；执行/构建来自 project/product 域出口）。 */
export function TestRunFormModal({
  productId,
  testRun,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  testRun?: TestRunView | null
  open: boolean
  onClose: () => void
  onSaved?: ((item: TestRunView) => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = testRun != null
  // 枚举字段选项唯一来源（03 §5）：priority/type 从 meta 取，前端不留清单。
  const runMeta = useDomainMeta('testRun')
  const { control, handleSubmit, setError, reset } = useForm<TestRunFormValues>({
    resolver: zodResolver(testRunFormSchema),
    defaultValues: valuesOf(testRun ?? null),
  })

  // 切换新建/编辑对象时重置表单（defaultValues 只在首挂载生效）
  useEffect(() => {
    reset(valuesOf(testRun ?? null))
  }, [testRun, reset])

  const executions = useQuery({
    queryKey: ['listExecutions', 'form'],
    queryFn: () => fetchExecutions({ limit: 200 }),
    enabled: open,
  })
  const builds = useQuery({
    queryKey: ['listBuilds', productId, 'form'],
    queryFn: () => fetchBuilds(productId, { limit: 200 }),
    enabled: open,
  })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions, enabled: open })

  const save = useMutation({
    mutationFn: (values: TestRunFormValues) =>
      editing
        ? patchTestRun(testRun.id, testRunPatchBody(values, testRun.lockVersion))
        : submitTestRun(productId, testRunSubmitBody(values)),
    onSuccess: (saved) => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listTestRuns'] })
      void queryClient.invalidateQueries({ queryKey: ['getTestRun'] })
      if (saved) {
        onSaved?.(saved)
      }
      onClose()
    },
    onError: (error) => applyServerFields(error, setError),
  })

  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}（${account.account}）`,
  }))

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      width={640}
      title={editing ? t('testRun.action.edit') : t('testRun.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="name"
          label={t('testRun.field.name')}
          maxLength={90}
          aria-label="test-run-name"
        />
        <Controller
          control={control}
          name="executionId"
          render={({ field, fieldState }) => (
            <Form.Item label={t('testRun.field.execution')} {...errorProps(fieldState.error, t)}>
              <Select
                showSearch
                optionFilterProp="label"
                disabled={editing}
                aria-label="test-run-execution"
                options={(executions.data?.items ?? []).map((execution) => ({
                  value: execution.id,
                  label: execution.name,
                }))}
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
            <Form.Item label={t('testRun.field.priority')} {...errorProps(fieldState.error, t)}>
              <Select
                aria-label="test-run-priority"
                options={metaNumberOptions(runMeta.data, 'priority', t)}
                value={field.value}
                onChange={(value) => field.onChange(value)}
                onBlur={field.onBlur}
              />
            </Form.Item>
          )}
        />
        <SelectField
          control={control}
          name="type"
          label={t('testRun.field.type')}
          options={metaOptions(runMeta.data, 'type', t)}
          aria-label="test-run-type"
        />
        <DateField
          control={control}
          name="beginDate"
          label={t('testRun.field.beginDate')}
          aria-label="test-run-begin-date"
        />
        <DateField control={control} name="endDate" label={t('testRun.field.endDate')} aria-label="test-run-end-date" />
        <SelectField
          control={control}
          name="owner"
          label={t('testRun.field.owner')}
          options={accountOptions}
          aria-label="test-run-owner"
        />
        <SelectField
          control={control}
          name="buildId"
          label={t('testRun.field.build')}
          options={[
            { value: 0, label: t('common.field.none') },
            ...(builds.data?.items ?? []).map((build) => ({ value: build.id, label: build.name })),
          ]}
          aria-label="test-run-build"
        />
        <SelectField
          control={control}
          name="members"
          label={t('testRun.field.members')}
          options={accountOptions}
          multiple
          aria-label="test-run-members"
        />
        <SelectField
          control={control}
          name="notifyAccounts"
          label={t('testRun.field.notify')}
          options={accountOptions}
          multiple
          aria-label="test-run-notify"
        />
        <TextAreaField
          control={control}
          name="description"
          label={t('testRun.field.description')}
          rows={3}
          aria-label="test-run-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

/** 测试单创建弹窗（T-9；从测试单列表进入）。 */
export function TestRunCreateModal({
  productId,
  open,
  onClose,
  onCreated,
}: {
  productId: number
  open: boolean
  onClose: () => void
  onCreated?: ((item: TestRunView) => void) | undefined
}) {
  return <TestRunFormModal productId={productId} testRun={null} open={open} onClose={onClose} onSaved={onCreated} />
}
