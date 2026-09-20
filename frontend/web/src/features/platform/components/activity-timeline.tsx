import { useInfiniteQuery } from '@tanstack/react-query'
import { Button, EmptyState, Spin, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import type { ActivityItem, ActivityPage } from '../api/platform.api'

/**
 * 动态流时间线（platform 卡 §5 末段协议）：倒序游标「加载更多」。
 * 各域详情页动态页签复用：通过 fetchPage 注入本域动态端点（如 GET /accounts/{id}/activities）。
 */
export function ActivityTimeline({ fetchPage }: { fetchPage: (beforeId?: number) => Promise<ActivityPage> }) {
  const { t } = useTranslation()
  const timeline = useInfiniteQuery({
    queryKey: ['activities', fetchPage] as const,
    queryFn: ({ pageParam }: { pageParam: number | undefined }) => fetchPage(pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last: ActivityPage): number | undefined => {
      if (!last.hasMore || last.items.length === 0) {
        return undefined
      }
      return last.items[last.items.length - 1]?.id
    },
  })

  if (timeline.isPending) {
    return <Spin />
  }
  if (timeline.error) {
    return <Typography.Text type="secondary">{timeline.error.message}</Typography.Text>
  }
  const items: ActivityItem[] = timeline.data?.pages.flatMap((page) => page.items) ?? []
  if (items.length === 0) {
    return <EmptyState description={t('platform.activity.empty')} />
  }

  return (
    <div className="tw:flex tw:flex-col tw:gap-3">
      <ul className="tw:m-0 tw:list-none tw:p-0 tw:flex tw:flex-col tw:gap-3">
        {items.map((item) => (
          <li key={item.id} className="tw:border-b tw:border-solid tw:border-border tw:pb-2">
            <Typography.Text strong>{item.actor}</Typography.Text>{' '}
            <Typography.Text>
              {t(`platform.activity.action.${item.action}`, { defaultValue: item.action })}
            </Typography.Text>
            <Typography.Text type="secondary" className="tw:ml-2">
              {new Date(item.occurredAt).toLocaleString()}
            </Typography.Text>
            {item.remark ? (
              <div>
                <Typography.Text type="secondary">{item.remark}</Typography.Text>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {timeline.hasNextPage ? (
        <Button loading={timeline.isFetchingNextPage} onClick={() => void timeline.fetchNextPage()}>
          {t('platform.activity.loadMore')}
        </Button>
      ) : null}
    </div>
  )
}
