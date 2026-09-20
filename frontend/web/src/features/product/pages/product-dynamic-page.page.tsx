/** @route /products/:productId/dynamic @title product.title.dynamic @perm product-view @hide @activeMenu /products */
import { Card, PageContainer, PageHeader, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { ActivityTimeline } from '../../platform'
import { fetchProductActivities } from '../api/product.api'

/** 产品动态流（product 卡 §6：含分支/计划/发布/构建事件，游标「加载更多」）。 */
export default function ProductDynamicPage() {
  const { t } = useTranslation()
  const productId = Number(useParams().productId)

  return (
    <PageContainer>
      <PageHeader title={t('product.title.dynamic')} backTo="/products" />
      <Card>
        <Typography.Paragraph type="secondary">{t('platform.activity.title')}</Typography.Paragraph>
        <ActivityTimeline fetchPage={(beforeId) => fetchProductActivities(productId, beforeId)} />
      </Card>
    </PageContainer>
  )
}
