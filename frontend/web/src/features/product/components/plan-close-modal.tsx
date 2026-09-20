import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Radio, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { closePlanAction, type PlanView } from '../api/product.api'

/** 计划关闭弹窗（plan §4.3：closedReason 单选 done/cancel，closedReason=done 同时落 finishedAt）。 */
export function PlanCloseModal({ plan, open, onClose }: { plan: PlanView | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [closedReason, setClosedReason] = useState('done')
  const [comment, setComment] = useState('')
  // closedReason 选项唯一来源（03 §5）：从 meta 取，前端不留清单。
  const planMeta = useDomainMeta('plan')

  const submit = useMutation({
    mutationFn: async () => {
      if (!plan) {
        return null
      }
      // 值域来自 meta（动态字符串），提交前收窄回契约联合类型；真校验仍在后端。
      return closePlanAction(plan.id, closedReason as 'done' | 'cancel', comment)
    },
    onSuccess: () => {
      setComment('')
      void queryClient.invalidateQueries({ queryKey: ['listPlans'] })
      void queryClient.invalidateQueries({ queryKey: ['getPlan'] })
      void queryClient.invalidateQueries({ queryKey: ['listPlanActivities'] })
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      title={t('plan.action.close')}
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
        <Form.Item label={t('plan.field.closedReason')}>
          <Radio.Group
            value={closedReason}
            onChange={(event) => setClosedReason(String(event.target.value))}
            options={metaOptions(planMeta.data, 'closedReason', t)}
          />
        </Form.Item>
        <Form.Item label={t('common.field.comment')}>
          <Input.TextArea
            aria-label="plan-close-comment"
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
