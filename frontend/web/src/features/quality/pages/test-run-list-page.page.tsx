/** @route /products/:productId/test-runs @title quality.title.testRuns @perm testrun-view @hide @activeMenu /products */
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
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { withParam } from '../../../shared/url'
import { fetchTestRuns, type TestRunView } from '../api/quality.api'
import { TestRunCreateModal } from '../forms/test-run-create-modal'
import { testRunTone } from '../model'

/** 测试单列表（T-9 / quality §6 L 范式：data-table + 状态下拉/搜索走 URL + 建单弹窗）。
 * 筛选值域一律来自 meta/testRun（前端不留常量清单）。 */
export default function TestRunListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const productId = Number(useParams().productId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)
  const runMeta = useMetaOptions('testRun')

  const status = searchParams.get('status') ?? ''
  const type = searchParams.get('type') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const testRuns = useQuery({
    queryKey: ['listTestRuns', productId, { status, type, priority, q, page }],
    queryFn: () => fetchTestRuns(productId, { page, limit: 20, q, filters: { status, type, priority } }),
  })

  const columns: TableColumnsType<TestRunView> = [
    { title: t('testRun.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('testRun.field.name'),
      dataIndex: 'name',
      render: (name: string, record: TestRunView) => (
        <Typography.Link onClick={() => navigate(`/test-runs/${record.id}`)}>{name}</Typography.Link>
      ),
    },
    {
      title: t('testRun.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (value: string) => <StatusTag tone={testRunTone(value)}>{t(`testRun.status.${value}`)}</StatusTag>,
    },
    { title: t('testRun.field.owner'), dataIndex: 'owner', width: 110, render: (value: string | null) => value ?? '-' },
    {
      title: t('testRun.field.priority'),
      dataIndex: 'priority',
      width: 90,
      render: (value: number) => t(`common.priority.${value}`),
    },
    {
      title: t('testRun.field.type'),
      dataIndex: 'type',
      width: 110,
      render: (value: string | null) => (value ? t(`testRun.type.${value}`) : '-'),
    },
    {
      title: `${t('testRun.field.beginDate')} ~ ${t('testRun.field.endDate')}`,
      key: 'dateRange',
      width: 200,
      render: (_: unknown, record: TestRunView) => `${record.beginDate} ~ ${record.endDate}`,
    },
    {
      title: `${t('testRun.field.realBeganAt')} ~ ${t('testRun.field.realFinishedAt')}`,
      key: 'realDateRange',
      width: 200,
      render: (_: unknown, record: TestRunView) => `${record.realBeganAt ?? '-'} ~ ${record.realFinishedAt ?? '-'}`,
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 120,
      render: (_: unknown, record: TestRunView) => (
        <Button size="small" type="link" onClick={() => navigate(`/test-runs/${record.id}/cases`)}>
          {t('testRun.tab.cases')}
        </Button>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader title={t('quality.title.testRuns')} backTo={`/products/${productId}`} />
      <ListFilterForm
        fields={[
          keywordField(t('testRun.field.name'), t('common.action.search')),
          selectField('status', t('common.field.status'), runMeta.options('status')),
          selectField('type', t('testRun.field.type'), runMeta.options('type')),
          selectField('priority', t('common.field.priority'), runMeta.options('priority')),
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="quality-test-runs"
        actions={
          <HasPerm perm="testrun-create">
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t('testRun.action.create')}
            </Button>
          </HasPerm>
        }
        rowKey="id"
        loading={testRuns.isPending}
        dataSource={testRuns.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: 20,
          total: testRuns.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <TestRunCreateModal
        productId={productId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(item) => navigate(`/test-runs/${item.id}`)}
      />
    </PageContainer>
  )
}
