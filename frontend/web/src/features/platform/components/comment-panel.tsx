import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, Input, Space, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutationFeedback } from '../../../shared/use-mutation-feedback'
import { fetchComments, submitComment } from '../api/platform.api'

/** 评论面板（platform 卡 §6：嵌入各域详情页；列表 + 输入框）。 */
export function CommentPanel({ objectType, objectId }: { objectType: string; objectId: number }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const feedback = useMutationFeedback()
  const [content, setContent] = useState('')
  const queryKey = ['listComments', objectType, objectId] as const
  const comments = useQuery({
    queryKey,
    queryFn: () => fetchComments({ objectType, objectId }),
  })
  const submit = useMutation({
    mutationFn: () => submitComment({ objectType, objectId, content }),
    onSuccess: () => {
      setContent('')
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: feedback.failed,
  })

  const items = comments.data?.items ?? []

  return (
    <div className="tw:flex tw:flex-col tw:gap-3">
      <Typography.Title level={5} className="tw:!mb-0">
        {t('platform.comment.title')}
      </Typography.Title>
      {items.length === 0 ? (
        <EmptyState description={t('platform.comment.empty')} />
      ) : (
        <ul className="tw:m-0 tw:list-none tw:p-0 tw:flex tw:flex-col tw:gap-2">
          {items.map((comment) => (
            <li key={comment.id} className="tw:border-b tw:border-solid tw:border-border tw:pb-2">
              <Typography.Text strong>{comment.createdBy}</Typography.Text>
              <Typography.Text type="secondary" className="tw:ml-2">
                {new Date(comment.createdAt).toLocaleString()}
              </Typography.Text>
              <div>
                <Typography.Text>{comment.content}</Typography.Text>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Space.Compact className="tw:w-full">
        <Input
          aria-label={t('platform.comment.placeholder')}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onPressEnter={() => {
            if (content.trim().length > 0) {
              submit.mutate()
            }
          }}
        />
        <Button
          type="primary"
          loading={submit.isPending}
          disabled={content.trim().length === 0}
          onClick={() => submit.mutate()}
        >
          {t('platform.comment.submit')}
        </Button>
      </Space.Compact>
    </div>
  )
}
