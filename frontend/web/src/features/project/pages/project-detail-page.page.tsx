/** @route /projects/:projectId @title project.title.detail @perm project-view @hide @activeMenu /projects */
import { useQuery } from '@tanstack/react-query'
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
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { withParam } from '../../../shared/url'
import { ActivityTimeline } from '../../platform'
import { fetchProject, fetchProjectActivities, fetchProjectMeta, qk } from '../api/project.api'
import { ProjectActionModal } from '../components/project-action-modal'
import { ProjectFormModal } from '../forms/project-form-modal'
import { statusTone } from '../model'

/** 项目详情（T-3 / project §6 D 范式：概况 + 动态页签，子资源入口按域内路由派生）。 */
export default function ProjectDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const projectId = Number(useParams().projectId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [editOpen, setEditOpen] = useState(false)

  const project = useQuery({ queryKey: qk.project.detail(projectId), queryFn: () => fetchProject(projectId) })
  const meta = useQuery({ queryKey: qk.project.meta(), queryFn: fetchProjectMeta })

  if (project.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  const view = project.data

  const links: { key: string; path: string; label: string }[] = [
    { key: 'executions', path: `/projects/${projectId}/executions`, label: t('project.tab.executions') },
    { key: 'stories', path: `/projects/${projectId}/stories`, label: t('project.tab.stories') },
    { key: 'members', path: `/projects/${projectId}/members`, label: t('project.tab.members') },
    { key: 'stakeholders', path: `/projects/${projectId}/stakeholders`, label: t('project.tab.stakeholders') },
    { key: 'whitelist', path: `/projects/${projectId}/whitelist`, label: t('project.tab.whitelist') },
  ]

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
        backTo="/projects"
        extra={
          <>
            <HasPerm perm="project-edit">
              <Button onClick={() => setEditOpen(true)}>{t('common.action.edit')}</Button>
            </HasPerm>
            <ProjectActionModal
              objectType="project"
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
            {
              key: 'model',
              label: t('project.field.model'),
              children: t(`project.model.${view?.model ?? 'scrum'}`),
            },
            {
              key: 'priority',
              label: t('project.field.priority'),
              children: t(`common.priority.${view?.priority ?? 1}`),
            },
            { key: 'progress', label: t('project.field.progress'), children: `${view?.progress ?? 0}%` },
            { key: 'beginDate', label: t('project.field.beginDate'), children: view?.beginDate ?? '-' },
            { key: 'endDate', label: t('project.field.endDate'), children: view?.endDate ?? '-' },
            { key: 'realBeganDate', label: t('project.field.realBeganDate'), children: view?.realBeganDate ?? '-' },
            { key: 'realEndDate', label: t('project.field.realEndDate'), children: view?.realEndDate ?? '-' },
            { key: 'estimate', label: t('project.field.estimate'), children: view?.estimateHours ?? 0 },
            { key: 'consumed', label: t('project.field.consumed'), children: view?.consumedHours ?? 0 },
            { key: 'left', label: t('project.field.left'), children: view?.leftHours ?? 0 },
            { key: 'pm', label: t('project.field.pm'), children: view?.pm ?? '-' },
            { key: 'po', label: t('project.field.po'), children: view?.po ?? '-' },
            { key: 'qd', label: t('project.field.qd'), children: view?.qd ?? '-' },
            { key: 'rd', label: t('project.field.rd'), children: view?.rd ?? '-' },
            { key: 'acl', label: t('project.field.acl'), children: t(`project.acl.${view?.acl ?? 'open'}`) },
            { key: 'createdBy', label: t('common.field.createdBy'), children: view?.createdBy ?? '-' },
          ]}
        />
        <Space wrap className="tw:mt-3">
          {links.map((link) => (
            <Button key={link.key} size="small" onClick={() => navigate(link.path)}>
              {link.label}
            </Button>
          ))}
        </Space>
      </Card>
      <Card>
        <Tabs
          activeKey={searchParams.get('tab') ?? 'activities'}
          onChange={(key) => setSearchParams(withParam(searchParams, 'tab', key))}
          items={[
            {
              key: 'activities',
              label: t('project.tab.activities'),
              children: <ActivityTimeline fetchPage={(beforeId) => fetchProjectActivities(projectId, beforeId)} />,
            },
          ]}
        />
      </Card>
      {view ? <ProjectFormModal project={view} open={editOpen} onClose={() => setEditOpen(false)} /> : null}
    </PageContainer>
  )
}
