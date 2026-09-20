import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { activateProductAction, closeProductAction, type ProductView } from '../api/product.api'

/** 产品结束/激活二合一弹窗（product §4.1：按 meta actions 传入的 action 切换）。 */
export function ProductCloseModal({
  product,
  action,
  open,
  onClose,
}: {
  product: ProductView | null
  action: 'close' | 'activate' | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')

  const submit = useMutation({
    mutationFn: async () => {
      if (!product || !action) {
        return null
      }
      return action === 'close' ? closeProductAction(product.id, comment) : activateProductAction(product.id, comment)
    },
    onSuccess: () => {
      setComment('')
      void queryClient.invalidateQueries({ queryKey: ['listProducts'] })
      void queryClient.invalidateQueries({ queryKey: ['getProduct'] })
      void queryClient.invalidateQueries({ queryKey: ['listProductActivities'] })
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      title={action === 'activate' ? t('product.action.activate') : t('product.action.close')}
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
        <Form.Item label={t('common.field.comment')}>
          <Input.TextArea
            aria-label="product-close-comment"
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
