/** @route /docs/:docId @title doc.title.detail @perm doc-view @hide @activeMenu /doc/spaces */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, errorText } from '@zentao/api-client'
import type { DocVersionView } from '@zentao/api-client/generated/model/docVersionView'
import {
  Button,
  Card,
  Descriptions,
  HasPerm,
  hasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  PageLoading,
  Popconfirm,
  Result,
  Space,
  StatusTag,
  type TableColumnsType,
  Tabs,
  Typography,
  useMessage,
  usePrivileges,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { formatDateTime } from '../../../shared/format'
import { actionsFor } from '../../../shared/meta'
import { withParam } from '../../../shared/url'
import { ActivityTimeline, CommentPanel, FileUploadField, fileDownloadUrl } from '../../platform'
import {
  DOC_QUERY_ROOTS,
  deleteDocAction,
  fetchDoc,
  fetchDocActivities,
  fetchDocMeta,
  fetchDocVersions,
  publishDocAction,
  qk,
} from '../api/doc.api'
import { DocBasicInfoModal } from '../components/doc-basic-info-modal'
import { DocMoveModal } from '../components/doc-move-modal'
import { MarkdownView } from '../components/markdown-view'
import { docAclKey, docActionPerm, docExcerpt, docStatusKey, docStatusTone, docTypeKey, showDraftBadge } from '../model'

/** 详情页动作区可处理的动作（其余 meta 动作如 save-draft 归编辑页；状态可用性仍只认 meta allowedStatus）。 */
const HANDLED_ACTIONS = new Set(['publish', 'move', 'delete'])

/** 附件下载地址（platform §5：FileView.url = /files/{id}/download，API 前缀 /api/v1）。 */
const fileUrl = (fileId: number): string => fileDownloadUrl(fileId)

/** 文档详情（T-5 / doc §6 D 范式：页头动作区 + Markdown 渲染 + 附件 + 动态/版本页签）。 */
export default function DocDetailPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const privileges = usePrivileges()
  const docId = Number(useParams().docId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [moveOpen, setMoveOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

  const doc = useQuery({ queryKey: qk.doc.detail(docId), queryFn: () => fetchDoc(docId) })
  const meta = useQuery({ queryKey: qk.doc.meta(), queryFn: fetchDocMeta })
  const versions = useQuery({
    queryKey: qk.doc.versions(docId),
    queryFn: () => fetchDocVersions(docId),
    enabled: searchParams.get('tab') === 'versions',
  })

  const publish = useMutation({
    mutationFn: () => publishDocAction(docId),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      for (const root of DOC_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
    },
    // 无改动可发布 → 42203，按领域口径给出可理解的文案（§4 publish 守卫）
    onError: (error) =>
      error instanceof ApiError && error.code === 42203
        ? message.warning(t('doc.message.noChanges'))
        : message.error(errorText(error, t, 'common.message.failed')),
  })
  const remove = useMutation({
    mutationFn: () => deleteDocAction(docId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      for (const root of DOC_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
      navigate(doc.data ? `/doc/spaces/${doc.data.docSpaceId}` : '/doc/my')
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  if (doc.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  // 库不可见 → 40401、文档 ACL 拒绝 → 40302，原样呈现服务端文案（§7）
  if (doc.error) {
    return (
      <PageContainer>
        <PageHeader title={t('doc.title.detail')} backTo="/doc/my" />
        <Result
          status="error"
          title={t('doc.message.unavailable')}
          subTitle={errorText(doc.error, t, 'common.message.failed')}
        />
      </PageContainer>
    )
  }
  const view = doc.data
  const actions = actionsFor(meta.data?.actions, view?.status).filter((action) => {
    const perm = docActionPerm(action.action)
    return HANDLED_ACTIONS.has(action.action) && perm !== null && hasPerm(privileges, perm)
  })
  const orDash = (value: string | number | null | undefined): string =>
    value === null || value === undefined || value === '' ? '-' : String(value)
  const files = view?.files ?? []

  const versionColumns: TableColumnsType<DocVersionView> = [
    {
      title: t('docVersion.field.version'),
      dataIndex: 'version',
      width: 90,
      render: (value: number) => `v${value}`,
    },
    { title: t('docVersion.field.title'), dataIndex: 'title' },
    {
      title: t('docVersion.field.digest'),
      dataIndex: 'digest',
      render: (value: string | null) => docExcerpt(value, 60),
    },
    { title: t('common.field.createdBy'), dataIndex: 'createdBy', width: 110 },
    {
      title: t('common.field.createdAt'),
      dataIndex: 'createdAt',
      width: 180,
      render: (value: string | null) => formatDateTime(value) || '-',
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 100,
      render: () => (
        <Button size="small" type="link" onClick={() => navigate(`/docs/${docId}/versions`)}>
          {t('docVersion.action.compare')}
        </Button>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space wrap>
            <Typography.Text strong>{view?.title ?? ''}</Typography.Text>
            <StatusTag tone={docStatusTone(view?.status ?? 'draft')}>
              {t(docStatusKey(view?.status ?? 'draft'))}
            </StatusTag>
            {view && showDraftBadge(view) ? <StatusTag tone="warning">{t('doc.field.hasDraft')}</StatusTag> : null}
            <Typography.Text type="secondary">
              {t('doc.field.version')} v{view?.version ?? 0}
            </Typography.Text>
          </Space>
        }
        backTo={view ? `/doc/spaces/${view.docSpaceId}` : '/doc/my'}
        extra={
          <>
            <HasPerm perm="doc-edit">
              <Button onClick={() => navigate(`/docs/${docId}/edit`)}>{t('doc.action.edit')}</Button>
              <Button onClick={() => setInfoOpen(true)} aria-label="doc-edit-info">
                {t('doc.action.editInfo')}
              </Button>
            </HasPerm>
            <Button onClick={() => navigate(`/docs/${docId}/versions`)}>{t('docVersion.title.list')}</Button>
            {actions.map((action) =>
              action.action === 'delete' ? (
                <Popconfirm key={action.action} title={t('doc.message.deleteHint')} onConfirm={() => remove.mutate()}>
                  <Button danger>{t(action.i18n ?? 'doc.action.delete')}</Button>
                </Popconfirm>
              ) : (
                <Button
                  key={action.action}
                  type={action.action === 'publish' ? 'primary' : 'default'}
                  loading={publish.isPending && action.action === 'publish'}
                  onClick={() => (action.action === 'move' ? setMoveOpen(true) : publish.mutate())}
                >
                  {t(action.i18n ?? `doc.action.${action.action}`)}
                </Button>
              ),
            )}
          </>
        }
      />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('doc.field.id'), children: orDash(view?.id) },
            { key: 'space', label: t('doc.field.docSpace'), children: orDash(view?.docSpaceId) },
            {
              key: 'category',
              label: t('doc.field.category'),
              children: view?.categoryId ? orDash(view.categoryId) : t('doc.message.uncategorized'),
            },
            { key: 'parent', label: t('doc.field.parent'), children: view?.parentId ? orDash(view.parentId) : '-' },
            { key: 'type', label: t('doc.field.type'), children: t(docTypeKey(view?.type)) },
            { key: 'acl', label: t('doc.field.acl'), children: t(docAclKey(view?.acl)) },
            { key: 'views', label: t('doc.field.views'), children: orDash(view?.views) },
            { key: 'keywords', label: t('doc.field.keywords'), children: orDash(view?.keywords) },
            { key: 'sort', label: t('doc.field.sort'), children: orDash(view?.sort) },
            { key: 'createdBy', label: t('common.field.createdBy'), children: orDash(view?.createdBy) },
            {
              key: 'createdAt',
              label: t('common.field.createdAt'),
              children: formatDateTime(view?.createdAt) || '-',
            },
            {
              key: 'updatedAt',
              label: t('common.field.updatedAt'),
              children: formatDateTime(view?.updatedAt) || '-',
            },
          ]}
        />
      </Card>
      <Card title={t('doc.field.content')}>
        <MarkdownView content={view?.content} emptyText={t('doc.message.noContent')} />
      </Card>
      {/* 附件区（B-DOC-03/10）：platform File，objectType=doc；上传即挂当前文档，可删除；快照文件 id 保留下载链接 */}
      <Card title={t('doc.field.files')}>
        <FileUploadField objectType="doc" objectId={docId} />
        {files.length > 0 ? (
          <Space wrap className="tw:mt-2">
            <Typography.Text type="secondary">{t('doc.message.snapshotFiles')}：</Typography.Text>
            {files.map((fileId) => (
              <Typography.Link key={fileId} href={fileUrl(fileId)} target="_blank">
                #{fileId}
              </Typography.Link>
            ))}
          </Space>
        ) : null}
      </Card>
      <Card>
        <Tabs
          activeKey={searchParams.get('tab') ?? 'activities'}
          onChange={(key) => setSearchParams(withParam(searchParams, 'tab', key))}
          items={[
            {
              key: 'activities',
              label: t('doc.tab.activities'),
              children: <ActivityTimeline fetchPage={(beforeId) => fetchDocActivities(docId, beforeId)} />,
            },
            {
              key: 'comments',
              label: t('doc.tab.comments'),
              children: <CommentPanel objectType="doc" objectId={docId} />,
            },
            {
              key: 'versions',
              label: t('docVersion.title.list'),
              children: (
                <ListCard
                  columns={versionColumns}
                  columnSettingKey="doc-detail-versions"
                  rowKey="id"
                  loading={versions.isPending}
                  dataSource={versions.data?.items ?? []}
                  pagination={false}
                />
              ),
            },
          ]}
        />
      </Card>
      {view ? <DocBasicInfoModal doc={view} open={infoOpen} onClose={() => setInfoOpen(false)} /> : null}
      <DocMoveModal docIds={[docId]} open={moveOpen} onClose={() => setMoveOpen(false)} />
    </PageContainer>
  )
}
