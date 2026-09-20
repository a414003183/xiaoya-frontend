/** @route /executions/:executionId @title project.title.executionDetail @perm execution-view @hide @activeMenu /executions */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  Descriptions,
  HasPerm,
  PageContainer,
  PageHeader,
  PageLoading,
  Space,
  StatusTag,
  Tabs,
  Typography,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { withParam } from '../../../shared/url'
import { ActivityTimeline } from '../../platform'
import { TaskListPage } from '../../task'
import {
  fetchExecution,
  fetchExecutionActivities,
  fetchExecutionMembers,
  fetchExecutionMeta,
  qk,
  submitExecutionMembersAction,
} from '../api/project.api'
import { MemberTable } from '../components/member-table'
import { ProjectActionModal } from '../components/project-action-modal'
import { ExecutionFormModal } from '../forms/execution-form-modal'
import { statusTone } from '../model'

/** 执行详情（T-3 / project §6 D 范式：概况 + 成员/任务/动态页签，成员表与项目成员页共用组件）。 */
export default function ExecutionDetailPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const executionId = Number(useParams().executionId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [editOpen, setEditOpen] = useState(false)

  const execution = useQuery({ queryKey: qk.execution.detail(executionId), queryFn: () => fetchExecution(executionId) })
  const meta = useQuery({ queryKey: qk.execution.meta(), queryFn: fetchExecutionMeta })
  const members = useQuery({
    queryKey: qk.execution.members(executionId),
    queryFn: () => fetchExecutionMembers(executionId, { limit: 200 }),
  })

  if (execution.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  const view = execution.data

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            <Typography.Text strong>{view?.name ?? ''}</Typography.Text>
            <StatusTag tone={statusTone(view?.status ?? 'wait')}>
              {t(`project.status.${view?.status ?? 'wait'}`)}
            </StatusTag>
          </Space>
        }
        backTo={`/projects/${view?.parentId ?? 0}`}
        extra={
          <>
            <HasPerm perm="execution-edit">
              <Button onClick={() => setEditOpen(true)}>{t('common.action.edit')}</Button>
            </HasPerm>
            <ProjectActionModal
              objectType="execution"
              target={view ?? null}
              actions={meta.data?.actions}
              onDone={() => undefined}
            />
          </>
        }
      />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('project.field.id'), children: view?.id ?? '-' },
            { key: 'type', label: t('project.field.type'), children: t(`project.type.${view?.type ?? 'sprint'}`) },
            { key: 'parent', label: t('project.field.parent'), children: view?.parentId ?? '-' },
            { key: 'beginDate', label: t('project.field.beginDate'), children: view?.beginDate ?? '-' },
            { key: 'endDate', label: t('project.field.endDate'), children: view?.endDate ?? '-' },
            { key: 'realBeganDate', label: t('project.field.realBeganDate'), children: view?.realBeganDate ?? '-' },
            { key: 'realEndDate', label: t('project.field.realEndDate'), children: view?.realEndDate ?? '-' },
            { key: 'estimate', label: t('project.field.estimate'), children: view?.estimateHours ?? 0 },
            { key: 'consumed', label: t('project.field.consumed'), children: view?.consumedHours ?? 0 },
            { key: 'left', label: t('project.field.left'), children: view?.leftHours ?? 0 },
            { key: 'acl', label: t('project.field.acl'), children: t(`project.acl.${view?.acl ?? 'open'}`) },
            { key: 'description', label: t('project.field.description'), children: view?.description ?? '-' },
          ]}
        />
      </Card>
      <Card>
        <Tabs
          activeKey={searchParams.get('tab') ?? 'members'}
          onChange={(key) => setSearchParams(withParam(searchParams, 'tab', key))}
          items={[
            {
              key: 'members',
              label: t('project.tab.members'),
              children: (
                <MemberTable
                  members={members.data?.items ?? []}
                  loading={members.isPending}
                  onSubmit={(rows) => submitExecutionMembersAction(executionId, rows)}
                  onSaved={() => void queryClient.invalidateQueries({ queryKey: ['listExecutionMembers'] })}
                />
              ),
            },
            {
              key: 'tasks',
              label: t('task.title.list'),
              children: <TaskListPage embedded />,
            },
            {
              key: 'activities',
              label: t('project.tab.activities'),
              children: <ActivityTimeline fetchPage={(beforeId) => fetchExecutionActivities(executionId, beforeId)} />,
            },
          ]}
        />
      </Card>
      {view ? (
        <ExecutionFormModal
          projectId={view.parentId}
          execution={view}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
    </PageContainer>
  )
}
