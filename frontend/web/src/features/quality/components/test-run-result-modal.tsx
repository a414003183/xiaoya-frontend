import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Radio, Space, Typography, useMessage } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type ResultView, recordRunResult } from '../api/quality.api'
import { TEST_RUN_RESULTS } from '../model'

/**
 * 登记执行结果弹窗（T-9 / quality §4.3 record-result）：
 * 四态按钮 pass|fail|blocked|n/a + comment；同 (testRun, case) 幂等 upsert 由服务端保证，
 * 成功后失效执行清单与用例详情/列表（lastRun 三字段同步可见）。
 */
export function TestRunResultModal({
  testRunId,
  run,
  open,
  onClose,
}: {
  testRunId: number
  run: ResultView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [result, setResult] = useState<string>('pass')
  const [comment, setComment] = useState('')

  const submit = useMutation({
    mutationFn: async () => {
      if (!run) {
        return null
      }
      return recordRunResult(testRunId, run.testCaseId, { result, comment: comment === '' ? null : comment })
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      setComment('')
      // 行内即时刷新：执行清单 + 用例 lastRun（§3.5 副作用）
      void queryClient.invalidateQueries({ queryKey: ['listTestRunCases'] })
      void queryClient.invalidateQueries({ queryKey: ['getTestCase'] })
      void queryClient.invalidateQueries({ queryKey: ['listTestCases'] })
      onClose()
    },
  })

  const close = () => {
    setComment('')
    onClose()
  }

  return (
    <Modal
      open={open}
      forceRender
      title={t('testRun.action.recordResult')}
      onCancel={close}
      footer={
        <Space>
          <Button onClick={close}>{t('common.action.cancel')}</Button>
          <Button type="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
            {t('common.action.submit')}
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">{run?.caseTitle ?? ''}</Typography.Paragraph>
      <Form layout="vertical">
        <Form.Item label={t('testRun.field.result')} required>
          <Radio.Group value={result} onChange={(event) => setResult(String(event.target.value))}>
            <Space wrap>
              {TEST_RUN_RESULTS.map((value) => (
                <Radio.Button key={value} value={value} aria-label={`run-result-${value}`}>
                  {t(`testCase.result.${value}`)}
                </Radio.Button>
              ))}
            </Space>
          </Radio.Group>
        </Form.Item>
        <Form.Item label={t('common.field.comment')}>
          <Input.TextArea
            aria-label="run-result-comment"
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </Form.Item>
      </Form>
      {submit.error ? (
        <Typography.Paragraph type="danger">{errorText(submit.error, t, 'common.message.failed')}</Typography.Paragraph>
      ) : null}
    </Modal>
  )
}
