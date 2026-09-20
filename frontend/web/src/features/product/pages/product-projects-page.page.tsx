/** @route /products/:productId/projects @title project.title.list @perm project-view @hide @activeMenu /products */
import { useQuery } from '@tanstack/react-query'
import {
  ListCard,
  PageContainer,
  PageHeader,
  StatusTag,
  type TableColumnsType,
  Typography,
} from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { fetchProjects, type ProjectView, qk as projectQk, statusTone as projectStatusTone } from '../../project'
import { fetchProduct, qk } from '../api/product.api'

/** 产品下项目页（B-PRD-01 / product 卡 §6 L 范式）：listProjects + filters[productId] 只读反查，行点击进项目详情。 */
export default function ProductProjectsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const productId = Number(useParams().productId)

  const product = useQuery({ queryKey: qk.product.detail(productId), queryFn: () => fetchProduct(productId) })
  const projects = useQuery({
    queryKey: projectQk.project.list({ productId, limit: 200 }),
    queryFn: () => fetchProjects({ limit: 200, filters: { productId } }),
  })

  const items = projects.data?.items ?? []

  const columns: TableColumnsType<ProjectView> = [
    { title: t('project.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('project.field.name'),
      dataIndex: 'name',
      render: (name: string, record: ProjectView) => (
        <Typography.Link onClick={() => navigate(`/projects/${record.id}`)}>{name}</Typography.Link>
      ),
    },
    {
      title: t('common.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (status: string) => (
        <StatusTag tone={projectStatusTone(status)}>{t(`project.status.${status}`)}</StatusTag>
      ),
    },
    { title: t('project.field.pm'), dataIndex: 'pm', width: 110 },
    { title: t('project.field.beginDate'), dataIndex: 'beginDate', width: 120 },
    { title: t('project.field.endDate'), dataIndex: 'endDate', width: 120 },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={`${product.data?.name ?? ''} · ${t('project.title.list')}`}
        backTo={`/products/${productId}`}
      />
      <ListCard
        columns={columns}
        columnSettingKey="product-projects"
        rowKey="id"
        className="tw:cursor-pointer"
        loading={projects.isPending}
        pagination={false}
        dataSource={items}
        onRow={(record) => ({ onClick: () => navigate(`/projects/${record.id}`) })}
      />
    </PageContainer>
  )
}
