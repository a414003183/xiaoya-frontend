/** @route /bugs/:bugId @title quality.title.bugDetail @perm bug-view @hide @activeMenu /products */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Descriptions,
  EmptyState,
  HasPerm,
  PageContainer,
  PageHeader,
  PageLoading,
  Popconfirm,
  Space,
  StatusTag,
  Tabs,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { actionsFor } from '../../../shared/meta'
import { withParam } from '../../../shared/url'
import { ActivityTimeline, CommentPanel, FileUploadField } from '../../platform'
import {
  closeBugAction,
  deleteBugAction,
  fetchBug,
  fetchBugActivities,
  fetchBugMeta,
  fetchBugs,
  qk,
} from '../api/quality.api'
import { BugActivateModal } from '../components/bug-activate-modal'
import { BugAssignModal } from '../components/bug-assign-modal'
import { BugConfirmModal } from '../components/bug-confirm-modal'
import { BugLinkModal } from '../components/bug-link-modal'
import { BugResolveModal } from '../components/bug-resolve-modal'
import { BugEditModal } from '../forms/bug-edit-modal'
import { actionI18nKey, bugTone, severityKey } from '../model'

/** Bug 详情（T-2/T-3 / quality §6 D 范式：页头动作区 meta 驱动接弹窗 + 重现步骤/动态/关联页签）。 */
export default function BugDetailPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const bugId = Number(useParams().bugId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [activateOpen, setActivateOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const bug = useQuery({ queryKey: qk.quality.bug(bugId), queryFn: () => fetchBug(bugId) })
  const meta = useQuery({ queryKey: qk.quality.bugMeta(), queryFn: fetchBugMeta })
  const view = bug.data
  const related = useQuery({
    queryKey: ['listBugs', view?.productId, 'related'],
    queryFn: () => fetchBugs(view?.productId ?? 0, { limit: 200 }),
    enabled: view != null,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['getBug'] })
    void queryClient.invalidateQueries({ queryKey: ['listBugs'] })
    void queryClient.invalidateQueries({ queryKey: ['listBugActivities'] })
  }

  const runAction = useMutation({
    mutationFn: async (action: string) => {
      if (action === 'close') {
        return closeBugAction(bugId)
      }
      return null
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      invalidate()
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteBugAction(bugId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      invalidate()
      navigate(`/products/${view?.productId ?? 0}/bugs`)
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  if (bug.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const relatedBugs = (related.data?.items ?? []).filter((item) => (view?.relatedBugIds ?? []).includes(item.id))

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            {view?.title ?? ''}
            <StatusTag tone={bugTone(view?.status ?? 'active')}>
              {t(`bug.status.${view?.status ?? 'active'}`)}
            </StatusTag>
            {view?.confirmed ? <StatusTag tone="active">{t('bug.confirmed.yes')}</StatusTag> : null}
          </Space>
        }
        backTo={view ? `/products/${view.productId}/bugs` : '/products'}
        extra={
          <>
            <Button onClick={() => setLinkOpen(true)}>{t('bug.action.link')}</Button>
            {actionsFor(meta.data?.actions, view?.status).map((action) => (
              <Button
                key={action.action}
                type={action.action === 'resolve' ? 'primary' : 'default'}
                onClick={() => {
                  switch (action.action) {
                    case 'confirm':
                      setConfirmOpen(true)
                      return
                    case 'resolve':
                      setResolveOpen(true)
                      return
                    case 'activate':
                      setActivateOpen(true)
                      return
                    case 'assign':
                      setAssignOpen(true)
                      return
                    case 'edit':
                      setEditOpen(true)
                      return
                    default:
                      runAction.mutate(action.action)
                  }
                }}
              >
                {t(actionI18nKey('bug', action.action))}
              </Button>
            ))}
            <HasPerm perm="bug-delete">
              <Popconfirm title={t('bug.message.deleteHint')} onConfirm={() => remove.mutate()}>
                <Button danger loading={remove.isPending}>
                  {t('common.action.delete')}
                </Button>
              </Popconfirm>
            </HasPerm>
          </>
        }
      />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('bug.field.id'), children: view?.id ?? '-' },
            { key: 'severity', label: t('bug.field.severity'), children: t(severityKey(view?.severity)) },
            { key: 'priority', label: t('bug.field.priority'), children: t(`common.priority.${view?.priority ?? 3}`) },
            { key: 'type', label: t('bug.field.type'), children: t(`bug.type.${view?.type ?? 'codeerror'}`) },
            { key: 'os', label: t('bug.field.os'), children: view?.os ? t(`bug.os.${view.os}`) : '-' },
            {
              key: 'browser',
              label: t('bug.field.browser'),
              children: view?.browser ? t(`bug.browser.${view.browser}`) : '-',
            },
            { key: 'openedBuilds', label: t('bug.field.openedBuilds'), children: view?.openedBuilds ?? '-' },
            { key: 'assignee', label: t('bug.field.assignee'), children: view?.assignee ?? '-' },
            { key: 'deadline', label: t('bug.field.deadline'), children: view?.deadline ?? '-' },
            {
              key: 'resolution',
              label: t('bug.field.resolution'),
              children: view?.resolution ? t(`bug.resolution.${view.resolution}`) : '-',
            },
            { key: 'resolvedBy', label: t('bug.field.resolvedBy'), children: view?.resolvedBy ?? '-' },
            { key: 'resolvedBuild', label: t('bug.field.resolvedBuild'), children: view?.resolvedBuild ?? '-' },
            {
              key: 'duplicateOf',
              label: t('bug.field.duplicateOf'),
              children: view?.duplicateOfId ? `#${view.duplicateOfId}` : '-',
            },
            { key: 'activatedCount', label: t('bug.field.activatedCount'), children: view?.activatedCount ?? 0 },
            { key: 'createdBy', label: t('common.field.createdBy'), children: view?.createdBy ?? '-' },
            { key: 'createdAt', label: t('common.field.createdAt'), children: view?.createdAt ?? '-' },
            { key: 'closedBy', label: t('bug.field.closedBy'), children: view?.closedBy ?? '-' },
          ]}
        />
        {runAction.error ? (
          <Typography.Paragraph type="danger">
            {errorText(runAction.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
      </Card>
      <Card>
        <Tabs
          activeKey={searchParams.get('tab') ?? 'steps'}
          onChange={(key) => setSearchParams(withParam(searchParams, 'tab', key))}
          items={[
            {
              key: 'steps',
              label: t('bug.tab.steps'),
              children: view?.steps ? (
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{view.steps}</Typography.Paragraph>
              ) : (
                <EmptyState description={t('bug.message.noSteps')} />
              ),
            },
            {
              key: 'activities',
              label: t('bug.tab.activities'),
              children: <ActivityTimeline fetchPage={(beforeId) => fetchBugActivities(bugId, beforeId)} />,
            },
            {
              key: 'files',
              label: t('bug.tab.files'),
              children: <FileUploadField objectType="bug" objectId={bugId} />,
            },
            {
              key: 'related',
              label: t('bug.tab.related'),
              children:
                relatedBugs.length === 0 ? (
                  <EmptyState description={t('common.empty')} />
                ) : (
                  <ul className="tw:m-0 tw:list-none tw:p-0">
                    {relatedBugs.map((item) => (
                      <li key={item.id}>
                        <Typography.Link onClick={() => navigate(`/bugs/${item.id}`)}>
                          {`#${item.id} ${item.title}`}
                        </Typography.Link>
                      </li>
                    ))}
                  </ul>
                ),
            },
            {
              key: 'comments',
              label: t('platform.comment.title'),
              children: <CommentPanel objectType="bug" objectId={bugId} />,
            },
          ]}
        />
      </Card>
      <BugConfirmModal bug={view ?? null} open={confirmOpen} onClose={() => setConfirmOpen(false)} />
      <BugResolveModal bug={view ?? null} open={resolveOpen} onClose={() => setResolveOpen(false)} />
      <BugActivateModal bug={view ?? null} open={activateOpen} onClose={() => setActivateOpen(false)} />
      <BugAssignModal bug={view ?? null} open={assignOpen} onClose={() => setAssignOpen(false)} />
      <BugLinkModal bug={view ?? null} open={linkOpen} onClose={() => setLinkOpen(false)} />
      {view ? (
        <BugEditModal
          productId={view.productId}
          bug={view}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={invalidate}
        />
      ) : null}
    </PageContainer>
  )
}
