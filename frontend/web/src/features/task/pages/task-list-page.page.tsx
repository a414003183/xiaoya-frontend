/** @route /executions/:executionId/tasks @title task.title.list @perm task-view @hide @activeMenu /executions */
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  HasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  Segmented,
  Space,
  StatusTag,
  type TableColumnsType,
} from '@zentao/design-system'
import { type Key, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { dateRangeField, keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { RowNameLink } from '../../../shared/row-name-link'
import { withParam } from '../../../shared/url'
import { csvQuery, useCsvExport } from '../../../shared/use-csv-export'
import { fetchTasks, qk, type TaskView, tasksCsvPath } from '../api/task.api'
import { TaskCreateModal } from '../forms/task-create-modal'
import { buildTaskTree, isOverdue, statusTone, type TaskNode, taskProgress } from '../model'

/** 树全部行 id（受控展开：默认全展开，用户折叠后以覆盖值优先）。 */
function nodeIds(nodes: readonly TaskNode[]): number[] {
  return nodes.flatMap((node) => [node.id, ...nodeIds(node.children)])
}

/** 任务列表（T-10 / task §6 L 范式：树状/平铺切换，多选进批量，带 parentId 创建子任务）。
 * embedded=true 供 execution 详情页签内嵌：父页已有 PageContainer/PageHeader，只渲染列表体。 */
export default function TaskListPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const executionId = Number(useParams().executionId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [createParentId, setCreateParentId] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState<number[] | null>(null)
  const csv = useCsvExport()
  const taskMeta = useMetaOptions('task')

  const view = searchParams.get('view') ?? 'tree'
  const status = searchParams.get('status') ?? ''
  const type = searchParams.get('type') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const deadline = searchParams.get('deadline') ?? ''
  const closedReason = searchParams.get('closedReason') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)
  const treeView = view === 'tree'

  const tasks = useQuery({
    queryKey: qk.task.list(executionId, { view, status, type, priority, deadline, closedReason, q, page }),
    queryFn: () =>
      fetchTasks(
        executionId,
        treeView
          ? { limit: 200, sort: 'id', q, filters: { status, type, priority, deadline, closedReason } }
          : { page, limit: 20, q, filters: { status, type, priority, deadline, closedReason } },
      ),
  })
  const items = tasks.data?.items ?? []
  const tree = buildTaskTree(items)
  const today = new Date().toISOString().slice(0, 10)
  const expandedRowKeys = collapsed ?? nodeIds(tree)

  const columns: TableColumnsType<TaskNode | TaskView> = [
    { title: t('task.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('task.field.title'),
      dataIndex: 'title',
      render: (title: string, record: TaskView) => (
        <Space size={4}>
          <RowNameLink to={`/tasks/${record.id}`}>{title}</RowNameLink>
          {isOverdue(record, today) ? <StatusTag tone="error">{t('task.message.overdue')}</StatusTag> : null}
        </Space>
      ),
    },
    { title: t('task.field.type'), dataIndex: 'type', width: 90, render: (value: string) => t(`task.type.${value}`) },
    {
      title: t('task.field.priority'),
      dataIndex: 'priority',
      width: 90,
      render: (value: number) => t(`common.priority.${value}`),
    },
    {
      title: t('task.field.status'),
      dataIndex: 'status',
      width: 100,
      render: (value: string) => <StatusTag tone={statusTone(value)}>{t(`task.status.${value}`)}</StatusTag>,
    },
    { title: t('task.field.assignee'), dataIndex: 'assignee', width: 110 },
    { title: t('task.field.estimate'), dataIndex: 'estimateHours', width: 100 },
    { title: t('task.field.consumed'), dataIndex: 'consumedHours', width: 100 },
    { title: t('task.field.left'), dataIndex: 'leftHours', width: 100 },
    { title: t('task.field.deadline'), dataIndex: 'deadline', width: 120 },
    {
      title: t('task.field.progress'),
      key: 'progress',
      width: 90,
      render: (_: unknown, record: TaskView) => `${taskProgress(record)}%`,
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 160,
      render: (_: unknown, record: TaskView) => (
        <Space size={4}>
          <HasPerm perm="task-create">
            <Button
              size="small"
              type="link"
              disabled={record.parentId !== 0}
              onClick={() => setCreateParentId(record.id)}
            >
              {t('task.action.createChild')}
            </Button>
          </HasPerm>
        </Space>
      ),
    },
  ]

  const list = (
    <>
      <ListFilterForm
        fields={[
          keywordField(t('task.field.keywords'), t('common.action.search')),
          selectField('status', t('common.field.status'), taskMeta.options('status')),
          selectField('type', t('common.field.type'), taskMeta.options('type')),
          selectField('priority', t('common.field.priority'), taskMeta.options('priority')),
          dateRangeField('deadline', t('task.field.deadline'), {
            from: 'task-list-filter-deadline-from',
            to: 'task-list-filter-deadline-to',
          }),
          selectField('closedReason', t('task.field.closedReason'), taskMeta.options('closedReason')),
        ]}
      />
      <ListCard<TaskNode | TaskView>
        columns={columns}
        columnSettingKey="task-list"
        actions={
          <>
            <HasPerm perm="task-create">
              <Button type="primary" onClick={() => setCreateParentId(0)}>
                {t('task.action.create')}
              </Button>
            </HasPerm>
            <HasPerm perm="task-create">
              <Button onClick={() => navigate(`/executions/${executionId}/tasks/batch-create`)}>
                {t('task.action.batchCreate')}
              </Button>
            </HasPerm>
            <Button
              disabled={selectedIds.length === 0}
              onClick={() => navigate(`/tasks/batch-edit?executionId=${executionId}&ids=${selectedIds.join(',')}`)}
            >
              {t('task.action.batchEdit')}
            </Button>
            <Button
              loading={csv.exporting}
              onClick={() =>
                void csv.exportCsv(
                  tasksCsvPath(executionId),
                  csvQuery({ q, filters: { status, type, priority, deadline, closedReason } }),
                  'tasks',
                )
              }
            >
              {t('common.action.exportCsv')}
            </Button>
          </>
        }
        toolbar={
          <Segmented
            aria-label="task-view"
            value={view}
            onChange={(next) => setSearchParams(withParam(searchParams, 'view', String(next)))}
            options={[
              { label: t('task.action.tree'), value: 'tree' },
              { label: t('task.action.flat'), value: 'flat' },
            ]}
          />
        }
        rowKey="id"
        loading={tasks.isPending}
        dataSource={treeView ? tree : items}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys.map((key) => Number(key))),
        }}
        {...(treeView
          ? {
              pagination: false as const,
              expandable: {
                expandedRowKeys,
                onExpandedRowsChange: (keys: readonly Key[]) => setCollapsed(keys.map((key) => Number(key))),
              },
            }
          : {
              pagination: {
                current: page,
                pageSize: 20,
                total: tasks.data?.total ?? 0,
                onChange: (next: number) => setSearchParams(withParam(searchParams, 'page', next)),
              },
            })}
      />
      <TaskCreateModal
        executionId={executionId}
        defaultParentId={createParentId ?? 0}
        open={createParentId !== null}
        onClose={() => setCreateParentId(null)}
      />
    </>
  )

  if (embedded) {
    return list
  }

  return (
    <PageContainer>
      <PageHeader title={t('task.title.list')} backTo="/executions" />
      {list}
    </PageContainer>
  )
}
