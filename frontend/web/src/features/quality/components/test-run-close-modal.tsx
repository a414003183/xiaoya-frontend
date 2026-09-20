import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, TextAreaField } from '../../../shared/form-fields'
import { closeTestRunAction, type TestRunView } from '../api/quality.api'
import { closeDateError } from '../model'

/**
 * 关单守卫（§4.3，口径同后端）：realFinishedAt 必填、≥ beginDate、≤ endDate 次日；
 * message 直接落 i18n key（testRun.message.closeDate*），由 shared/form-fields 翻译成中文错误。
 * 三条 refine 共用 closeDateError（model.ts 唯一守卫实现），每种越界各出一句提示。
 */
export function closeRunSchema(beginDate: string | undefined, endDate: string | undefined) {
  const passes = (suffix: string) => (value: string) => closeDateError(beginDate, endDate, value) !== suffix
  return z.object({
    realFinishedAt: z
      .string()
      .refine(passes('required'), { message: 'testRun.message.closeDateRequired' })
      .refine(passes('beforeBegin'), { message: 'testRun.message.closeDateBeforeBegin' })
      .refine(passes('afterNextDay'), { message: 'testRun.message.closeDateAfterNextDay' }),
    comment: z.string(),
  })
}

export type TestRunCloseFormValues = z.input<ReturnType<typeof closeRunSchema>>

/** 提交体（§5 TestRunCloseRequest）：realFinishedAt 为 date-time，日期字段补零点 UTC 时刻。 */
export function closeRunBody(values: TestRunCloseFormValues): { realFinishedAt: string; comment: string | null } {
  const day = values.realFinishedAt.slice(0, 10)
  return {
    realFinishedAt: values.realFinishedAt.includes('T') ? values.realFinishedAt : `${day}T00:00:00Z`,
    comment: values.comment === '' ? null : values.comment,
  }
}

/** 关闭测试单弹窗（T-9 / quality §4.3：wait|doing|blocked → done，日期守卫前端提示 + 服务端 42201 兜底）。 */
export function TestRunCloseModal({
  testRun,
  open,
  onClose,
}: {
  testRun: TestRunView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { control, handleSubmit } = useForm<TestRunCloseFormValues>({
    resolver: zodResolver(closeRunSchema(testRun?.beginDate, testRun?.endDate)),
    defaultValues: { realFinishedAt: new Date().toISOString().slice(0, 10), comment: '' },
  })

  const submit = useMutation({
    mutationFn: (values: TestRunCloseFormValues) => {
      if (!testRun) {
        throw new Error('test run close modal: no test run')
      }
      return closeTestRunAction(testRun.id, closeRunBody(values))
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listTestRuns'] })
      void queryClient.invalidateQueries({ queryKey: ['getTestRun'] })
      void queryClient.invalidateQueries({ queryKey: ['listTestRunActivities'] })
      onClose()
    },
  })
  const run = handleSubmit((values) => submit.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={t('testRun.action.close')}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" loading={submit.isPending} onClick={() => void run()}>
            {t('common.action.submit')}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <DateField
          control={control}
          name="realFinishedAt"
          label={t('testRun.field.realFinishedAt')}
          aria-label="test-run-real-finished"
        />
        <TextAreaField
          control={control}
          name="comment"
          label={t('common.field.comment')}
          aria-label="test-run-close-comment"
        />
        {submit.error ? (
          <Typography.Paragraph type="danger">
            {errorText(submit.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
