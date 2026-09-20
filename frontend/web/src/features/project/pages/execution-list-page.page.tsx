/** @route /executions @title project.title.executions @perm execution-view @menu project @order 3 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  filterInputWidth,
  HasPerm,
  Input,
  ListCard,
  PageContainer,
  Popconfirm,
  Space,
  StatusTag,
  type TableColumnsType,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { RowNameLink } from '../../../shared/row-name-link'
import { withParam } from '../../../shared/url'
import { deleteExecutionAction, fetchExecutions, type ProjectView, qk } from '../api/project.api'
import { statusTone } from '../model'

/** 执行列表（T-3 / project §6 L 范式：类型/状态下拉筛选 = filters[type|status]）。
 * 筛选值域来自 meta/execution（前端不留常量清单）。 */
export default function ExecutionListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const executionMeta = useMetaOptions('execution')

  const type = searchParams.get('type') ?? ''
  const status = searchParams.get('status') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const model = searchParams.get('model') ?? ''
  const acl = searchParams.get('acl') ?? ''
  /* 开始日期按区间筛（project 卡 §3：beginDate filterable(区间)）——from/to 两端合成 DSL 的 `a..b`（03 §3） */
  const beginFrom = searchParams.get('beginFrom') ?? ''
  const beginTo = searchParams.get('beginTo') ?? ''
  const beginDate = beginFrom || beginTo ? `${beginFrom}..${beginTo}` : ''
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const executions = useQuery({
    queryKey: qk.execution.list({ type, status, priority, model, acl, beginDate, q, page }),
    queryFn: () =>
      fetchExecutions({
        page,
        limit: 20,
        q,
        filters: { type, status, priority, beginDate, model, acl },
      }),
  })
  const remove = useMutation({
    mutationFn: (executionId: number) => deleteExecutionAction(executionId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['listExecutions'] })
      void queryClient.invalidateQueries({ queryKey: ['getExecution'] })
      void queryClient.invalidateQueries({ queryKey: ['listProjectExecutions'] })
    },
    // 执行下仍有未删任务 → 42203（project §5 delete 守卫）
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  const columns: TableColumnsType<ProjectView> = [
    { title: t('project.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('project.field.name'),
      dataIndex: 'name',
      render: (name: string, record: ProjectView) => <RowNameLink to={`/executions/${record.id}`}>{name}</RowNameLink>,
    },
    {
      title: t('project.field.type'),
      dataIndex: 'type',
      width: 110,
      render: (value: string) => t(`project.type.${value}`),
    },
    {
      title: t('project.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (value: string) => <StatusTag tone={statusTone(value)}>{t(`project.status.${value}`)}</StatusTag>,
    },
    {
      title: t('project.field.parent'),
      dataIndex: 'parentId',
      width: 160,
      render: (parentId: number) => (
        <Typography.Link onClick={() => navigate(`/projects/${parentId}`)}>{`#${parentId}`}</Typography.Link>
      ),
    },
    { title: t('project.field.beginDate'), dataIndex: 'beginDate', width: 120 },
    { title: t('project.field.endDate'), dataIndex: 'endDate', width: 120 },
    { title: t('project.field.pm'), dataIndex: 'pm', width: 110 },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 160,
      render: (_: unknown, record: ProjectView) => (
        <Space size={4}>
          <HasPerm perm="execution-delete">
            <Popconfirm title={t('project.message.deleteExecutionHint')} onConfirm={() => remove.mutate(record.id)}>
              <Button size="small" type="link" danger aria-label={`execution-delete-${record.id}`}>
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
          selectField('type', t('common.field.type'), executionMeta.options('type')),
          selectField('status', t('common.field.status'), executionMeta.options('status')),
          selectField('priority', t('common.field.priority'), executionMeta.options('priority')),
          {
            name: 'beginFrom',
            label: t('project.field.beginDate'),
            control: <Input type="date" style={{ width: filterInputWidth }} aria-label="execution-filter-begin-from" />,
          },
          {
            name: 'beginTo',
            label: '~',
            colon: false,
            control: <Input type="date" style={{ width: filterInputWidth }} aria-label="execution-filter-begin-to" />,
          },
          selectField('model', t('project.field.model'), executionMeta.options('model')),
          selectField('acl', t('project.field.acl'), executionMeta.options('acl')),
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="project-executions"
        rowKey="id"
        loading={executions.isPending}
        dataSource={executions.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: 20,
          total: executions.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
    </PageContainer>
  )
}
