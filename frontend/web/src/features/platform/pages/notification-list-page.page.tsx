/** @route /notifications @title platform.notifications.title @menu dashboard @order 7 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { markNotificationRead } from '@zentao/api-client/generated'
import {
  Button,
  Card,
  EmptyState,
  ListCard,
  PageContainer,
  PageHeader,
  PageLoading,
  type TableColumnsType,
  Typography,
} from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { fetchNotifications, type NotificationView } from '../api/platform.api'

const OBJECT_ROUTES: Record<string, (id: number) => string> = {
  account: (id) => `/org/accounts/${id}`,
}

/** 通知列表页（platform 卡 §6；旧 message-browser）。 */
export default function NotificationListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const readAt = searchParams.get('readAt') ?? ''
  // 旧页签时代的 URL 值 unread 继续认（等价 @null）；值域来自 meta/notification 的 readAt 选项。
  const filter = readAt === 'unread' ? '@null' : readAt
  const notificationMeta = useMetaOptions('notification')

  const list = useQuery({
    queryKey: ['listNotifications', filter],
    queryFn: () => fetchNotifications({ page: 1, limit: 50, ...(filter ? { 'filters[readAt]': filter } : {}) }),
  })
  const markRead = useMutation({
    mutationFn: (notificationId: number) => markNotificationRead(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['listNotifications'] })
      void queryClient.invalidateQueries({ queryKey: ['getNotificationUnreadCount'] })
    },
  })

  const columns: TableColumnsType<NotificationView> = [
    {
      title: t('platform.notification.field.title'),
      dataIndex: 'title',
      render: (title: string, record: NotificationView) => {
        const route = OBJECT_ROUTES[record.objectType ?? '']
        return (
          <Button type="link" size="small" onClick={() => (route ? navigate(route(record.objectId)) : undefined)}>
            {title}
          </Button>
        )
      },
    },
    { title: t('platform.notification.field.type'), dataIndex: 'type' },
    {
      title: t('common.field.createdAt'),
      dataIndex: 'createdAt',
      render: (createdAt: string) => new Date(createdAt).toLocaleString(),
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      render: (_: unknown, record: NotificationView) =>
        record.readAt == null ? (
          <Button size="small" loading={markRead.isPending} onClick={() => void markRead.mutateAsync(record.id)}>
            {t('platform.notification.action.markRead')}
          </Button>
        ) : (
          <Typography.Text type="secondary">{t('platform.notification.status.read')}</Typography.Text>
        ),
    },
  ]

  if (list.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  if (list.error) {
    const message = errorText(list.error, t, 'common.loading')
    return (
      <PageContainer>
        <PageHeader title={t('platform.notifications.title')} />
        <Card>
          <Typography.Text type="secondary">{message}</Typography.Text>
        </Card>
      </PageContainer>
    )
  }

  const items = list.data.items

  return (
    <PageContainer>
      <PageHeader
        title={t('platform.notifications.title')}
        extra={
          <Typography.Link onClick={() => void navigate('/notifications/settings')}>
            {t('platform.notification.action.settings')}
          </Typography.Link>
        }
      />
      <ListFilterForm fields={[selectField('readAt', t('common.field.status'), notificationMeta.options('readAt'))]} />
      <ListCard
        columns={columns}
        columnSettingKey="platform-notifications"
        rowKey="id"
        dataSource={items}
        pagination={{ pageSize: 20, total: list.data.total }}
        locale={{ emptyText: <EmptyState description={t('platform.notification.empty')} /> }}
      />
    </PageContainer>
  )
}
