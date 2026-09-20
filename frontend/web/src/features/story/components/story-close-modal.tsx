import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { StoryCloseRequest } from '@zentao/api-client/generated/model/storyCloseRequest'
import { Button, Form, Input, Modal, Radio, Select, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { closeStoryAction, fetchStories, type StoryView } from '../api/story.api'
import { requiresDuplicate } from '../model'

/** 需求关闭弹窗（T-5；requirement §4：closedReason 必填，=duplicate 时 duplicateOfId 必填）。 */
export function StoryCloseModal({
  story,
  open,
  onClose,
}: {
  story: StoryView | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [closedReason, setClosedReason] = useState('done')
  const [duplicateOfId, setDuplicateOfId] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  // closedReason 选项唯一来源（03 §5）：从 meta 取，前端不留清单。
  const storyMeta = useDomainMeta('story')

  const candidates = useQuery({
    queryKey: ['listStories', story?.productId, 'duplicate'],
    queryFn: () => fetchStories(story?.productId ?? 0, { limit: 200 }),
    enabled: story != null,
  })
  const submit = useMutation({
    mutationFn: async () => {
      if (!story) {
        return null
      }
      // 值域来自 meta（动态字符串），提交前收窄回契约联合类型；真鉴权/真校验仍在后端。
      return closeStoryAction(story.id, {
        closedReason: closedReason as StoryCloseRequest['closedReason'],
        duplicateOfId,
        comment,
      })
    },
    onSuccess: () => {
      setComment('')
      void queryClient.invalidateQueries({ queryKey: ['getStory'] })
      void queryClient.invalidateQueries({ queryKey: ['listStories'] })
      void queryClient.invalidateQueries({ queryKey: ['listStoryActivities'] })
      onClose()
    },
  })

  const missingDuplicate = requiresDuplicate(closedReason) && duplicateOfId === null

  return (
    <Modal
      open={open}
      title={t('story.action.close')}
      onCancel={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" disabled={missingDuplicate} loading={submit.isPending} onClick={() => submit.mutate()}>
            {t('common.action.submit')}
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        <Form.Item label={t('story.field.closedReason')}>
          <Radio.Group
            value={closedReason}
            onChange={(event) => setClosedReason(String(event.target.value))}
            options={metaOptions(storyMeta.data, 'closedReason', t)}
          />
        </Form.Item>
        {requiresDuplicate(closedReason) ? (
          <Form.Item
            label={t('story.field.duplicateOf')}
            required
            validateStatus={missingDuplicate ? 'error' : ''}
            help={missingDuplicate ? t('story.message.duplicateRequired') : undefined}
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              aria-label="story-duplicate-of"
              value={duplicateOfId ?? undefined}
              onChange={(value) => setDuplicateOfId(value ?? null)}
              options={(candidates.data?.items ?? [])
                .filter((item) => item.id !== story?.id)
                .map((item) => ({ value: item.id, label: `#${item.id} ${item.title}` }))}
            />
          </Form.Item>
        ) : null}
        <Form.Item label={t('common.field.comment')}>
          <Input.TextArea
            aria-label="story-close-comment"
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
