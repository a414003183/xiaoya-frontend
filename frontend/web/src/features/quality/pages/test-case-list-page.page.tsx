/** @route /products/:productId/test-cases @title quality.title.testCases @perm testcase-view @hide @activeMenu /products */
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  HasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  StatusTag,
  type TableColumnsType,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { RowNameLink } from '../../../shared/row-name-link'
import { withParam } from '../../../shared/url'
import { csvQuery, useCsvExport } from '../../../shared/use-csv-export'
import { fetchTestCases, qk, type TestCaseView, testCasesCsvPath } from '../api/quality.api'
import { TestCaseImportModal } from '../components/test-case-import-modal'
import { TestCaseCreateModal } from '../forms/test-case-create-modal'
import { testCaseTone } from '../model'

/** 用例列表（T-5 / quality §6 L 范式：data-table + 状态下拉/搜索走 URL + 多选进批量页；导入入口 T-7 补弹窗）。
 * 筛选值域一律来自 meta/testCase（前端不留常量清单）。 */
export default function TestCaseListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const productId = Number(useParams().productId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const csv = useCsvExport()
  const caseMeta = useMetaOptions('testCase')

  const status = searchParams.get('status') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const type = searchParams.get('type') ?? ''
  const stage = searchParams.get('stage') ?? ''
  const lastRunResult = searchParams.get('lastRunResult') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const testCases = useQuery({
    queryKey: qk.quality.caseList(productId, { status, priority, type, stage, lastRunResult, q, page }),
    queryFn: () =>
      fetchTestCases(productId, {
        page,
        limit: 20,
        q,
        filters: { status, priority, type, stage, lastRunResult },
      }),
  })

  const columns: TableColumnsType<TestCaseView> = [
    { title: t('testCase.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('testCase.field.title'),
      dataIndex: 'title',
      render: (title: string, record: TestCaseView) => (
        <RowNameLink to={`/test-cases/${record.id}`}>{title}</RowNameLink>
      ),
    },
    {
      title: t('testCase.field.priority'),
      dataIndex: 'priority',
      width: 90,
      render: (value: number) => t(`common.priority.${value}`),
    },
    {
      title: t('testCase.field.type'),
      dataIndex: 'type',
      render: (value: string) => t(`testCase.type.${value}`),
    },
    {
      title: t('testCase.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (value: string) => <StatusTag tone={testCaseTone(value)}>{t(`testCase.status.${value}`)}</StatusTag>,
    },
    {
      title: t('testCase.field.lastRunResult'),
      dataIndex: 'lastRunResult',
      width: 110,
      render: (value: string | null | undefined) => (value ? t(`testCase.result.${value}`) : '-'),
    },
    { title: t('common.field.createdBy'), dataIndex: 'createdBy', width: 110 },
  ]

  return (
    <PageContainer>
      <PageHeader title={t('quality.title.testCases')} backTo={`/products/${productId}`} />
      <ListFilterForm
        fields={[
          keywordField(t('testCase.field.keywords'), t('common.action.search')),
          selectField('status', t('common.field.status'), caseMeta.options('status')),
          selectField('priority', t('common.field.priority'), caseMeta.options('priority')),
          selectField('type', t('testCase.field.type'), caseMeta.options('type')),
          selectField('stage', t('testCase.field.stage'), caseMeta.options('stage')),
          selectField('lastRunResult', t('testCase.field.lastRunResult'), caseMeta.options('lastRunResult')),
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="quality-test-cases"
        actions={
          <>
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t('testCase.action.create')}
            </Button>
            <Button onClick={() => navigate(`/products/${productId}/test-cases/batch`)}>
              {t('testCase.action.batchCreate')}
            </Button>
            <Button
              disabled={selectedIds.length === 0}
              onClick={() => navigate(`/test-cases/batch-edit?productId=${productId}&ids=${selectedIds.join(',')}`)}
            >
              {t('testCase.action.batchEdit')}
            </Button>
            <HasPerm perm="testcase-create">
              <Button onClick={() => setImportOpen(true)}>{t('common.action.import')}</Button>
            </HasPerm>
            <Button
              loading={csv.exporting}
              onClick={() =>
                void csv.exportCsv(
                  testCasesCsvPath(productId),
                  csvQuery({ q, filters: { status, priority, type, stage, lastRunResult } }),
                  'test-cases',
                )
              }
            >
              {t('common.action.exportCsv')}
            </Button>
          </>
        }
        rowKey="id"
        loading={testCases.isPending}
        dataSource={testCases.data?.items ?? []}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys.map((key) => Number(key))),
        }}
        pagination={{
          current: page,
          pageSize: 20,
          total: testCases.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <TestCaseCreateModal
        productId={productId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(item) => navigate(`/test-cases/${item.id}`)}
      />
      <TestCaseImportModal productId={productId} open={importOpen} onClose={() => setImportOpen(false)} />
    </PageContainer>
  )
}
