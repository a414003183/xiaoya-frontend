import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Select, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { activateBugAction, type BugView, fetchAccountOptions } from '../api/quality.api'
import { activateAssigneeFallback } from '../model'

/** Bug 重开弹窗（T-3 / quality §4.1：openedBuilds 必填；assignee 缺省回派原解决人）。 */
export function BugActivateModal({ bug, open, onClose }: { bug: BugView | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [openedBuilds, setOpenedBuilds] = useState('')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const fallback = activateAssigneeFallback(bug?.resolvedBy)
  const missingBuilds = openedBuilds.trim().length === 0

  const submit = useMutation({
    mutationFn: async () => {
      if (!bug) {
        return null
      }
      return activateBugAction(bug.id, {
        openedBuilds,
        ...(assignee ? { assignee } : {}),
        comment: comment || null,
      })
    },
    onSuccess: () => {
      setComment('')
      setOpenedBuilds('')
      void queryClient.invalidateQueries({ queryKey: ['getBug'] })
      void queryClient.invalidateQueries({ queryKey: ['listBugs'] })
      void queryClient.invalidateQueries({ queryKey: ['listBugActivities'] })
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      title={t('bug.action.activate')}
      onCancel={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" disabled={missingBuilds} loading={submit.isPending} onClick={() => submit.mutate()}>
            {t('common.action.submit')}
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        <Form.Item
          label={t('bug.field.openedBuilds')}
          required
          validateStatus={missingBuilds ? 'error' : ''}
          help={missingBuilds ? t('bug.message.openedBuildsRequired') : undefined}
        >
          <Input
            aria-label="bug-activate-builds"
            maxLength={255}
            value={openedBuilds}
            placeholder={bug?.openedBuilds ?? undefined}
            onChange={(event) => setOpenedBuilds(event.target.value)}
          />
        </Form.Item>
        <Form.Item
          label={t('bug.field.assignee')}
          extra={fallback ? t('bug.message.activateAssigneeFallback', { account: fallback }) : undefined}
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            aria-label="bug-activate-assignee"
            value={assignee ?? undefined}
            placeholder={fallback ?? undefined}
            onChange={(value) => setAssignee(value ?? null)}
            options={(accounts.data ?? []).map((account) => ({
              value: account.account,
              label: `${account.realName}(${account.account})`,
            }))}
          />
        </Form.Item>
        <Form.Item label={t('common.field.comment')}>
          <Input.TextArea
            aria-label="bug-activate-comment"
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
