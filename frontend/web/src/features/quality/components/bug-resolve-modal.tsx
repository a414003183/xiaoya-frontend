import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Radio, Select, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { type BugView, fetchAccountOptions, fetchBugs, resolveBugAction } from '../api/quality.api'
import { requiresDuplicateOf, requiresResolvedBuild } from '../model'

/** Bug 解决弹窗（T-3 / quality §4.1：resolution 必填；=duplicate 联动 duplicateOfId 必填、=fixed 联动 resolvedBuild 必填）。 */
export function BugResolveModal({ bug, open, onClose }: { bug: BugView | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [resolution, setResolution] = useState('fixed')
  const [resolvedBuild, setResolvedBuild] = useState('')
  const [duplicateOfId, setDuplicateOfId] = useState<number | null>(null)
  const [assignee, setAssignee] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  // resolution 选项唯一来源（03 §5）：从 meta 取，前端不留清单。
  const bugMeta = useDomainMeta('bug')

  const candidates = useQuery({
    queryKey: ['listBugs', bug?.productId, 'duplicate'],
    queryFn: () => fetchBugs(bug?.productId ?? 0, { limit: 200 }),
    enabled: bug != null,
  })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })

  const submit = useMutation({
    mutationFn: async () => {
      if (!bug) {
        return null
      }
      return resolveBugAction(bug.id, {
        resolution,
        ...(requiresResolvedBuild(resolution) ? { resolvedBuild } : {}),
        ...(requiresDuplicateOf(resolution) ? { duplicateOfId } : {}),
        ...(assignee ? { assignee } : {}),
        comment: comment || null,
      })
    },
    onSuccess: () => {
      setComment('')
      void queryClient.invalidateQueries({ queryKey: ['getBug'] })
      void queryClient.invalidateQueries({ queryKey: ['listBugs'] })
      void queryClient.invalidateQueries({ queryKey: ['listBugActivities'] })
      onClose()
    },
  })

  const missingBuild = requiresResolvedBuild(resolution) && resolvedBuild.trim().length === 0
  const missingDuplicate = requiresDuplicateOf(resolution) && duplicateOfId === null
  const submitDisabled = missingBuild || missingDuplicate

  return (
    <Modal
      open={open}
      title={t('bug.action.resolve')}
      onCancel={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" disabled={submitDisabled} loading={submit.isPending} onClick={() => submit.mutate()}>
            {t('common.action.submit')}
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        <Form.Item label={t('bug.field.resolution')} required>
          <Radio.Group
            value={resolution}
            onChange={(event) => setResolution(event.target.value as string)}
            options={metaOptions(bugMeta.data, 'resolution', t)}
          />
        </Form.Item>
        {requiresResolvedBuild(resolution) ? (
          <Form.Item
            label={t('bug.field.resolvedBuild')}
            required
            validateStatus={missingBuild ? 'error' : ''}
            help={missingBuild ? t('bug.message.resolvedBuildRequired') : undefined}
          >
            <Input
              aria-label="bug-resolved-build"
              maxLength={90}
              value={resolvedBuild}
              onChange={(event) => setResolvedBuild(event.target.value)}
            />
          </Form.Item>
        ) : null}
        {requiresDuplicateOf(resolution) ? (
          <Form.Item
            label={t('bug.field.duplicateOf')}
            required
            validateStatus={missingDuplicate ? 'error' : ''}
            help={missingDuplicate ? t('bug.message.duplicateRequired') : undefined}
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              aria-label="bug-duplicate-of"
              value={duplicateOfId ?? undefined}
              onChange={(value) => setDuplicateOfId(value ?? null)}
              options={(candidates.data?.items ?? [])
                .filter((item) => item.id !== bug?.id)
                .map((item) => ({ value: item.id, label: `#${item.id} ${item.title}` }))}
            />
          </Form.Item>
        ) : null}
        <Form.Item label={t('bug.field.assignee')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            aria-label="bug-resolve-assignee"
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
            aria-label="bug-resolve-comment"
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
