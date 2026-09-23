/** @route /admin/online-users @title platform.onlineUser.title @perm online-user-view @menu admin/monitor @order 1 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  ConfirmAction,
  EmptyState,
  HasPerm,
  ListCard,
  PageContainer,
  PageLoading,
  Space,
  StatusTag,
  type TableColumnsType,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { formatDateTime } from '../../../shared/format'
import { DEFAULT_PAGE_SIZE } from '../../../shared/list-dsl'
import { keywordField, ListFilterForm } from '../../../shared/list-filter'
import { paramNumber, withParam } from '../../../shared/url'
import { fetchOnlineUsers, kickOnlineUserAction, type OnlineUserView } from '../api/platform.api'

/** 在线态是活数据（有人登录、登出、被强退），页面开着就定期重取；30s 与通知铃铛同量级。 */
const REFRESH_MS = 30_000

/**
 * 在线用户（T13 P1-1）：一屏看谁在线（账号/IP/浏览器/登录与最后活动时间），行内可强退。
 *
 * 数据就是 session 表的现存行——登出与过期都物理删行，所以「不在列表里」= 不在线，没有状态位可算。
 * 自己那条会话标 current 且不给强退入口：点了等于把自己登出，管理页面没有这个意图。
 * 强退本身幂等（对方刚登出也返回成功），故失败提示只可能是权限或网络。
 */
export default function OnlineUserListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = paramNumber(searchParams, 'page', 1)
  const account = searchParams.get('filters[account]') ?? ''

  const onlineUsers = useQuery({
    queryKey: ['listOnlineUsers', { page, account }],
    refetchInterval: REFRESH_MS,
    // filters 字面量留在调用点：check-filter-fields 按它对齐契约的 filters[x] 名单（06 A6-2）
    queryFn: () => fetchOnlineUsers({ page, limit: DEFAULT_PAGE_SIZE, filters: { account } }),
  })

  const kick = useMutation({
    mutationFn: (sessionId: string) => kickOnlineUserAction(sessionId),
    onSuccess: () => {
      message.success(t('platform.onlineUser.message.kicked'))
      void queryClient.invalidateQueries({ queryKey: ['listOnlineUsers'] })
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  const columns: TableColumnsType<OnlineUserView> = [
    {
      title: t('platform.onlineUser.field.account'),
      dataIndex: 'account',
      width: 180,
      render: (account: string, record: OnlineUserView) => (
        <Space size={4}>
          <span>{account}</span>
          {record.current ? <StatusTag tone="active">{t('platform.onlineUser.current')}</StatusTag> : null}
        </Space>
      ),
    },
    {
      title: t('platform.onlineUser.field.ip'),
      dataIndex: 'ip',
      width: 150,
      render: (ip: string | null | undefined) => ip ?? t('common.field.none'),
    },
    {
      // UA 是长串：截断显示、悬停给全量，行不被撑高换行（与审计日志的明细列同款）
      title: t('platform.onlineUser.field.userAgent'),
      dataIndex: 'userAgent',
      render: (userAgent: string | null | undefined) =>
        userAgent ? (
          <Typography.Text ellipsis style={{ maxWidth: 260 }} title={userAgent}>
            {userAgent}
          </Typography.Text>
        ) : (
          t('common.field.none')
        ),
    },
    {
      title: t('platform.onlineUser.field.createdAt'),
      dataIndex: 'createdAt',
      width: 170,
      render: (createdAt: string | undefined) => formatDateTime(createdAt),
    },
    {
      title: t('platform.onlineUser.field.lastSeenAt'),
      dataIndex: 'lastSeenAt',
      width: 170,
      render: (lastSeenAt: string | undefined) => formatDateTime(lastSeenAt),
    },
    {
      title: t('platform.onlineUser.field.expiresAt'),
      dataIndex: 'expiresAt',
      width: 170,
      render: (expiresAt: string | undefined) => formatDateTime(expiresAt),
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 100,
      render: (_: unknown, record: OnlineUserView) =>
        record.current ? null : (
          <HasPerm perm="online-user-kick">
            <ConfirmAction
              title={t('platform.onlineUser.kickTitle', { account: record.account })}
              description={t('platform.onlineUser.kickDescription')}
              onConfirm={() => kick.mutate(record.id)}
            >
              <Button type="link" size="small" danger>
                {t('platform.onlineUser.action.kick')}
              </Button>
            </ConfirmAction>
          </HasPerm>
        ),
    },
  ]

  if (onlineUsers.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  if (onlineUsers.error) {
    return (
      <PageContainer>
        <Typography.Text type="secondary">{errorText(onlineUsers.error, t, 'common.loading')}</Typography.Text>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <ListFilterForm
        fields={[keywordField(t('platform.onlineUser.filter.account'), t('common.action.search'), 'filters[account]')]}
      />
      <ListCard<OnlineUserView>
        columns={columns}
        columnSettingKey="platform-online-users"
        rowKey="id"
        dataSource={onlineUsers.data.items}
        pagination={{
          current: page,
          pageSize: DEFAULT_PAGE_SIZE,
          total: onlineUsers.data.total,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
        locale={{ emptyText: <EmptyState description={t('platform.onlineUser.empty')} /> }}
      />
    </PageContainer>
  )
}
