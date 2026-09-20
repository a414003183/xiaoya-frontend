/** @route /products/:productId/branches @title branch.title.list @perm product-view @hide @activeMenu /products */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Alert,
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
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import {
  activateBranchAction,
  type BranchView,
  closeBranchAction,
  deleteBranchAction,
  fetchBranches,
  fetchProduct,
  qk,
  setDefaultBranchAction,
} from '../api/product.api'
import { BranchEditModal } from '../forms/branch-edit-modal'
import { statusTone } from '../model'

/** 分支管理（product 卡 §6 / T-7：列表 + 行内 set-default/关闭/激活；筛选值域来自 meta/branch）。 */
export default function ProductBranchesPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const productId = Number(useParams().productId)
  const [searchParams] = useSearchParams()
  const [editing, setEditing] = useState<BranchView | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const branchMeta = useMetaOptions('branch')

  const status = searchParams.get('status') ?? ''

  const product = useQuery({ queryKey: qk.product.detail(productId), queryFn: () => fetchProduct(productId) })
  const branches = useQuery({
    queryKey: [...qk.branch.list(productId), status],
    queryFn: () => fetchBranches(productId, { limit: 200, sort: 'sort', filters: { status } }),
  })
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['listBranches'] })
    void queryClient.invalidateQueries({ queryKey: ['listProductActivities'] })
  }
  const close = useMutation({ mutationFn: (branchId: number) => closeBranchAction(branchId), onSuccess: invalidate })
  const activate = useMutation({
    mutationFn: (branchId: number) => activateBranchAction(branchId),
    onSuccess: invalidate,
  })
  const setDefault = useMutation({
    mutationFn: (branchId: number) => setDefaultBranchAction(branchId),
    onSuccess: () => {
      message.success(t('branch.message.defaultSet'))
      invalidate()
    },
  })
  const remove = useMutation({
    mutationFn: (branchId: number) => deleteBranchAction(branchId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      invalidate()
    },
    // 分支下有未删需求 → 42203（branch §5 delete 守卫）
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  const columns: TableColumnsType<BranchView> = [
    { title: t('branch.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('branch.field.name'),
      dataIndex: 'name',
      render: (name: string, record: BranchView) => (
        <Space>
          <Typography.Text>{name}</Typography.Text>
          {record.isDefault ? <Tag color="blue">{t('branch.field.isDefault')}</Tag> : null}
        </Space>
      ),
    },
    {
      title: t('branch.field.status'),
      dataIndex: 'status',
      render: (status: string) => <StatusTag tone={statusTone(status)}>{t(`branch.status.${status}`)}</StatusTag>,
    },
    { title: t('branch.field.sort'), dataIndex: 'sort', width: 90 },
    { title: t('branch.field.description'), dataIndex: 'description' },
    {
      title: t('common.action.manage'),
      key: 'actions',
      render: (_: unknown, record: BranchView) => (
        <Space>
          <Button
            size="small"
            onClick={() => {
              setEditing(record)
              setModalOpen(true)
            }}
          >
            {t('common.action.edit')}
          </Button>
          {record.status === 'active' ? (
            <>
              <Button
                size="small"
                disabled={record.isDefault}
                loading={setDefault.isPending}
                onClick={() => setDefault.mutate(record.id)}
              >
                {t('branch.action.setDefault')}
              </Button>
              <Button size="small" onClick={() => close.mutate(record.id)}>
                {t('branch.action.close')}
              </Button>
            </>
          ) : (
            <Button size="small" onClick={() => activate.mutate(record.id)}>
              {t('branch.action.activate')}
            </Button>
          )}
          <HasPerm perm="branch-delete">
            <Popconfirm title={t('branch.message.deleteHint')} onConfirm={() => remove.mutate(record.id)}>
              <Button size="small" danger aria-label={`branch-delete-${record.id}`}>
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
      <PageHeader title={`${product.data?.name ?? ''} · ${t('branch.title.list')}`} backTo={`/products/${productId}`} />
      <ListFilterForm fields={[selectField('status', t('common.field.status'), branchMeta.options('status'))]} />
      {/* 非普通产品才有独立分支：整表禁用的提示条本身就是一条横幅，落在两卡之间（列表卡没有「表前横幅」槽位） */}
      {product.data?.type === 'normal' ? (
        <Alert type="warning" showIcon message={t('branch.message.normalProductDisabled')} />
      ) : null}
      <ListCard
        columns={columns}
        columnSettingKey="product-branches"
        actions={
          <>
            {branches.error ? (
              <Typography.Text type="danger">{errorText(branches.error, t, 'common.message.failed')}</Typography.Text>
            ) : null}
            <Button
              type="primary"
              onClick={() => {
                setEditing(null)
                setModalOpen(true)
              }}
            >
              {t('branch.action.create')}
            </Button>
          </>
        }
        rowKey="id"
        loading={branches.isPending}
        dataSource={branches.data?.items ?? []}
        pagination={false}
      />
      <BranchEditModal
        productId={productId}
        branch={editing}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={invalidate}
      />
    </PageContainer>
  )
}
