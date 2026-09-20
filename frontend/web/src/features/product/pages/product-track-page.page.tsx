/** @route /products/:productId/track @title product.title.track @perm product-view @hide @activeMenu /products */
import { useQuery } from '@tanstack/react-query'
import {
  ListCard,
  PageContainer,
  PageHeader,
  PageLoading,
  type TableColumnsType,
  Typography,
} from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { fetchProductStories, fetchReleases, qk } from '../api/product.api'
import { buildTrackMatrix, type TrackRow } from '../model'

/** 需求 × 发布跟踪矩阵（product 卡 §6：stories + releases 取数，cell = 是否关联）。 */
export default function ProductTrackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const productId = Number(useParams().productId)

  const stories = useQuery({
    queryKey: ['listStories', productId, 'track'],
    queryFn: () => fetchProductStories(productId, { limit: 200 }),
  })
  const releases = useQuery({
    queryKey: qk.release.list(productId),
    queryFn: () => fetchReleases(productId, { limit: 200 }),
  })

  if (stories.isPending || releases.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const releaseItems = releases.data?.items ?? []
  const matrix = buildTrackMatrix(stories.data?.items ?? [], releaseItems)

  const columns: TableColumnsType<TrackRow> = [
    {
      title: t('product.track.story'),
      dataIndex: 'title',
      render: (title: string, row: TrackRow) => (
        <Typography.Link onClick={() => navigate(`/stories/${row.storyId}`)}>{title}</Typography.Link>
      ),
    },
    ...releaseItems.map((release, index) => ({
      title: release.name,
      key: `release-${release.id}`,
      width: 120,
      render: (_: unknown, row: TrackRow) =>
        row.cells[index] ? t('product.track.released') : <Typography.Text type="secondary">-</Typography.Text>,
    })),
  ]

  return (
    <PageContainer>
      <PageHeader title={t('product.title.track')} backTo="/products" />
      <ListCard
        columns={columns}
        columnSettingKey="product-track"
        rowKey="storyId"
        dataSource={matrix.rows}
        pagination={false}
      />
    </PageContainer>
  )
}
