import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Select, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { assignBugAction, type BugView, fetchAccountOptions } from '../api/quality.api'

/** Bug 指派弹窗（T-3 / quality §4.1：assignee 必填，任意非 closed 可指派）。 */
export function BugAssignModal({ bug, open, onClose }: { bug: BugView | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [assignee, setAssignee] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const submit = useMutation({
    mutationFn: async () => {
      if (!bug || !assignee) {
        return null
      }
      return assignBugAction(bug.id, { assignee, comment: comment || null })
    },
    onSuccess: () => {
      setComment('')
      void queryClient.invalidateQueries({ queryKey: ['getBug'] })
      void queryClient.invalidateQueries({ queryKey: ['listBugs'] })
      void queryClient.invalidateQueries({ queryKey: ['listBugActivities'] })
      onClose()
    },
  })

  const missingAssignee = assignee === null

  return (
    <Modal
      open={open}
      title={t('bug.action.assign')}
      onCancel={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" disabled={missingAssignee} loading={submit.isPending} onClick={() => submit.mutate()}>
            {t('common.action.submit')}
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        <Form.Item
          label={t('bug.field.assignee')}
          required
          validateStatus={missingAssignee ? 'error' : ''}
          help={missingAssignee ? t('bug.message.assigneeRequired') : undefined}
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            aria-label="bug-assign-assignee"
            value={assignee ?? undefined}
            placeholder={bug?.assignee ?? undefined}
            onChange={(value) => setAssignee(value ?? null)}
            options={(accounts.data ?? []).map((account) => ({
              value: account.account,
              label: `${account.realName}(${account.account})`,
            }))}
          />
        </Form.Item>
        <Form.Item label={t('common.field.comment')}>
          <Input.TextArea
            aria-label="bug-assign-comment"
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
