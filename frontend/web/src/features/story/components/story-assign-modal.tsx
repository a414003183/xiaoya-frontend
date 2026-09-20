import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Select, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { assignStoryAction, fetchAccountOptions, type StoryView } from '../api/story.api'

/** 需求指派弹窗（T-5；requirement §4：assignee 必填，落 assignee/assignedAt）。 */
export function StoryAssignModal({
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
  const [assignee, setAssignee] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const submit = useMutation({
    mutationFn: async () => {
      if (!story || !assignee) {
        return null
      }
      return assignStoryAction(story.id, { assignee, comment })
    },
    onSuccess: () => {
      setComment('')
      void queryClient.invalidateQueries({ queryKey: ['getStory'] })
      void queryClient.invalidateQueries({ queryKey: ['listStories'] })
      void queryClient.invalidateQueries({ queryKey: ['listStoryActivities'] })
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      title={t('story.action.assign')}
      onCancel={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button
            type="primary"
            disabled={assignee === null}
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {t('common.action.submit')}
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        <Form.Item
          label={t('story.field.assignee')}
          required
          validateStatus={assignee === null ? 'error' : ''}
          help={assignee === null ? t('story.message.assigneeRequired') : undefined}
        >
          <Select
            showSearch
            allowClear
            optionFilterProp="label"
            aria-label="story-assignee"
            value={assignee ?? undefined}
            onChange={(value) => setAssignee(value ?? null)}
            options={(accounts.data ?? []).map((account) => ({
              value: account.account,
              label: `${account.realName}(${account.account})`,
            }))}
          />
        </Form.Item>
        <Form.Item label={t('common.field.comment')}>
          <Input.TextArea
            aria-label="story-assign-comment"
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
