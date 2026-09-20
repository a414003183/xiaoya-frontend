/** @route /products/:productId/builds @title build.title.list @perm build-view @hide @activeMenu /products */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  ListCard,
  PageContainer,
  PageHeader,
  Popconfirm,
  Space,
  type TableColumnsType,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { RowNameLink } from '../../../shared/row-name-link'
import { type BuildView, fetchBuilds, qk, removeBuild } from '../api/product.api'
import { BuildCreateModal } from '../forms/build-create-modal'

/** 构建列表（T-10：删除走二次确认；被发布引用 → 42203 提示）。 */
export default function BuildListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const productId = Number(useParams().productId)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<BuildView | null>(null)

  const builds = useQuery({
    queryKey: qk.build.list(productId),
    queryFn: () => fetchBuilds(productId, { limit: 200, sort: '-buildDate' }),
  })
  const remove = useMutation({
    mutationFn: (buildId: number) => removeBuild(buildId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['listBuilds'] })
    },
    onError: (error) => {
      message.error(errorText(error, t, 'build.message.referencedByRelease'))
    },
  })

  const columns: TableColumnsType<BuildView> = [
    { title: t('build.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('build.field.name'),
      dataIndex: 'name',
      render: (name: string, record: BuildView) => <RowNameLink to={`/builds/${record.id}`}>{name}</RowNameLink>,
    },
    { title: t('build.field.buildDate'), dataIndex: 'buildDate', width: 120 },
    { title: t('build.field.builder'), dataIndex: 'builder', width: 120 },
    { title: t('build.field.filePath'), dataIndex: 'filePath' },
    {
      title: t('common.action.manage'),
      key: 'actions',
      render: (_: unknown, record: BuildView) => (
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
          <Popconfirm title={t('build.message.deleteHint')} onConfirm={() => remove.mutate(record.id)}>
            <Button size="small" type="link" danger>
              {t('common.action.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader title={t('build.title.list')} backTo={`/products/${productId}`} />
      <ListCard
        columns={columns}
        columnSettingKey="product-builds"
        actions={
          <Button
            type="primary"
            onClick={() => {
              setEditing(null)
              setCreateOpen(true)
            }}
          >
            {t('build.action.create')}
          </Button>
        }
        rowKey="id"
        loading={builds.isPending}
        dataSource={builds.data?.items ?? []}
        pagination={false}
      />
      <BuildCreateModal productId={productId} build={editing} open={createOpen} onClose={() => setCreateOpen(false)} />
    </PageContainer>
  )
}
