// list-standard: exempt (sub-table) — 详情页内的关联需求简表，非列表页
import { EmptyState, Table, type TableColumnsType, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import type { StoryView } from '../api/product.api'

/**
 * 关联需求简表（plan/release/build 详情页共用，跨域只读）：
 * 只读子表，用 design-system 出口的 antd Table（T08：全仓不再手写原生 table 元素）。
 */
export function StoryTable({ stories, onOpen }: { stories: StoryView[]; onOpen: (storyId: number) => void }) {
  const { t } = useTranslation()
  const columns: TableColumnsType<StoryView> = [
    { title: t('story.field.id'), dataIndex: 'id', width: 90 },
    {
      title: t('story.field.title'),
      dataIndex: 'title',
      render: (_: unknown, story: StoryView) => (
        <Typography.Link onClick={() => onOpen(story.id)}>{story.title}</Typography.Link>
      ),
    },
    {
      title: t('story.field.status'),
      dataIndex: 'status',
      width: 120,
      render: (status: string) => t(`story.status.${status}`),
    },
    {
      title: t('story.field.stage'),
      dataIndex: 'stage',
      width: 120,
      render: (stage: string) => t(`story.stage.${stage}`),
    },
  ]
  return (
    <Table<StoryView>
      columns={columns}
      rowKey="id"
      size="small"
      dataSource={stories}
      pagination={false}
      locale={{ emptyText: <EmptyState description={t('common.empty')} /> }}
    />
  )
}
