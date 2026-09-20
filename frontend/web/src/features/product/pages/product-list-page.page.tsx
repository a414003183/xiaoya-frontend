/** @route /products @title product.title.list @perm product-view @menu product @order 1 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  HasPerm,
  InputNumber,
  ListCard,
  PageContainer,
  Popconfirm,
  Space,
  StatusTag,
  type TableColumnsType,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { RowNameLink } from '../../../shared/row-name-link'
import { withParam } from '../../../shared/url'
import { csvQuery, useCsvExport } from '../../../shared/use-csv-export'
import {
  deleteProductAction,
  fetchProducts,
  PRODUCTS_CSV_PATH,
  type ProductView,
  patchProduct,
  qk,
} from '../api/product.api'
import { ProductCreateModal } from '../forms/product-create-modal'
import { statusTone } from '../model'

/** 产品列表（product 卡 §6：状态下拉筛选 = filters[status]、行内排序权重编辑、多选进批量页）。
 * 筛选值域来自 meta/product（前端不留常量清单）。 */
export default function ProductListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [sortDrafts, setSortDrafts] = useState<Record<number, number>>({})
  const csv = useCsvExport()
  const productMeta = useMetaOptions('product')

  const status = searchParams.get('status') ?? ''
  const type = searchParams.get('type') ?? ''
  const acl = searchParams.get('acl') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const products = useQuery({
    queryKey: qk.product.list({ status, type, acl, q, page }),
    queryFn: () => fetchProducts({ page, limit: 20, q, filters: { status, type, acl } }),
  })
  const saveSort = useMutation({
    mutationFn: (row: ProductView) =>
      patchProduct(row.id, { sort: sortDrafts[row.id] ?? row.sort, lockVersion: row.lockVersion }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['listProducts'] })
      void queryClient.invalidateQueries({ queryKey: ['getProduct'] })
    },
  })
  const remove = useMutation({
    mutationFn: (productId: number) => deleteProductAction(productId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['listProducts'] })
      void queryClient.invalidateQueries({ queryKey: ['getProduct'] })
    },
    // 有下挂对象 → 42203，按错误码取文案（product §5 delete 守卫）
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  const columns: TableColumnsType<ProductView> = [
    { title: t('product.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('product.field.name'),
      dataIndex: 'name',
      render: (name: string, record: ProductView) => <RowNameLink to={`/products/${record.id}`}>{name}</RowNameLink>,
    },
    { title: t('product.field.code'), dataIndex: 'code' },
    {
      title: t('product.field.type'),
      dataIndex: 'type',
      render: (type: string) => t(`product.type.${type}`),
    },
    {
      title: t('product.field.status'),
      dataIndex: 'status',
      render: (value: string) => <StatusTag tone={statusTone(value)}>{t(`product.status.${value}`)}</StatusTag>,
    },
    {
      title: t('product.field.acl'),
      dataIndex: 'acl',
      render: (acl: string) => t(`product.acl.${acl}`),
    },
    { title: t('product.field.po'), dataIndex: 'po' },
    {
      title: t('product.field.sort'),
      dataIndex: 'sort',
      width: 110,
      render: (_: unknown, record: ProductView) => (
        <InputNumber
          size="small"
          min={0}
          aria-label={`sort-${record.id}`}
          value={sortDrafts[record.id] ?? record.sort}
          onChange={(value) => setSortDrafts((prev) => ({ ...prev, [record.id]: Number(value ?? 0) }))}
          onBlur={() => {
            const next = sortDrafts[record.id]
            if (next !== undefined && next !== record.sort) {
              saveSort.mutate(record)
            }
          }}
        />
      ),
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      render: (_: unknown, record: ProductView) => (
        <Space size={4}>
          <HasPerm perm="product-delete">
            <Popconfirm title={t('product.message.deleteHint')} onConfirm={() => remove.mutate(record.id)}>
              <Button size="small" type="link" danger aria-label={`product-delete-${record.id}`}>
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
          keywordField(t('product.field.name'), t('common.action.search')),
          selectField('status', t('common.field.status'), productMeta.options('status')),
          selectField('type', t('product.field.type'), productMeta.options('type')),
          selectField('acl', t('product.field.acl'), productMeta.options('acl')),
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="product-list"
        actions={
          <>
            {products.error ? (
              <Typography.Text type="danger">{errorText(products.error, t, 'common.message.failed')}</Typography.Text>
            ) : null}
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t('product.action.createNew')}
            </Button>
            <Button onClick={() => navigate('/products/kanban')}>{t('product.title.kanban')}</Button>
            <Button
              disabled={selectedIds.length === 0}
              onClick={() => navigate(`/products/batch-edit?ids=${selectedIds.join(',')}`)}
            >
              {t('product.action.batch')}
            </Button>
            <Button
              loading={csv.exporting}
              onClick={() =>
                void csv.exportCsv(PRODUCTS_CSV_PATH, csvQuery({ q, filters: { status, type, acl } }), 'products')
              }
            >
              {t('common.action.exportCsv')}
            </Button>
          </>
        }
        rowKey="id"
        loading={products.isPending}
        dataSource={products.data?.items ?? []}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys.map((key) => Number(key))),
        }}
        pagination={{
          current: page,
          pageSize: 20,
          total: products.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <ProductCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(product) => {
          setCreateOpen(false)
          void queryClient.invalidateQueries({ queryKey: ['listProducts'] })
          navigate(`/products/${product.id}`)
        }}
      />
    </PageContainer>
  )
}
