/** @route /doc/my @title doc.title.my @perm doc-view @menu doc @order 2 */
import { useQuery } from '@tanstack/react-query'
import type { DocView } from '@zentao/api-client/generated/model/docView'
import { ListCard, PageContainer, Space, StatusTag, type TableColumnsType, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { withParam } from '../../../shared/url'
import { fetchDocs, qk } from '../api/doc.api'
import {
  DOC_MY_TABS,
  type DocMyTab,
  docStatusKey,
  docStatusTone,
  docTypeKey,
  myDocFilters,
  showDraftBadge,
} from '../model'

/** 我的空间（T-4 / doc §6 L 范式：我创建的 / 我编辑的 / 我的草稿 = filters 三态下拉）。 */
export default function DocMyPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const tab: DocMyTab =
    tabParam !== null && (DOC_MY_TABS as readonly string[]).includes(tabParam) ? (tabParam as DocMyTab) : 'created'
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const docs = useQuery({
    queryKey: qk.doc.list({ tab, q, page }),
    queryFn: () => fetchDocs({ page, limit: 20, q, filters: myDocFilters(tab) }),
  })

  const columns: TableColumnsType<DocView> = [
    { title: t('doc.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('doc.field.title'),
      dataIndex: 'title',
      render: (title: string, record: DocView) => (
        <Space size={4}>
          <Typography.Link onClick={() => navigate(`/docs/${record.id}`)}>{title}</Typography.Link>
          {showDraftBadge(record) ? <StatusTag tone="warning">{t('doc.field.hasDraft')}</StatusTag> : null}
        </Space>
      ),
    },
    {
      title: t('doc.field.status'),
      dataIndex: 'status',
      width: 100,
      render: (value: string) => <StatusTag tone={docStatusTone(value)}>{t(docStatusKey(value))}</StatusTag>,
    },
    {
      title: t('doc.field.type'),
      dataIndex: 'type',
      width: 100,
      render: (value: string) => t(docTypeKey(value)),
    },
    { title: t('doc.field.docSpace'), dataIndex: 'docSpaceId', width: 110 },
    { title: t('doc.field.version'), dataIndex: 'version', width: 90 },
    { title: t('doc.field.views'), dataIndex: 'views', width: 80 },
    { title: t('doc.field.updatedBy'), dataIndex: 'updatedBy', width: 110 },
    { title: t('doc.field.updatedAt'), dataIndex: 'updatedAt', width: 180 },
  ]

  return (
    <PageContainer>
      <ListFilterForm
        fields={[
          keywordField(t('doc.field.keywords'), t('common.action.search')),
          selectField(
            'tab',
            t('doc.filter.scope'),
            DOC_MY_TABS.map((item) => ({ value: item, label: t(`doc.tab.${item}`) })),
          ),
        ]}
      />
      <ListCard<DocView>
        columns={columns}
        columnSettingKey="doc-my"
        actions={<Typography.Link onClick={() => navigate('/doc/spaces')}>{t('docSpace.title.list')}</Typography.Link>}
        rowKey="id"
        loading={docs.isPending}
        dataSource={docs.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: 20,
          total: docs.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
    </PageContainer>
  )
}
