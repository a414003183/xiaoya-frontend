/** @route /programs/:programId @title project.title.programDetail @perm program-view @hide @activeMenu /programs */
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  Descriptions,
  HasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  PageLoading,
  Space,
  StatusTag,
  type TableColumnsType,
  Tabs,
  Typography,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { withParam } from '../../../shared/url'
import {
  fetchProgram,
  fetchProgramMeta,
  fetchProgramProducts,
  fetchProgramProjects,
  fetchSubPrograms,
  type ProductView,
  type ProjectView,
  qk,
} from '../api/project.api'
import { ProjectActionModal } from '../components/project-action-modal'
import { ProgramFormModal } from '../forms/program-form-modal'
import { statusTone } from '../model'

/** 项目集详情（T-3 / project §6 D 范式：页头动作区 + 子项目集/子项目/关联产品页签）。 */
export default function ProgramDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const programId = Number(useParams().programId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [editOpen, setEditOpen] = useState(false)

  const program = useQuery({ queryKey: qk.program.detail(programId), queryFn: () => fetchProgram(programId) })
  const meta = useQuery({ queryKey: qk.program.meta(), queryFn: fetchProgramMeta })
  const subPrograms = useQuery({
    queryKey: qk.program.subPrograms(programId),
    queryFn: () => fetchSubPrograms(programId, { limit: 200 }),
  })
  const projects = useQuery({
    queryKey: qk.program.projects(programId),
    queryFn: () => fetchProgramProjects(programId, { limit: 200 }),
  })
  const products = useQuery({
    queryKey: qk.program.products(programId),
    queryFn: () => fetchProgramProducts(programId, { limit: 200 }),
  })

  if (program.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  const view = program.data

  const subProgramColumns: TableColumnsType<ProjectView> = [
    { title: t('project.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('project.field.name'),
      dataIndex: 'name',
      render: (name: string, record: ProjectView) => (
        <Typography.Link onClick={() => navigate(`/programs/${record.id}`)}>{name}</Typography.Link>
      ),
    },
    {
      title: t('project.field.status'),
      dataIndex: 'status',
      render: (status: string) => t(`project.status.${status}`),
    },
    { title: t('project.field.pm'), dataIndex: 'pm' },
  ]

  const projectColumns: TableColumnsType<ProjectView> = [
    { title: t('project.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('project.field.name'),
      dataIndex: 'name',
      render: (name: string, record: ProjectView) => (
        <Typography.Link onClick={() => navigate(`/projects/${record.id}`)}>{name}</Typography.Link>
      ),
    },
    {
      title: t('project.field.model'),
      dataIndex: 'model',
      render: (model: string) => t(`project.model.${model}`),
    },
    {
      title: t('project.field.status'),
      dataIndex: 'status',
      render: (status: string) => t(`project.status.${status}`),
    },
    { title: t('project.field.pm'), dataIndex: 'pm' },
  ]

  const productColumns: TableColumnsType<ProductView> = [
    { title: t('product.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('product.field.name'),
      dataIndex: 'name',
      render: (name: string, record: ProductView) => (
        <Typography.Link onClick={() => navigate(`/products/${record.id}`)}>{name}</Typography.Link>
      ),
    },
    { title: t('product.field.code'), dataIndex: 'code' },
    { title: t('product.field.po'), dataIndex: 'po' },
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
        backTo="/programs"
        extra={
          <>
            <HasPerm perm="program-edit">
              <Button onClick={() => setEditOpen(true)}>{t('common.action.edit')}</Button>
            </HasPerm>
            <ProjectActionModal
              objectType="program"
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
            { key: 'code', label: t('project.field.code'), children: view?.code ?? '-' },
            { key: 'pm', label: t('project.field.pm'), children: view?.pm ?? '-' },
            { key: 'acl', label: t('project.field.acl'), children: t(`project.acl.${view?.acl ?? 'open'}`) },
            { key: 'beginDate', label: t('project.field.beginDate'), children: view?.beginDate ?? '-' },
            { key: 'endDate', label: t('project.field.endDate'), children: view?.endDate ?? '-' },
            { key: 'budget', label: t('project.field.budget'), children: view?.budget ?? '-' },
            { key: 'createdBy', label: t('common.field.createdBy'), children: view?.createdBy ?? '-' },
            { key: 'description', label: t('project.field.description'), children: view?.description ?? '-' },
          ]}
        />
      </Card>
      <Card>
        <Tabs
          activeKey={searchParams.get('tab') ?? 'subPrograms'}
          onChange={(key) => setSearchParams(withParam(searchParams, 'tab', key))}
          items={[
            {
              key: 'subPrograms',
              label: t('project.tab.subPrograms'),
              children: (
                <ListCard
                  columns={subProgramColumns}
                  columnSettingKey="program-sub-programs"
                  rowKey="id"
                  pagination={false}
                  loading={subPrograms.isPending}
                  dataSource={subPrograms.data?.items ?? []}
                />
              ),
            },
            {
              key: 'projects',
              label: t('project.tab.projects'),
              children: (
                <ListCard
                  columns={projectColumns}
                  columnSettingKey="program-projects"
                  rowKey="id"
                  pagination={false}
                  loading={projects.isPending}
                  dataSource={projects.data?.items ?? []}
                />
              ),
            },
            {
              key: 'products',
              label: t('project.tab.products'),
              children: (
                <ListCard
                  columns={productColumns}
                  columnSettingKey="program-products"
                  rowKey="id"
                  pagination={false}
                  loading={products.isPending}
                  dataSource={products.data?.items ?? []}
                />
              ),
            },
          ]}
        />
      </Card>
      {view ? <ProgramFormModal program={view} open={editOpen} onClose={() => setEditOpen(false)} /> : null}
    </PageContainer>
  )
}
