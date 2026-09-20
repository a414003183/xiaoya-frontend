/** @route /my/stories @title workspace.title.myStories @perm my-view @menu dashboard @order 5 */

import { useQuery } from '@tanstack/react-query'
import { ListCard, PageContainer, StatusTag, type TableColumnsType, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE } from '../../../shared/list-dsl'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { paramNumber, withParam } from '../../../shared/url'
import { priorityKey, storyTone } from '../../story'
import { fetchMyStories, qk, type StoryView } from '../api/workspace.api'
import { normalizeMyRole } from '../model'

const PAGE_SIZE = DEFAULT_PAGE_SIZE

/** 我的需求（T-9 / §6 L 范式：role/状态/类型/优先级 下拉 + 关键词，查询提交）
 * role 选项来自 meta/workspace，其余业务枚举来自 meta/story（前端不留清单）。 */
export default function MyStoriesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const role = normalizeMyRole('stories', searchParams.get('role'))
  const status = searchParams.get('status') ?? ''
  const type = searchParams.get('type') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const stage = searchParams.get('stage') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = paramNumber(searchParams, 'page', 1)
  const myMeta = useMetaOptions('workspace')
  const storyMeta = useMetaOptions('story')

  const stories = useQuery({
    queryKey: qk.workspace.myStories({ role, status, type, priority, stage, q, page }),
    queryFn: () => fetchMyStories(role, { page, limit: PAGE_SIZE, q, filters: { status, type, priority, stage } }),
  })

  const columns: TableColumnsType<StoryView> = [
    { title: t('story.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('story.field.title'),
      dataIndex: 'title',
      render: (title: string, record: StoryView) => (
        <Typography.Link onClick={() => navigate(`/stories/${record.id}`)}>{title}</Typography.Link>
      ),
    },
    {
      title: t('story.field.type'),
      dataIndex: 'type',
      width: 100,
      render: (value: string) => t(`story.type.${value}`),
    },
    {
      title: t('story.field.priority'),
      dataIndex: 'priority',
      width: 90,
      render: (value: number) => t(priorityKey(value)),
    },
    {
      title: t('story.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (value: string) => <StatusTag tone={storyTone(value)}>{t(`story.status.${value}`)}</StatusTag>,
    },
    {
      title: t('story.field.stage'),
      dataIndex: 'stage',
      width: 110,
      render: (value: string) => t(`story.stage.${value}`),
    },
    { title: t('story.field.assignee'), dataIndex: 'assignee', width: 110 },
  ]

  return (
    <PageContainer>
      <ListFilterForm
        fields={[
          keywordField(t('story.field.keywords'), t('common.action.search')),
          selectField('role', t('workspace.title.myStories'), myMeta.options('storyRole')),
          selectField('status', t('common.field.status'), storyMeta.options('status')),
          selectField('type', t('common.field.type'), storyMeta.options('type')),
          selectField('priority', t('common.field.priority'), storyMeta.options('priority')),
          selectField('stage', t('story.field.stage'), storyMeta.options('stage')),
        ]}
      />
      <ListCard<StoryView>
        columns={columns}
        columnSettingKey="workspace-my-stories"
        rowKey="id"
        loading={stories.isPending}
        dataSource={stories.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: stories.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
    </PageContainer>
  )
}
