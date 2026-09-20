/** @route /my/tasks @title workspace.title.myTasks @perm my-view @menu dashboard @order 3 */

import { useQuery } from '@tanstack/react-query'
import { ListCard, PageContainer, StatusTag, type TableColumnsType, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE } from '../../../shared/list-dsl'
import { dateRangeField, keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { paramNumber, withParam } from '../../../shared/url'
import { statusTone as taskStatusTone } from '../../task'
import { fetchMyTasks, qk, type TaskView } from '../api/workspace.api'
import { normalizeMyRole } from '../model'

const PAGE_SIZE = DEFAULT_PAGE_SIZE

/** 我的任务（T-9 / §6 L 范式：role/状态/类型/优先级 下拉 + 关键词，查询提交；role → 目标域过滤字段的映射是服务端真源 §3.4）。
 * role 选项来自 meta/workspace，其余业务枚举来自 meta/task（前端不留清单）。 */
export default function MyTasksPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const role = normalizeMyRole('tasks', searchParams.get('role'))
  const status = searchParams.get('status') ?? ''
  const type = searchParams.get('type') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const deadline = searchParams.get('deadline') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = paramNumber(searchParams, 'page', 1)
  const myMeta = useMetaOptions('workspace')
  const taskMeta = useMetaOptions('task')

  const tasks = useQuery({
    queryKey: qk.workspace.myTasks({ role, status, type, priority, deadline, q, page }),
    queryFn: () => fetchMyTasks(role, { page, limit: PAGE_SIZE, q, filters: { status, type, priority, deadline } }),
  })

  const columns: TableColumnsType<TaskView> = [
    { title: t('task.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('task.field.title'),
      dataIndex: 'title',
      render: (title: string, record: TaskView) => (
        <Typography.Link onClick={() => navigate(`/tasks/${record.id}`)}>{title}</Typography.Link>
      ),
    },
    {
      title: t('task.field.type'),
      dataIndex: 'type',
      width: 100,
      render: (value: string) => t(`task.type.${value}`),
    },
    {
      title: t('task.field.priority'),
      dataIndex: 'priority',
      width: 90,
      render: (value: number) => t(`common.priority.${value}`),
    },
    {
      title: t('task.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (value: string) => <StatusTag tone={taskStatusTone(value)}>{t(`task.status.${value}`)}</StatusTag>,
    },
    { title: t('task.field.assignee'), dataIndex: 'assignee', width: 110 },
    { title: t('task.field.deadline'), dataIndex: 'deadline', width: 120 },
  ]

  return (
    <PageContainer>
      <ListFilterForm
        fields={[
          keywordField(t('task.field.keywords'), t('common.action.search')),
          selectField('role', t('workspace.title.myTasks'), myMeta.options('taskRole')),
          selectField('status', t('common.field.status'), taskMeta.options('status')),
          selectField('type', t('common.field.type'), taskMeta.options('type')),
          selectField('priority', t('common.field.priority'), taskMeta.options('priority')),
          dateRangeField('deadline', t('task.field.deadline'), {
            from: 'my-tasks-filter-deadline-from',
            to: 'my-tasks-filter-deadline-to',
          }),
        ]}
      />
      <ListCard<TaskView>
        columns={columns}
        columnSettingKey="workspace-my-tasks"
        rowKey="id"
        loading={tasks.isPending}
        dataSource={tasks.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: tasks.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
    </PageContainer>
  )
}
