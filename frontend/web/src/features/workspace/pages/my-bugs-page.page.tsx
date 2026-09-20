/** @route /my/bugs @title workspace.title.myBugs @perm my-view @menu dashboard @order 4 */

import { useQuery } from '@tanstack/react-query'
import { ListCard, PageContainer, StatusTag, type TableColumnsType, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE } from '../../../shared/list-dsl'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { paramNumber, withParam } from '../../../shared/url'
import { bugTone, severityKey } from '../../quality'
import { type BugView, fetchMyBugs, qk } from '../api/workspace.api'
import { normalizeMyRole } from '../model'

const PAGE_SIZE = DEFAULT_PAGE_SIZE

/** 我的 Bug（T-9 / §6 L 范式：role/状态/严重程度/优先级 下拉 + 关键词，查询提交）
 * role 选项来自 meta/workspace，其余业务枚举来自 meta/bug（前端不留清单）。 */
export default function MyBugsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const role = normalizeMyRole('bugs', searchParams.get('role'))
  const status = searchParams.get('status') ?? ''
  const severity = searchParams.get('severity') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = paramNumber(searchParams, 'page', 1)
  const myMeta = useMetaOptions('workspace')
  const bugMeta = useMetaOptions('bug')

  const bugs = useQuery({
    queryKey: qk.workspace.myBugs({ role, status, severity, priority, q, page }),
    queryFn: () =>
      fetchMyBugs(role, {
        page,
        limit: PAGE_SIZE,
        q,
        filters: { status, severity, priority },
      }),
  })

  const columns: TableColumnsType<BugView> = [
    { title: t('bug.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('bug.field.title'),
      dataIndex: 'title',
      render: (title: string, record: BugView) => (
        <Typography.Link onClick={() => navigate(`/bugs/${record.id}`)}>{title}</Typography.Link>
      ),
    },
    {
      title: t('bug.field.severity'),
      dataIndex: 'severity',
      width: 90,
      render: (value: number) => t(severityKey(value)),
    },
    {
      title: t('bug.field.priority'),
      dataIndex: 'priority',
      width: 90,
      render: (value: number) => t(`common.priority.${value}`),
    },
    {
      title: t('bug.field.status'),
      dataIndex: 'status',
      width: 100,
      render: (value: string) => <StatusTag tone={bugTone(value)}>{t(`bug.status.${value}`)}</StatusTag>,
    },
    { title: t('bug.field.assignee'), dataIndex: 'assignee', width: 110 },
    {
      title: t('bug.field.resolution'),
      dataIndex: 'resolution',
      render: (value: string | null) => (value ? t(`bug.resolution.${value}`) : '-'),
    },
  ]

  return (
    <PageContainer>
      <ListFilterForm
        fields={[
          keywordField(t('bug.field.keywords'), t('common.action.search')),
          selectField('role', t('workspace.title.myBugs'), myMeta.options('bugRole')),
          selectField('status', t('common.field.status'), bugMeta.options('status')),
          selectField('severity', t('bug.field.severity'), bugMeta.options('severity')),
          selectField('priority', t('common.field.priority'), bugMeta.options('priority')),
        ]}
      />
      <ListCard<BugView>
        columns={columns}
        columnSettingKey="workspace-my-bugs"
        rowKey="id"
        loading={bugs.isPending}
        dataSource={bugs.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: bugs.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
    </PageContainer>
  )
}
