/** @route /products/:productId @title product.title.detail @perm product-view @hide @activeMenu /products */
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  Descriptions,
  PageContainer,
  PageHeader,
  PageLoading,
  Space,
  StatusTag,
  Tabs,
  Typography,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { actionsFor } from '../../../shared/meta'
import { withParam } from '../../../shared/url'
import { ActivityTimeline, CommentPanel } from '../../platform'
import { fetchProduct, fetchProductActivities, fetchProductMeta, qk } from '../api/product.api'
import { ProductCloseModal } from '../components/product-close-modal'
import { ProductEditModal } from '../forms/product-edit-modal'
import { statusTone } from '../model'

/** 产品详情（product 卡 §6 D 范式：页头动作区由 meta actions 驱动 + 简介/动态页签）。 */
export default function ProductDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const productId = Number(useParams().productId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [editOpen, setEditOpen] = useState(false)
  const [closeAction, setCloseAction] = useState<'close' | 'activate' | null>(null)

  const product = useQuery({ queryKey: qk.product.detail(productId), queryFn: () => fetchProduct(productId) })
  const meta = useQuery({ queryKey: qk.product.meta(), queryFn: fetchProductMeta })

  if (product.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  const view = product.data

  const links: { key: string; path: string; label: string }[] = [
    { key: 'branches', path: `/products/${productId}/branches`, label: t('product.action.branches') },
    { key: 'categories', path: `/products/${productId}/categories`, label: t('product.action.categories') },
    { key: 'stories', path: `/products/${productId}/stories`, label: t('story.title.list') },
    { key: 'projects', path: `/products/${productId}/projects`, label: t('project.title.list') },
    { key: 'plans', path: `/products/${productId}/plans`, label: t('product.action.plans') },
    { key: 'releases', path: `/products/${productId}/releases`, label: t('product.action.releases') },
    { key: 'builds', path: `/products/${productId}/builds`, label: t('product.action.builds') },
    { key: 'track', path: `/products/${productId}/track`, label: t('product.action.track') },
    { key: 'dynamic', path: `/products/${productId}/dynamic`, label: t('product.action.dynamic') },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            <Typography.Text strong>{view?.name ?? ''}</Typography.Text>
            <StatusTag tone={statusTone(view?.status ?? 'normal')}>
              {t(`product.status.${view?.status ?? 'normal'}`)}
            </StatusTag>
          </Space>
        }
        backTo="/products"
        extra={actionsFor(meta.data?.actions, view?.status).map((action) => (
          <Button
            key={action.action}
            type={action.action === 'edit' ? 'primary' : 'default'}
            onClick={() =>
              action.action === 'edit' ? setEditOpen(true) : setCloseAction(action.action as 'close' | 'activate')
            }
          >
            {action.i18n ? t(action.i18n) : t(`product.action.${action.action}`)}
          </Button>
        ))}
      />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('product.field.id'), children: view?.id ?? '-' },
            { key: 'code', label: t('product.field.code'), children: view?.code ?? '-' },
            { key: 'type', label: t('product.field.type'), children: t(`product.type.${view?.type ?? 'normal'}`) },
            { key: 'acl', label: t('product.field.acl'), children: t(`product.acl.${view?.acl ?? 'public'}`) },
            { key: 'po', label: t('product.field.po'), children: view?.po ?? '-' },
            { key: 'qd', label: t('product.field.qd'), children: view?.qd ?? '-' },
            { key: 'rd', label: t('product.field.rd'), children: view?.rd ?? '-' },
            { key: 'sort', label: t('product.field.sort'), children: view?.sort ?? 0 },
            { key: 'createdBy', label: t('common.field.createdBy'), children: view?.createdBy ?? '-' },
            { key: 'closedAt', label: t('product.field.closedAt'), children: view?.closedAt ?? '-' },
            {
              key: 'whitelist',
              label: t('product.field.whitelist'),
              span: 2,
              children: (view?.whitelist ?? []).join('、') || '-',
            },
          ]}
        />
        <Space wrap className="tw:mt-4">
          {links.map((link) => (
            <Button key={link.key} type="link" onClick={() => navigate(link.path)}>
              {link.label}
            </Button>
          ))}
        </Space>
      </Card>
      <Card>
        <Tabs
          activeKey={searchParams.get('tab') ?? 'description'}
          onChange={(key) => setSearchParams(withParam(searchParams, 'tab', key))}
          items={[
            {
              key: 'description',
              label: t('product.tab.description'),
              children: view?.description ? (
                <Typography.Paragraph>{view.description}</Typography.Paragraph>
              ) : (
                <Typography.Text type="secondary">{t('product.message.noDescription')}</Typography.Text>
              ),
            },
            {
              key: 'activities',
              label: t('product.tab.activities'),
              children: <ActivityTimeline fetchPage={(beforeId) => fetchProductActivities(productId, beforeId)} />,
            },
            {
              key: 'comments',
              label: t('platform.comment.title'),
              children: <CommentPanel objectType="product" objectId={productId} />,
            },
          ]}
        />
      </Card>
      <ProductEditModal product={view ?? null} open={editOpen} onClose={() => setEditOpen(false)} />
      <ProductCloseModal
        product={view ?? null}
        action={closeAction}
        open={closeAction !== null}
        onClose={() => setCloseAction(null)}
      />
    </PageContainer>
  )
}
