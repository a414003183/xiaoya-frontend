import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { TestRunView } from '@zentao/api-client/generated/model/testRunView'
import { Form, Input, Modal, Select, Typography, useMessage } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchBuilds } from '../../product'
import { fetchExecutions } from '../../project'
import { fetchAccountOptions, patchTestRun, submitTestRun } from '../api/quality.api'

export type TestRunFormValues = {
  name: string
  executionId: number | null
  priority: number
  type: string | null
  beginDate: string
  endDate: string
  owner: string | null
  buildId: number | null
  description: string | null
  members: string[]
  notifyAccounts: string[]
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
  const [form] = Form.useForm<TestRunFormValues>()
  const editing = testRun != null
  const today = new Date().toISOString().slice(0, 10)
  // 枚举字段选项唯一来源（03 §5）：priority/type 从 meta 取，前端不留清单。
  const runMeta = useDomainMeta('testRun')

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
  })

  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}（${account.account}）`,
  }))

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
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        key={testRun?.id ?? 'create'}
        layout="vertical"
        initialValues={{
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
        }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="name"
          label={t('testRun.field.name')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="test-run-name" maxLength={90} />
        </Form.Item>
        <Form.Item
          name="executionId"
          label={t('testRun.field.execution')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            disabled={editing}
            aria-label="test-run-execution"
            options={(executions.data?.items ?? []).map((execution) => ({
              value: execution.id,
              label: execution.name,
            }))}
          />
        </Form.Item>
        <Form.Item name="priority" label={t('testRun.field.priority')}>
          <Select aria-label="test-run-priority" options={metaNumberOptions(runMeta.data, 'priority', t)} />
        </Form.Item>
        <Form.Item name="type" label={t('testRun.field.type')}>
          <Select allowClear aria-label="test-run-type" options={metaOptions(runMeta.data, 'type', t)} />
        </Form.Item>
        <Form.Item
          name="beginDate"
          label={t('testRun.field.beginDate')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="test-run-begin-date" placeholder="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item
          name="endDate"
          label={t('testRun.field.endDate')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="test-run-end-date" placeholder="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item name="owner" label={t('testRun.field.owner')}>
          <Select allowClear showSearch optionFilterProp="label" aria-label="test-run-owner" options={accountOptions} />
        </Form.Item>
        <Form.Item name="buildId" label={t('testRun.field.build')}>
          <Select
            allowClear
            aria-label="test-run-build"
            options={[
              { value: 0, label: t('common.field.none') },
              ...(builds.data?.items ?? []).map((build) => ({ value: build.id, label: build.name })),
            ]}
          />
        </Form.Item>
        <Form.Item name="members" label={t('testRun.field.members')}>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            aria-label="test-run-members"
            options={accountOptions}
          />
        </Form.Item>
        <Form.Item name="notifyAccounts" label={t('testRun.field.notify')}>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            aria-label="test-run-notify"
            options={accountOptions}
          />
        </Form.Item>
        <Form.Item name="description" label={t('testRun.field.description')}>
          <Input.TextArea aria-label="test-run-description" rows={3} />
        </Form.Item>
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
