/** @route /products/:productId/releases @title release.title.list @perm release-view @hide @activeMenu /products */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  HasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  Popconfirm,
  Space,
  StatusTag,
  type TableColumnsType,
  Tag,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { RowNameLink } from '../../../shared/row-name-link'
import { deleteReleaseAction, fetchReleases, qk, type ReleaseView } from '../api/product.api'
import { ReleaseCreateModal } from '../forms/release-create-modal'
import { statusTone } from '../model'

/** 发布列表（T-10：里程碑标记列 + 状态下拉筛选；选项来自 meta/release）。 */
export default function ReleaseListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const productId = Number(useParams().productId)
  const [searchParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ReleaseView | null>(null)
  const releaseMeta = useMetaOptions('release')

  const status = searchParams.get('status') ?? ''
  const releases = useQuery({
    queryKey: [...qk.release.list(productId), status],
    queryFn: () => fetchReleases(productId, { limit: 200, ...(status ? { filters: { status } } : {}) }),
  })
  const remove = useMutation({
    mutationFn: (releaseId: number) => deleteReleaseAction(releaseId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['listReleases'] })
      void queryClient.invalidateQueries({ queryKey: ['getRelease'] })
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  const columns: TableColumnsType<ReleaseView> = [
    { title: t('release.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('release.field.name'),
      dataIndex: 'name',
      render: (name: string, record: ReleaseView) => (
        <Space>
          <RowNameLink to={`/releases/${record.id}`}>{name}</RowNameLink>
          {record.isMilestone ? <Tag color="gold">{t('release.message.milestone')}</Tag> : null}
        </Space>
      ),
    },
    {
      title: t('release.field.status'),
      dataIndex: 'status',
      render: (value: string) => <StatusTag tone={statusTone(value)}>{t(`release.status.${value}`)}</StatusTag>,
    },
    { title: t('release.field.releaseDate'), dataIndex: 'releaseDate' },
    { title: t('release.field.build'), dataIndex: 'buildId' },
    {
      title: t('common.action.manage'),
      key: 'actions',
      render: (_: unknown, record: ReleaseView) => (
        <Space>
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
          <HasPerm perm="release-delete">
            <Popconfirm title={t('release.message.deleteHint')} onConfirm={() => remove.mutate(record.id)}>
              <Button size="small" type="link" danger aria-label={`release-delete-${record.id}`}>
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
      <PageHeader title={t('release.title.list')} backTo={`/products/${productId}`} />
      <ListFilterForm fields={[selectField('status', t('common.field.status'), releaseMeta.options('status'))]} />
      <ListCard
        columns={columns}
        columnSettingKey="product-releases"
        actions={
          <Button
            type="primary"
            onClick={() => {
              setEditing(null)
              setCreateOpen(true)
            }}
          >
            {t('release.action.create')}
          </Button>
        }
        rowKey="id"
        loading={releases.isPending}
        dataSource={releases.data?.items ?? []}
        pagination={false}
      />
      <ReleaseCreateModal
        productId={productId}
        release={editing}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </PageContainer>
  )
}
