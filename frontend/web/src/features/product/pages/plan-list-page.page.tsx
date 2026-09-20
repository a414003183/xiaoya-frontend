/** @route /products/:productId/plans @title plan.title.list @perm plan-view @hide @activeMenu /products */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  EmptyState,
  Flex,
  HasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  PageLoading,
  Popconfirm,
  Segmented,
  Space,
  StatusTag,
  spacing,
  type TableColumnsType,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { RowNameLink } from '../../../shared/row-name-link'
import { withParam } from '../../../shared/url'
import { deletePlanAction, fetchPlans, type PlanView, qk } from '../api/product.api'
import { PlanCreateModal } from '../forms/plan-create-modal'
import { groupByStatus, PLAN_CLOSE_REASONS, PLAN_STATUSES, statusTone } from '../model'

/** 计划列表（T-10：列表/看板双视图；状态下拉筛选 = filters[status]，清空 = 全部；选项来自 meta/plan）。 */
export default function PlanListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const productId = Number(useParams().productId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<PlanView | null>(null)
  const planMeta = useMetaOptions('plan')

  const view = searchParams.get('view') ?? 'list'
  const status = searchParams.get('status') ?? ''

  const plans = useQuery({
    queryKey: [...qk.plan.list(productId), status],
    queryFn: () => fetchPlans(productId, { limit: 200, ...(status ? { filters: { status } } : {}) }),
  })
  const remove = useMutation({
    mutationFn: (planId: number) => deletePlanAction(planId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['listPlans'] })
      void queryClient.invalidateQueries({ queryKey: ['getPlan'] })
    },
    // 计划下仍有未删需求 → 42203（plan §5 delete 守卫）
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  if (plans.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  const items = plans.data?.items ?? []

  const columns: TableColumnsType<PlanView> = [
    { title: t('plan.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('plan.field.title'),
      dataIndex: 'title',
      render: (title: string, record: PlanView) => <RowNameLink to={`/plans/${record.id}`}>{title}</RowNameLink>,
    },
    {
      title: t('plan.field.status'),
      dataIndex: 'status',
      render: (status: string) => <StatusTag tone={statusTone(status)}>{t(`plan.status.${status}`)}</StatusTag>,
    },
    { title: t('plan.field.beginDate'), dataIndex: 'beginDate' },
    { title: t('plan.field.endDate'), dataIndex: 'endDate' },
    {
      title: t('plan.field.closedReason'),
      dataIndex: 'closedReason',
      render: (reason: string | null) =>
        reason && (PLAN_CLOSE_REASONS as readonly string[]).includes(reason) ? t(`plan.closeReason.${reason}`) : '-',
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      render: (_: unknown, record: PlanView) => (
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
          <HasPerm perm="plan-delete">
            <Popconfirm title={t('plan.message.deleteHint')} onConfirm={() => remove.mutate(record.id)}>
              <Button size="small" type="link" danger aria-label={`plan-delete-${record.id}`}>
                {t('common.action.delete')}
              </Button>
            </Popconfirm>
          </HasPerm>
        </Space>
      ),
    },
  ]
  // 两种视图（列表/看板）共用同一组功能按钮与显示态控件：看板无表格，靠卡头行复用（ListCard 只管列表）。
  const actions = (
    <Button
      type="primary"
      onClick={() => {
        setEditing(null)
        setCreateOpen(true)
      }}
    >
      {t('plan.action.create')}
    </Button>
  )
  const toolbar = (
    <>
      <Segmented
        value={view}
        onChange={(value) => setSearchParams(withParam(searchParams, 'view', value as string))}
        options={[
          { value: 'list', label: t('plan.view.list') },
          { value: 'board', label: t('plan.view.board') },
        ]}
      />
    </>
  )

  return (
    <PageContainer>
      <PageHeader title={t('plan.title.list')} backTo={`/products/${productId}`} />
      <ListFilterForm fields={[selectField('status', t('common.field.status'), planMeta.options('status'))]} />
      {view === 'list' ? (
        <ListCard
          columns={columns}
          columnSettingKey="product-plans"
          actions={actions}
          toolbar={toolbar}
          rowKey="id"
          dataSource={items}
          pagination={false}
        />
      ) : (
        <Card>
          {/* 看板卡头：与 ListCard 的「左功能按钮 / 右工具栏」同形 */}
          <Flex justify="space-between" align="center" gap={spacing.md} wrap style={{ marginBottom: spacing.lg }}>
            <Flex align="center" gap={spacing.sm} wrap>
              {actions}
            </Flex>
            <Flex align="center" gap={spacing.sm} wrap>
              {toolbar}
            </Flex>
          </Flex>
          <div className="tw:grid tw:grid-cols-4 tw:gap-3">
            {groupByStatus(items, PLAN_STATUSES).map((column) => (
              <Card key={column.status} size="small" title={t(`plan.status.${column.status}`)}>
                {column.items.length === 0 ? (
                  <EmptyState description={t('plan.message.emptyColumn')} />
                ) : (
                  <ul className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-2 tw:p-0">
                    {column.items.map((plan) => (
                      <li key={plan.id}>
                        <RowNameLink to={`/plans/${plan.id}`}>{plan.title}</RowNameLink>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        </Card>
      )}
      <PlanCreateModal productId={productId} plan={editing} open={createOpen} onClose={() => setCreateOpen(false)} />
    </PageContainer>
  )
}
