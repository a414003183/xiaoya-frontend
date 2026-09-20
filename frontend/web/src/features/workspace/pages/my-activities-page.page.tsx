/** @route /my/activities @title workspace.title.activities @perm my-view @menu dashboard @order 6 */

import { useInfiniteQuery } from '@tanstack/react-query'
import { Button, Card, EmptyState, PageContainer, PageLoading, Space, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { DEFAULT_PAGE_SIZE } from '../../../shared/list-dsl'
import { type ActivityPage, fetchMyActivities, qk } from '../api/workspace.api'
import { groupActivitiesByDate } from '../model'

const PAGE_SIZE = DEFAULT_PAGE_SIZE

/** 我的动态（T-9 / §6 L 范式：actor=@me 游标倒序 + limit/beforeId「加载更多」，按日期分组）。 */
export default function MyActivitiesPage() {
  const { t } = useTranslation()
  const timeline = useInfiniteQuery({
    queryKey: qk.workspace.myActivities({ limit: PAGE_SIZE, cursor: true }),
    queryFn: ({ pageParam }: { pageParam: number | undefined }) =>
      fetchMyActivities(pageParam === undefined ? { limit: PAGE_SIZE } : { limit: PAGE_SIZE, beforeId: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last: ActivityPage): number | undefined => {
      if (!last.hasMore || last.items.length === 0) {
        return undefined
      }
      return last.items[last.items.length - 1]?.id
    },
  })

  const items = timeline.data?.pages.flatMap((page) => page.items) ?? []
  const groups = groupActivitiesByDate(items)

  return (
    <PageContainer>
      <Card>
        {timeline.isPending ? (
          <PageLoading />
        ) : items.length === 0 ? (
          <EmptyState description={t('platform.activity.empty')} />
        ) : (
          <div className="tw:flex tw:flex-col tw:gap-4">
            {groups.map((group) => (
              <section key={group.date}>
                <Typography.Title level={5} className="tw:mb-2">
                  {group.date}
                </Typography.Title>
                <ul className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-2 tw:p-0">
                  {group.items.map((item) => (
                    <li key={item.id} className="tw:border-b tw:border-solid tw:border-border tw:pb-2">
                      <Space size="small" wrap>
                        <Typography.Text strong>{item.actor}</Typography.Text>
                        <Typography.Text>
                          {t(`platform.activity.action.${item.action}`, { defaultValue: item.action })}
                        </Typography.Text>
                        <Typography.Text type="secondary">{new Date(item.occurredAt).toLocaleString()}</Typography.Text>
                        {item.remark ? <Typography.Text type="secondary">{item.remark}</Typography.Text> : null}
                      </Space>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {timeline.hasNextPage ? (
              <Button loading={timeline.isFetchingNextPage} onClick={() => void timeline.fetchNextPage()}>
                {t('platform.activity.loadMore')}
              </Button>
            ) : null}
          </div>
        )}
      </Card>
    </PageContainer>
  )
}
