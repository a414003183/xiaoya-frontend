import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Radio, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { reviewTestCaseAction, type TestCaseView } from '../api/quality.api'

/** 用例评审弹窗（T-5 / quality §4.2：result=pass 进 normal、clarify 保持 wait，仅 wait 可评审）。 */
export function TestCaseReviewModal({
  testCase,
  open,
  onClose,
}: {
  testCase: TestCaseView | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [result, setResult] = useState<'pass' | 'clarify'>('pass')
  const [comment, setComment] = useState('')

  const submit = useMutation({
    mutationFn: async () => {
      if (!testCase) {
        return null
      }
      return reviewTestCaseAction(testCase.id, { result, comment: comment || null })
    },
    onSuccess: () => {
      setComment('')
      void queryClient.invalidateQueries({ queryKey: ['getTestCase'] })
      void queryClient.invalidateQueries({ queryKey: ['listTestCases'] })
      void queryClient.invalidateQueries({ queryKey: ['listTestCaseActivities'] })
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      title={t('testCase.action.review')}
      onCancel={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
            {t('common.action.submit')}
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        <Form.Item label={t('testCase.field.reviewResult')} required>
          <Radio.Group
            value={result}
            onChange={(event) => setResult(event.target.value as 'pass' | 'clarify')}
            options={[
              { value: 'pass', label: t('testCase.review.pass') },
              { value: 'clarify', label: t('testCase.review.clarify') },
            ]}
          />
        </Form.Item>
        <Form.Item label={t('common.field.comment')}>
          <Input.TextArea
            aria-label="case-review-comment"
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
