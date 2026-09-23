import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { ReportView } from '@zentao/api-client/generated/model/reportView'
import { Checkbox, Form, Modal, Typography, useMessage } from '@zentao/design-system'
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
import { fetchExecution, fetchProjectProducts } from '../../project'
import { fetchAccountOptions, fetchTestRuns, patchReport, submitReport } from '../api/quality.api'

export const reportFormSchema = z.object({
  title: z.string().min(1, 'common.message.required'),
  testRunIds: z.array(z.number()),
  beginDate: z.string().min(1, 'common.message.required'),
  endDate: z.string().min(1, 'common.message.required'),
  owner: z.string().nullable(),
  content: z.string().nullable(),
})

export type ReportFormValues = z.input<typeof reportFormSchema>

function valuesOf(report: ReportView | null): ReportFormValues {
  const today = new Date().toISOString().slice(0, 10)
  return {
    title: report?.title ?? '',
    testRunIds: report?.testRunIds ?? [],
    beginDate: report?.beginDate ?? today,
    endDate: report?.endDate ?? today,
    owner: report?.owner ?? null,
    content: report?.content ?? null,
  }
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
  const editing = report != null
  const { control, handleSubmit, setError, reset } = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: valuesOf(report ?? null),
  })

  // 切换新建/编辑对象时重置表单（defaultValues 只在首挂载生效）
  useEffect(() => {
    reset(valuesOf(report ?? null))
  }, [report, reset])

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
    onError: (error) => applyServerFields(error, setError),
  })

  const submit = handleSubmit((values) => save.mutate(values))

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
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="title"
          label={t('report.field.title')}
          maxLength={255}
          aria-label="report-title"
        />
        <DateField
          control={control}
          name="beginDate"
          label={t('report.field.beginDate')}
          aria-label="report-begin-date"
        />
        <DateField control={control} name="endDate" label={t('report.field.endDate')} aria-label="report-end-date" />
        <SelectField
          control={control}
          name="owner"
          label={t('report.field.owner')}
          options={(accounts.data ?? []).map((account) => ({
            value: account.account,
            label: `${account.realName}（${account.account}）`,
          }))}
          aria-label="report-owner"
        />
        <Controller
          control={control}
          name="testRunIds"
          render={({ field, fieldState }) => (
            <Form.Item label={t('report.field.testRuns')} {...errorProps(fieldState.error, t)}>
              <Checkbox.Group
                aria-label="report-runs"
                options={(runs.data ?? []).map((run) => ({ value: run.id, label: `#${run.id} ${run.name}` }))}
                value={field.value}
                onChange={(next) => field.onChange(next)}
              />
            </Form.Item>
          )}
        />
        <TextAreaField
          control={control}
          name="content"
          label={t('report.field.content')}
          rows={8}
          aria-label="report-content"
        />
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
