import { useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Card,
  EmptyState,
  ListCard,
  PageLoading,
  StatusTag,
  type TableColumnsType,
  Typography,
} from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE } from '../../../shared/list-dsl'
import { paramNumber, withParam } from '../../../shared/url'
import { type AuditLogView, fetchAuditLogs } from '../api/platform.api'

export type AuditLogTableProps = {
  /** 列设置的资源键（服务端个人偏好的主键，01 §3.3）；两页各一份，互不串列。 */
  columnSettingKey: string
  /**
   * 预设动作过滤（登录日志恒 `login,login-failed`，逗号即服务端 IN）：**不是**可编辑条件，
   * 本组件拼请求时恒用它覆盖 URL 上的同名键，页面上也没有对应控件（故手改 URL 也不生效）。
   */
  actionFilter?: string
}

/** 对象列：objectType 与 objectId 合成一格（两者都可空，缺谁显示谁；都没有显示短横）。 */
function objectLabel(record: AuditLogView): string {
  const type = record.objectType ?? ''
  const id = record.objectId === null || record.objectId === undefined ? '' : `#${record.objectId}`
  return [type, id].filter((part) => part !== '').join(' ') || '-'
}

/**
 * 只读审计流水表（platform 卡 §3.13）：操作日志 / 登录日志共用——两页的形状只差
 * 「筛选区有哪些条件」与 actionFilter 预设，表定义只此一份。
 *
 * 只读是数据侧的事实：`audit_log` 没有写端点，行由写请求的审计横切追加，故本组件
 * 没有任何行内动作、批量选择或删除入口（04 §7 审计不可篡改）。
 * 查询状态与页码一律在 URL（01 §3.3）：筛选区由宿主页用 ListFilterForm 写 URL，本组件只读它。
 */
export function AuditLogTable({ columnSettingKey, actionFilter }: AuditLogTableProps) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = paramNumber(searchParams, 'page', 1)
  const q = searchParams.get('q') ?? ''
  const action = actionFilter ?? searchParams.get('filters[action]') ?? ''
  const createdAt = searchParams.get('filters[createdAt]') ?? ''
  const list = useQuery({
    queryKey: ['listAuditLogs', { page, q, action, createdAt }],
    // filters 字面量留在调用点：check-filter-fields 按它对齐契约的 filters[x] 名单（06 A6-2）
    queryFn: () => fetchAuditLogs({ page, limit: DEFAULT_PAGE_SIZE, q, filters: { action, createdAt } }),
  })

  const columns: TableColumnsType<AuditLogView> = [
    { title: t('common.field.id'), dataIndex: 'id', width: 80 },
    {
      title: t('platform.auditLog.field.account'),
      dataIndex: 'account',
      width: 120,
      render: (account: string | null) => account ?? '-',
    },
    {
      /* 动作是技术值（login / account-create / `patch /api/v1/products/{productId}`），原样呈现不翻译；
         失败动作（`-failed` 收尾）给红标，登录爆破这类行在流水里一眼可辨。 */
      title: t('platform.auditLog.field.action'),
      dataIndex: 'action',
      width: 220,
      render: (action: string | null) =>
        action ? (
          <StatusTag tone={action.endsWith('-failed') ? 'error' : 'neutral'}>{action}</StatusTag>
        ) : (
          t('common.field.none')
        ),
    },
    {
      title: t('platform.auditLog.field.object'),
      key: 'object',
      width: 160,
      render: (_: unknown, record: AuditLogView) => objectLabel(record),
    },
    {
      /* 明细与链路 id 是长串（URI/追踪号）：截断显示、悬停给全量，行不被撑高换行。 */
      title: t('platform.auditLog.field.detail'),
      dataIndex: 'detail',
      render: (detail: string | null) =>
        detail ? (
          <Typography.Text ellipsis style={{ maxWidth: 280 }} title={detail}>
            {detail}
          </Typography.Text>
        ) : (
          '-'
        ),
    },
    {
      title: t('platform.auditLog.field.ip'),
      dataIndex: 'ip',
      width: 140,
      render: (ip: string | null) => ip ?? '-',
    },
    {
      title: t('platform.auditLog.field.traceId'),
      dataIndex: 'traceId',
      width: 200,
      render: (traceId: string | null) =>
        traceId ? (
          <Typography.Text ellipsis style={{ maxWidth: 180 }} title={traceId}>
            {traceId}
          </Typography.Text>
        ) : (
          '-'
        ),
    },
    {
      title: t('common.field.createdAt'),
      dataIndex: 'createdAt',
      width: 180,
      render: (createdAt: string) => new Date(createdAt).toLocaleString(),
    },
  ]

  if (list.isPending) {
    return <PageLoading />
  }
  if (list.error) {
    return (
      <Card>
        <Typography.Text type="secondary">{errorText(list.error, t, 'common.loading')}</Typography.Text>
      </Card>
    )
  }

  return (
    <ListCard<AuditLogView>
      columns={columns}
      columnSettingKey={columnSettingKey}
      rowKey="id"
      dataSource={list.data.items}
      pagination={{
        current: page,
        pageSize: DEFAULT_PAGE_SIZE,
        total: list.data.total,
        onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
      }}
      locale={{ emptyText: <EmptyState description={t('platform.auditLog.empty')} /> }}
    />
  )
}
