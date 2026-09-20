/** @route /projects/:projectId/executions @title project.title.executionList @perm execution-view @hide @activeMenu /projects */
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  HasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  StatusTag,
  type TableColumnsType,
  Typography,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { fetchProjectExecutions, type ProjectView, qk } from '../api/project.api'
import { ExecutionFormModal } from '../forms/execution-form-modal'
import { statusTone } from '../model'

/** 项目下执行列表（T-3 / project §6 L 范式）。 */
export default function ProjectExecutionListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const projectId = Number(useParams().projectId)
  const [createOpen, setCreateOpen] = useState(false)

  const executions = useQuery({
    queryKey: qk.project.executions(projectId),
    queryFn: () => fetchProjectExecutions(projectId, { limit: 200 }),
  })

  const columns: TableColumnsType<ProjectView> = [
    { title: t('project.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('project.field.name'),
      dataIndex: 'name',
      render: (name: string, record: ProjectView) => (
        <Typography.Link onClick={() => navigate(`/executions/${record.id}`)}>{name}</Typography.Link>
      ),
    },
    {
      title: t('project.field.type'),
      dataIndex: 'type',
      width: 110,
      render: (type: string) => t(`project.type.${type}`),
    },
    {
      title: t('project.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (status: string) => <StatusTag tone={statusTone(status)}>{t(`project.status.${status}`)}</StatusTag>,
    },
    { title: t('project.field.beginDate'), dataIndex: 'beginDate', width: 120 },
    { title: t('project.field.endDate'), dataIndex: 'endDate', width: 120 },
    { title: t('project.field.pm'), dataIndex: 'pm', width: 110 },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('project.title.executionList')}
        backTo={`/projects/${projectId}`}
        extra={
          <HasPerm perm="execution-create">
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t('project.action.createExecution')}
            </Button>
          </HasPerm>
        }
      />
      <ListCard
        columns={columns}
        columnSettingKey="project-execution-list"
        rowKey="id"
        loading={executions.isPending}
        dataSource={executions.data?.items ?? []}
        pagination={false}
      />
      <ExecutionFormModal projectId={projectId} open={createOpen} onClose={() => setCreateOpen(false)} />
    </PageContainer>
  )
}
