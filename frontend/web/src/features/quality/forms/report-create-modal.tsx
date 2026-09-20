import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { ReportView } from '@zentao/api-client/generated/model/reportView'
import { Checkbox, Form, Input, Modal, Select, Typography, useMessage } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { fetchExecution, fetchProjectProducts } from '../../project'
import { fetchAccountOptions, fetchTestRuns, patchReport, submitReport } from '../api/quality.api'

export type ReportFormValues = {
  title: string
  testRunIds: number[]
  beginDate: string
  endDate: string
  owner: string | null
  content: string | null
}

/** 提交体（quality §3.6）：executionId 由路由定死，创建后不可改（PATCH 白名单不含它）。 */
export function reportSubmitBody(values: ReportFormValues): Record<string, unknown> {
  return {
    title: values.title.trim(),
    testRunIds: values.testRunIds,
    beginDate: values.beginDate,
    endDate: values.endDate,
    owner: values.owner,
    content: values.content === '' ? null : values.content,
  }
}

/** 测试报告创建/编辑共用表单壳（T-10；关联测试单勾选自所属执行，正文为不透明文本）。 */
export function ReportFormModal({
  executionId,
  report,
  open,
  onClose,
  onSaved,
}: {
  executionId: number
  report?: ReportView | null
  open: boolean
  onClose: () => void
  onSaved?: ((item: ReportView) => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<ReportFormValues>()
  const editing = report != null
  const today = new Date().toISOString().slice(0, 10)

  // 执行 id 来自路由；候选测试单 = 该执行所属项目的产品下的测试单（按 executionId 过滤）
  const execution = useQuery({
    queryKey: ['getExecution', executionId, 'report-form'],
    queryFn: () => fetchExecution(executionId),
    enabled: open,
  })
  const projectId = execution.data?.parentId ?? 0
  const products = useQuery({
    queryKey: ['listProjectProducts', projectId, 'report-form'],
    queryFn: () => fetchProjectProducts(projectId, { limit: 200 }),
    enabled: open && execution.data != null,
  })
  const productIds = (products.data?.items ?? []).map((product) => product.id)
  const runs = useQuery({
    queryKey: ['listTestRuns', executionId, 'report-form', productIds.join(',')],
    queryFn: async () => {
      const pages = await Promise.all(
        productIds.map((productId) => fetchTestRuns(productId, { limit: 200, filters: { executionId } })),
      )
      return pages.flatMap((page) => page.items)
    },
    enabled: open && products.data != null && productIds.length > 0,
  })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions, enabled: open })

  const save = useMutation({
    mutationFn: (values: ReportFormValues) =>
      editing
        ? patchReport(report.id, { ...reportSubmitBody(values), lockVersion: report.lockVersion })
        : submitReport(executionId, reportSubmitBody(values)),
    onSuccess: (saved) => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listExecutionReports'] })
      void queryClient.invalidateQueries({ queryKey: ['getReport'] })
      void queryClient.invalidateQueries({ queryKey: ['getTestRun'] }) // reportId 回填（§3.6）
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
      width={640}
      title={editing ? t('report.action.edit') : t('report.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        key={report?.id ?? 'create'}
        layout="vertical"
        initialValues={{
          title: report?.title ?? '',
          testRunIds: report?.testRunIds ?? [],
          beginDate: report?.beginDate ?? today,
          endDate: report?.endDate ?? today,
          owner: report?.owner ?? null,
          content: report?.content ?? null,
        }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="title"
          label={t('report.field.title')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="report-title" maxLength={255} />
        </Form.Item>
        <Form.Item
          name="beginDate"
          label={t('report.field.beginDate')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="report-begin-date" placeholder="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item
          name="endDate"
          label={t('report.field.endDate')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="report-end-date" placeholder="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item name="owner" label={t('report.field.owner')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            aria-label="report-owner"
            options={(accounts.data ?? []).map((account) => ({
              value: account.account,
              label: `${account.realName}（${account.account}）`,
            }))}
          />
        </Form.Item>
        <Form.Item name="testRunIds" label={t('report.field.testRuns')}>
          <Checkbox.Group
            aria-label="report-runs"
            options={(runs.data ?? []).map((run) => ({ value: run.id, label: `#${run.id} ${run.name}` }))}
          />
        </Form.Item>
        <Form.Item name="content" label={t('report.field.content')}>
          <Input.TextArea aria-label="report-content" rows={8} />
        </Form.Item>
        {editing ? (
          <Typography.Paragraph type="secondary">{t('report.message.executionFixed')}</Typography.Paragraph>
        ) : null}
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

/** 测试报告创建弹窗（T-10；从执行报告列表进入，勾选测试单生成）。 */
export function ReportCreateModal({
  executionId,
  open,
  onClose,
  onCreated,
}: {
  executionId: number
  open: boolean
  onClose: () => void
  onCreated?: ((item: ReportView) => void) | undefined
}) {
  return <ReportFormModal executionId={executionId} report={null} open={open} onClose={onClose} onSaved={onCreated} />
}
