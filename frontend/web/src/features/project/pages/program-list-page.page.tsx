/** @route /programs @title project.title.programList @perm program-view @menu project @order 1 */
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
import { deleteProgramAction, fetchPrograms, qk } from '../api/project.api'
import { ProgramFormModal } from '../forms/program-form-modal'
import { buildProjectTree, type ProjectNode, statusTone } from '../model'

/** 树全部行 id（受控展开：默认全展开，用户折叠后以覆盖值优先）。 */
function nodeIds(nodes: readonly ProjectNode[]): number[] {
  return nodes.flatMap((node) => [node.id, ...nodeIds(node.children)])
}

/** 项目集列表（T-3；project §6 L 范式：平铺 + path → 树，表格按层级折叠；筛选值域来自 meta/program）。 */
export default function ProgramListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const programMeta = useMetaOptions('program')
  const [createOpen, setCreateOpen] = useState(false)

  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const model = searchParams.get('model') ?? ''
  const acl = searchParams.get('acl') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const programs = useQuery({
    queryKey: qk.program.list({ q, status, model, acl, priority, type: 'program' }),
    queryFn: () =>
      fetchPrograms({
        limit: 200,
        q,
        filters: {
          type: 'program',
          ...(status ? { status } : {}),
          ...(model ? { model } : {}),
          ...(acl ? { acl } : {}),
          ...(priority ? { priority } : {}),
        },
      }),
  })
  const remove = useMutation({
    mutationFn: (programId: number) => deleteProgramAction(programId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['listPrograms'] })
      void queryClient.invalidateQueries({ queryKey: ['getProgram'] })
      void queryClient.invalidateQueries({ queryKey: ['listSubPrograms'] })
    },
    // 有未删子项目集/子项目 → 42203（project §5 delete 守卫）
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })
  const tree = buildProjectTree(programs.data?.items ?? [])
  // 数据异步到达 defaultExpandAllRows 不生效：未手动折叠前默认全展开
  const [collapsed, setCollapsed] = useState<number[] | null>(null)
  const expandedRowKeys = collapsed ?? nodeIds(tree)

  const columns: TableColumnsType<ProjectNode> = [
    { title: t('project.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('project.field.name'),
      dataIndex: 'name',
      render: (name: string, record: ProjectNode) => <RowNameLink to={`/programs/${record.id}`}>{name}</RowNameLink>,
    },
    { title: t('project.field.code'), dataIndex: 'code', width: 140 },
    {
      title: t('project.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (status: string) => <StatusTag tone={statusTone(status)}>{t(`project.status.${status}`)}</StatusTag>,
    },
    { title: t('project.field.pm'), dataIndex: 'pm', width: 110 },
    { title: t('project.field.beginDate'), dataIndex: 'beginDate', width: 120 },
    { title: t('project.field.endDate'), dataIndex: 'endDate', width: 120 },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 160,
      render: (_: unknown, record: ProjectNode) => (
        <Space size={4}>
          <HasPerm perm="program-delete">
            <Popconfirm title={t('project.message.deleteProgramHint')} onConfirm={() => remove.mutate(record.id)}>
              <Button size="small" type="link" danger aria-label={`program-delete-${record.id}`}>
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
          selectField('status', t('common.field.status'), programMeta.options('status')),
          selectField('model', t('project.field.model'), programMeta.options('model')),
          selectField('acl', t('project.field.acl'), programMeta.options('acl')),
          selectField('priority', t('common.field.priority'), programMeta.options('priority')),
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="project-programs"
        actions={
          <HasPerm perm="program-create">
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t('project.action.createProgram')}
            </Button>
          </HasPerm>
        }
        rowKey="id"
        loading={programs.isPending}
        dataSource={tree}
        pagination={false}
        expandable={{
          expandedRowKeys,
          onExpandedRowsChange: (keys) => setCollapsed(keys.map((key) => Number(key))),
        }}
      />
      <ProgramFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </PageContainer>
  )
}
