import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { TextAreaField } from '../../../shared/form-fields'
import { runTestRunAction, type TestRunAction, type TestRunView } from '../api/quality.api'

/**
 * start/block/activate 通用确认弹窗（T-9 / quality §4.3）。
 * 偏差说明：卡面写的 design-system `ConfirmAction` 不存在，改用确认弹窗承载（范式同 task-close-modal）；
 * start 无请求体（§5），block/activate 只收 comment。
 */
const confirmSchema = z.object({ comment: z.string() })

export type TestRunConfirmFormValues = z.input<typeof confirmSchema>

export function TestRunConfirmModal({
  testRun,
  action,
  open,
  onClose,
}: {
  testRun: TestRunView | null
  action: TestRunAction
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { control, handleSubmit } = useForm<TestRunConfirmFormValues>({
    resolver: zodResolver(confirmSchema),
    defaultValues: { comment: '' },
  })

  const submit = useMutation({
    mutationFn: (values: TestRunConfirmFormValues) => {
      if (!testRun) {
        throw new Error('test run confirm modal: no test run')
      }
      return runTestRunAction(testRun.id, action, values.comment === '' ? null : values.comment)
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
      title={t(`testRun.action.${action}`)}
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
      <Typography.Paragraph>{testRun?.name ?? ''}</Typography.Paragraph>
      <Form layout="vertical">
        {action === 'start' ? null : (
          <TextAreaField
            control={control}
            name="comment"
            label={t('common.field.comment')}
            aria-label={`test-run-${action}-comment`}
          />
        )}
      </Form>
      {submit.error ? (
        <Typography.Paragraph type="danger">{errorText(submit.error, t, 'common.message.failed')}</Typography.Paragraph>
      ) : null}
    </Modal>
  )
}
