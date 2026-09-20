import { useQuery } from '@tanstack/react-query'
import { Badge, BellOutlined } from '@zentao/design-system'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  fetchUnreadCount,
  NOTIFICATION_STREAM_URL,
  UNREAD_COUNT_KEY,
  useInvalidateNotifications,
} from '../api/platform.api'

/** EventSource 工厂（测试可注入替身；jsdom 无 EventSource）。 */
export const eventSourceFactory = {
  create: (url: string): EventSource => new EventSource(url),
}

/** 通知铃铛（platform 卡 §6）：未读角标 + SSE 实时刷新，断线由 EventSource 自动重连。 */
export function NotificationBell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const invalidate = useInvalidateNotifications()
  const unread = useQuery({ queryKey: UNREAD_COUNT_KEY, queryFn: fetchUnreadCount })
  const connectedOnce = useRef(false)

  useEffect(() => {
    const source = eventSourceFactory.create(NOTIFICATION_STREAM_URL)
    source.addEventListener('notification.created', () => invalidate())
    source.onopen = () => {
      connectedOnce.current = true
    }
    // onerror 后浏览器 EventSource 自动重连；同时失效一次缓存兜底拉取
    source.onerror = () => invalidate()
    return () => source.close()
  }, [invalidate])

  return (
    <button
      type="button"
      aria-label={t('platform.notification.bell')}
      onClick={() => navigate('/notifications')}
      className="tw:cursor-pointer tw:bg-transparent tw:border-none"
    >
      <Badge count={unread.data ?? 0} size="small">
        <BellOutlined />
      </Badge>
    </button>
  )
}
