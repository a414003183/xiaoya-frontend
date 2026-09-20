import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Select, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fetchAccountOptions,
  passStoryAction,
  rejectStoryAction,
  type StoryView,
  submitReviewAction,
} from '../api/story.api'
import type { ReviewMode } from '../model'

/** 评审弹窗（T-5 三合一：submit-review / pass / reject，按 meta actions 传入 mode）。 */
export function StoryReviewModal({
  story,
  mode,
  open,
  onClose,
}: {
  story: StoryView | null
  mode: ReviewMode | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [reviewers, setReviewers] = useState<string[]>([])
  const [comment, setComment] = useState('')

  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const submit = useMutation({
    mutationFn: async () => {
      if (!story || !mode) {
        return null
      }
      const selected = reviewers.length > 0 ? reviewers : (story.reviewers ?? [])
      switch (mode) {
        case 'submit-review':
          return submitReviewAction(story.id, { reviewers: selected, comment })
        case 'pass':
          return passStoryAction(story.id, comment)
        default:
          return rejectStoryAction(story.id, comment)
      }
    },
    onSuccess: () => {
      setComment('')
      void queryClient.invalidateQueries({ queryKey: ['getStory'] })
      void queryClient.invalidateQueries({ queryKey: ['listStories'] })
      void queryClient.invalidateQueries({ queryKey: ['listStoryActivities'] })
      onClose()
    },
  })

  const title =
    mode === 'pass'
      ? t('story.action.pass')
      : mode === 'reject'
        ? t('story.action.reject')
        : t('story.action.submitReview')
  const rejectMissingComment = mode === 'reject' && comment.trim().length === 0
  const submitMissingReviewers =
    mode === 'submit-review' &&
    (story?.needNotReview ?? false) === false &&
    reviewers.length === 0 &&
    (story?.reviewers ?? []).length === 0

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button
            type="primary"
            disabled={rejectMissingComment || submitMissingReviewers}
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {t('common.action.submit')}
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        {mode === 'submit-review' ? (
          <Form.Item label={t('story.field.reviewers')} required>
            <Select
              mode="multiple"
              allowClear
              aria-label="story-reviewers"
              optionFilterProp="label"
              value={reviewers}
              placeholder={(story?.reviewers ?? []).join(',')}
              onChange={(value) => setReviewers(value)}
              options={(accounts.data ?? []).map((account) => ({
                value: account.account,
                label: `${account.realName}(${account.account})`,
              }))}
            />
          </Form.Item>
        ) : null}
        <Form.Item
          label={t('common.field.comment')}
          required={mode === 'reject'}
          validateStatus={rejectMissingComment ? 'error' : ''}
          help={rejectMissingComment ? t('story.message.rejectCommentRequired') : undefined}
        >
          <Input.TextArea
            aria-label="story-review-comment"
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
