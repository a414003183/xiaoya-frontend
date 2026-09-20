/** @route /doc/spaces @title docSpace.title.list @perm doc-space-view @menu doc @order 1 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { DocSpaceView } from '@zentao/api-client/generated/model/docSpaceView'
import {
  Button,
  HasPerm,
  ListCard,
  PageContainer,
  Popconfirm,
  Space,
  StatusTag,
  type TableColumnsType,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { RowNameLink } from '../../../shared/row-name-link'
import { withParam } from '../../../shared/url'
import { csvQuery, useCsvExport } from '../../../shared/use-csv-export'
import { DOC_QUERY_ROOTS, DOC_SPACES_CSV_PATH, deleteDocSpaceAction, fetchDocSpaces, qk } from '../api/doc.api'
import { DocSpaceFormModal } from '../components/doc-space-form-modal'
import { docSpaceAclKey, docSpaceTypeKey } from '../model'

/** 文档库列表（T-4 / doc §6 L 范式：type 下拉筛选 = filters[type]；库详情进左树右列表）。
 * 筛选值域来自 meta/docSpace（与创建表单同源，前端不留常量清单）。 */
export default function DocSpaceListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [editing, setEditing] = useState<DocSpaceView | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const csv = useCsvExport()
  const spaceMeta = useMetaOptions('docSpace')

  const type = searchParams.get('type') ?? ''
  const acl = searchParams.get('acl') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const spaces = useQuery({
    queryKey: qk.doc.spaceList({ type, acl, q, page }),
    queryFn: () =>
      fetchDocSpaces({
        page,
        limit: 20,
        q,
        filters: { ...(type === '' ? {} : { type }), ...(acl === '' ? {} : { acl }) },
      }),
  })

  const remove = useMutation({
    mutationFn: (docSpaceId: number) => deleteDocSpaceAction(docSpaceId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      for (const root of DOC_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
    },
    // 非空库 → 42203，服务端文案原样呈现（§3 doc_space 删除守卫）
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  const columns: TableColumnsType<DocSpaceView> = [
    { title: t('docSpace.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('docSpace.field.name'),
      dataIndex: 'name',
      render: (name: string, record: DocSpaceView) => (
        <Space size={4}>
          <RowNameLink to={`/doc/spaces/${record.id}`}>{name}</RowNameLink>
          {record.isDefault ? <StatusTag tone="active">{t('docSpace.field.isDefault')}</StatusTag> : null}
        </Space>
      ),
    },
    {
      title: t('docSpace.field.type'),
      dataIndex: 'type',
      width: 110,
      render: (value: string) => t(docSpaceTypeKey(value)),
    },
    {
      title: t('docSpace.field.acl'),
      dataIndex: 'acl',
      width: 110,
      render: (value: string) => t(docSpaceAclKey(value)),
    },
    { title: t('docSpace.field.docCount'), dataIndex: 'docCount', width: 90 },
    { title: t('docSpace.field.createdBy'), dataIndex: 'createdBy', width: 110 },
    { title: t('docSpace.field.createdAt'), dataIndex: 'createdAt', width: 180 },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 180,
      render: (_: unknown, record: DocSpaceView) => (
        <Space size={4}>
          <HasPerm perm="doc-space-edit">
            <Button
              size="small"
              type="link"
              onClick={() => {
                setEditing(record)
                setCreateOpen(true)
              }}
            >
              {t('common.action.edit')}
            </Button>
          </HasPerm>
          <HasPerm perm="doc-space-delete">
            <Popconfirm title={t('docSpace.message.deleteHint')} onConfirm={() => remove.mutate(record.id)}>
              <Button size="small" type="link" danger>
                {t('common.action.delete')}
              </Button>
            </Popconfirm>
          </HasPerm>
        </Space>
      ),
    },
  ]

  return (
    <PageContainer>
      <ListFilterForm
        fields={[
          keywordField(t('docSpace.field.name'), t('common.action.search')),
          selectField('type', t('common.field.type'), spaceMeta.options('type')),
          selectField('acl', t('doc.field.acl'), spaceMeta.options('acl')),
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="doc-spaces"
        actions={
          <>
            <HasPerm perm="doc-space-create">
              <Button
                type="primary"
                onClick={() => {
                  setEditing(null)
                  setCreateOpen(true)
                }}
              >
                {t('docSpace.action.create')}
              </Button>
            </HasPerm>
            <Button
              loading={csv.exporting}
              onClick={() =>
                void csv.exportCsv(DOC_SPACES_CSV_PATH, csvQuery({ q, filters: { type, acl } }), 'doc-spaces')
              }
            >
              {t('common.action.exportCsv')}
            </Button>
          </>
        }
        rowKey="id"
        loading={spaces.isPending}
        dataSource={spaces.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: 20,
          total: spaces.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <DocSpaceFormModal
        key={editing?.id ?? 'create'}
        space={editing}
        open={createOpen}
        onClose={() => {
          setCreateOpen(false)
          setEditing(null)
        }}
      />
    </PageContainer>
  )
}
