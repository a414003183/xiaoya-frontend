import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Select, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type BugView, confirmBugAction, fetchAccountOptions } from '../api/quality.api'

/** Bug 确认弹窗（T-3 / quality §4.1：可顺带改派 assignee）。 */
export function BugConfirmModal({ bug, open, onClose }: { bug: BugView | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [assignee, setAssignee] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const submit = useMutation({
    mutationFn: async () => {
      if (!bug) {
        return null
      }
      return confirmBugAction(bug.id, { ...(assignee ? { assignee } : {}), comment: comment || null })
    },
    onSuccess: () => {
      setComment('')
      void queryClient.invalidateQueries({ queryKey: ['getBug'] })
      void queryClient.invalidateQueries({ queryKey: ['listBugs'] })
      void queryClient.invalidateQueries({ queryKey: ['listBugActivities'] })
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      title={t('bug.action.confirm')}
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
        <Form.Item label={t('bug.field.assignee')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            aria-label="bug-confirm-assignee"
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
            aria-label="bug-confirm-comment"
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
