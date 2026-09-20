/** @route /products/:productId/bugs @title quality.title.bugs @perm bug-view @hide @activeMenu /products */
import { useQuery } from '@tanstack/react-query'
import { Button, ListCard, PageContainer, PageHeader, StatusTag, type TableColumnsType } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { RowNameLink } from '../../../shared/row-name-link'
import { withParam } from '../../../shared/url'
import { csvQuery, useCsvExport } from '../../../shared/use-csv-export'
import { type BugView, bugsCsvPath, fetchBugs, qk } from '../api/quality.api'
import { BugCreateModal } from '../forms/bug-create-modal'
import { bugTone, severityKey } from '../model'

/** Bug 列表（T-2 / quality §6 L 范式：data-table + 状态下拉/搜索走 URL + 多选进批量页）。
 * 筛选值域一律来自 meta/bug（前端不留常量清单）。 */
export default function BugListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const productId = Number(useParams().productId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const csv = useCsvExport()
  const bugMeta = useMetaOptions('bug')

  const status = searchParams.get('status') ?? ''
  const severity = searchParams.get('severity') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const type = searchParams.get('type') ?? ''
  const resolution = searchParams.get('resolution') ?? ''
  const confirmed = searchParams.get('confirmed') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const bugs = useQuery({
    queryKey: qk.quality.bugList(productId, { status, severity, priority, type, resolution, confirmed, q, page }),
    queryFn: () =>
      fetchBugs(productId, {
        page,
        limit: 20,
        q,
        filters: { status, severity, priority, type, resolution, confirmed },
      }),
  })

  const columns: TableColumnsType<BugView> = [
    { title: t('bug.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('bug.field.title'),
      dataIndex: 'title',
      render: (title: string, record: BugView) => <RowNameLink to={`/bugs/${record.id}`}>{title}</RowNameLink>,
    },
    {
      title: t('bug.field.severity'),
      dataIndex: 'severity',
      width: 90,
      render: (value: number) => t(severityKey(value)),
    },
    {
      title: t('bug.field.priority'),
      dataIndex: 'priority',
      width: 90,
      render: (value: number) => t(`common.priority.${value}`),
    },
    {
      title: t('bug.field.type'),
      dataIndex: 'type',
      render: (value: string) => t(`bug.type.${value}`),
    },
    {
      title: t('bug.field.status'),
      dataIndex: 'status',
      width: 100,
      render: (value: string) => <StatusTag tone={bugTone(value)}>{t(`bug.status.${value}`)}</StatusTag>,
    },
    { title: t('bug.field.assignee'), dataIndex: 'assignee', width: 110 },
    {
      title: t('bug.field.confirmed'),
      dataIndex: 'confirmed',
      width: 90,
      render: (value: boolean) => (value ? t('bug.confirmed.yes') : t('bug.confirmed.no')),
    },
    {
      title: t('bug.field.resolution'),
      dataIndex: 'resolution',
      render: (value: string | null) => (value ? t(`bug.resolution.${value}`) : '-'),
    },
  ]

  return (
    <PageContainer>
      <PageHeader title={t('quality.title.bugs')} backTo={`/products/${productId}`} />
      <ListFilterForm
        fields={[
          keywordField(t('bug.field.keywords'), t('common.action.search')),
          selectField('status', t('common.field.status'), bugMeta.options('status')),
          selectField('severity', t('bug.field.severity'), bugMeta.options('severity')),
          selectField('priority', t('common.field.priority'), bugMeta.options('priority')),
          selectField('type', t('bug.field.type'), bugMeta.options('type')),
          selectField('resolution', t('bug.field.resolution'), bugMeta.options('resolution')),
          selectField('confirmed', t('bug.field.confirmed'), bugMeta.options('confirmed')),
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="quality-bugs"
        actions={
          <>
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t('bug.action.create')}
            </Button>
            <Button onClick={() => navigate(`/products/${productId}/bugs/batch`)}>{t('bug.action.batchCreate')}</Button>
            <Button
              disabled={selectedIds.length === 0}
              onClick={() => navigate(`/bugs/batch-edit?productId=${productId}&ids=${selectedIds.join(',')}`)}
            >
              {t('bug.action.batchEdit')}
            </Button>
            <Button
              loading={csv.exporting}
              onClick={() =>
                void csv.exportCsv(
                  bugsCsvPath(productId),
                  csvQuery({ q, filters: { status, severity, priority, type, resolution, confirmed } }),
                  'bugs',
                )
              }
            >
              {t('common.action.exportCsv')}
            </Button>
          </>
        }
        rowKey="id"
        loading={bugs.isPending}
        dataSource={bugs.data?.items ?? []}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys.map((key) => Number(key))),
        }}
        pagination={{
          current: page,
          pageSize: 20,
          total: bugs.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <BugCreateModal
        productId={productId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(bug) => navigate(`/bugs/${bug.id}`)}
      />
    </PageContainer>
  )
}
