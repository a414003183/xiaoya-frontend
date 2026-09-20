import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Modal, Select, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type BugView, fetchBugs, patchBug } from '../api/quality.api'

/** Bug 关联弹窗（T-3 / quality §6：PATCH relatedBugIds 整体替换，同产品多选）。 */
export function BugLinkModal({ bug, open, onClose }: { bug: BugView | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [relatedBugIds, setRelatedBugIds] = useState<number[] | null>(null)

  const candidates = useQuery({
    queryKey: ['listBugs', bug?.productId, 'link'],
    queryFn: () => fetchBugs(bug?.productId ?? 0, { limit: 200 }),
    enabled: bug != null,
  })

  const submit = useMutation({
    mutationFn: async () => {
      if (!bug) {
        return null
      }
      return patchBug(bug.id, { relatedBugIds: relatedBugIds ?? bug.relatedBugIds ?? [], lockVersion: bug.lockVersion })
    },
    onSuccess: () => {
      setRelatedBugIds(null)
      void queryClient.invalidateQueries({ queryKey: ['getBug'] })
      void queryClient.invalidateQueries({ queryKey: ['listBugs'] })
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      title={t('bug.action.link')}
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
        <Form.Item label={t('bug.field.relatedBugs')}>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            aria-label="bug-related-ids"
            value={relatedBugIds ?? bug?.relatedBugIds ?? []}
            onChange={(value) => setRelatedBugIds(value)}
            options={(candidates.data?.items ?? [])
              .filter((item) => item.id !== bug?.id)
              .map((item) => ({ value: item.id, label: `#${item.id} ${item.title}` }))}
          />
        </Form.Item>
      </Form>
      {submit.error ? (
        <Typography.Paragraph type="danger">{errorText(submit.error, t, 'common.message.failed')}</Typography.Paragraph>
      ) : null}
    </Modal>
  )
}
