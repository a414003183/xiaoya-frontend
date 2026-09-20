/** @route /products/kanban @title product.title.kanban @perm product-view @menu product @order 2 */
import { useQuery } from '@tanstack/react-query'
import { Card, EmptyState, PageContainer, PageLoading, StatusTag, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { fetchProducts, qk } from '../api/product.api'
import { groupByStatus, PRODUCT_STATUSES, statusTone } from '../model'

/** 产品看板（product 卡 §6 K 范式：按状态分列只读，入口卡片跳详情；拖拽留 P3 看板卡）。 */
export default function ProductKanbanPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const products = useQuery({
    queryKey: qk.product.list({ view: 'kanban' }),
    queryFn: () => fetchProducts({ limit: 200 }),
  })

  if (products.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const columns = groupByStatus(products.data?.items ?? [], PRODUCT_STATUSES)

  return (
    <PageContainer>
      <div className="tw:grid tw:grid-cols-2 tw:gap-4">
        {columns.map((column) => (
          <Card key={column.status} title={t(`product.status.${column.status}`)} size="small">
            {column.items.length === 0 ? (
              <EmptyState description={t('common.empty')} />
            ) : (
              <ul className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-2 tw:p-0">
                {column.items.map((product) => (
                  <li key={product.id}>
                    <Card size="small" hoverable onClick={() => navigate(`/products/${product.id}`)}>
                      <Typography.Text strong>{product.name}</Typography.Text>
                      <div className="tw:flex tw:items-center tw:gap-2 tw:text-xs">
                        <StatusTag tone={statusTone(product.status)}>{t(`product.status.${product.status}`)}</StatusTag>
                        <Typography.Text type="secondary">{t(`product.type.${product.type}`)}</Typography.Text>
                        <Typography.Text type="secondary">{t(`product.acl.${product.acl}`)}</Typography.Text>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </PageContainer>
  )
}
