/** @route /projects @title project.title.list @perm project-view @menu project @order 2 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  HasPerm,
  ListCard,
  PageContainer,
  Popconfirm,
  Space,
  StatusTag,
  type TableColumnsType,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { RowNameLink } from '../../../shared/row-name-link'
import { withParam } from '../../../shared/url'
import { deleteProjectAction, fetchProjects, type ProjectView, qk } from '../api/project.api'
import { ProjectFormModal } from '../forms/project-form-modal'
import { statusTone } from '../model'

/** 项目列表（T-3 / project §6 L 范式：状态下拉筛选 = filters[status]，创建含关联产品）。
 * 筛选值域来自 meta/project（前端不留常量清单）。 */
export default function ProjectListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)
  const projectMeta = useMetaOptions('project')

  const status = searchParams.get('status') ?? ''
  const model = searchParams.get('model') ?? ''
  const acl = searchParams.get('acl') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const projects = useQuery({
    queryKey: qk.project.list({ status, model, acl, priority, q, page }),
    queryFn: () =>
      fetchProjects({
        page,
        limit: 20,
        q,
        filters: { type: 'project', status, model, acl, priority },
      }),
  })
  const remove = useMutation({
    mutationFn: (projectId: number) => deleteProjectAction(projectId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['listProjects'] })
      void queryClient.invalidateQueries({ queryKey: ['getProject'] })
    },
    // 有未删执行或未删关联需求 → 42203（project §5 delete 守卫）
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  const columns: TableColumnsType<ProjectView> = [
    { title: t('project.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('project.field.name'),
      dataIndex: 'name',
      render: (name: string, record: ProjectView) => <RowNameLink to={`/projects/${record.id}`}>{name}</RowNameLink>,
    },
    {
      title: t('project.field.model'),
      dataIndex: 'model',
      width: 110,
      render: (model: string) => t(`project.model.${model}`),
    },
    {
      title: t('project.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (value: string) => <StatusTag tone={statusTone(value)}>{t(`project.status.${value}`)}</StatusTag>,
    },
    {
      title: t('project.field.priority'),
      dataIndex: 'priority',
      width: 90,
      render: (priority: number) => t(`common.priority.${priority}`),
    },
    { title: t('project.field.pm'), dataIndex: 'pm', width: 110 },
    { title: t('project.field.beginDate'), dataIndex: 'beginDate', width: 120 },
    { title: t('project.field.endDate'), dataIndex: 'endDate', width: 120 },
    {
      title: t('project.field.progress'),
      dataIndex: 'progress',
      width: 100,
      render: (progress: number) => `${progress ?? 0}%`,
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 160,
      render: (_: unknown, record: ProjectView) => (
        <Space size={4}>
          <HasPerm perm="project-delete">
            <Popconfirm title={t('project.message.deleteProjectHint')} onConfirm={() => remove.mutate(record.id)}>
              <Button size="small" type="link" danger aria-label={`project-delete-${record.id}`}>
                {t('common.action.delete')}
              </Button>
            </Popconfirm>
          </HasPerm>
        </Space>
      ),
    },
  ]

  return (
    <PageContainer>
      <ListFilterForm
        fields={[
          keywordField(t('project.field.name'), t('common.action.search')),
          selectField('status', t('common.field.status'), projectMeta.options('status')),
          selectField('model', t('project.field.model'), projectMeta.options('model')),
          selectField('priority', t('common.field.priority'), projectMeta.options('priority')),
          selectField('acl', t('project.field.acl'), projectMeta.options('acl')),
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="project-list"
        actions={
          <HasPerm perm="project-create">
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t('project.action.createProject')}
            </Button>
          </HasPerm>
        }
        rowKey="id"
        loading={projects.isPending}
        dataSource={projects.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: 20,
          total: projects.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <ProjectFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </PageContainer>
  )
}
