/** @route /products/:productId/suites @title quality.title.suites @perm suite-view @hide @activeMenu /products */
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
import { fetchSuites, qk, type SuiteView } from '../api/quality.api'
import { SuiteCreateModal } from '../forms/suite-create-modal'
import { suiteTone } from '../model'

/** 套件列表（T-7 / quality §6 L 范式：data-table + 类型下拉/搜索/分页走 URL；private 由后端行级过滤，前端不二次筛）。
 * 筛选值域来自 meta/suite（前端不留常量清单）。 */
export default function SuiteListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const productId = Number(useParams().productId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)
  const suiteMeta = useMetaOptions('suite')

  const type = searchParams.get('type') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const suites = useQuery({
    queryKey: qk.quality.suiteList(productId, { type, q, page }),
    queryFn: () => fetchSuites(productId, { page, limit: 20, q, filters: { type } }),
  })

  const columns: TableColumnsType<SuiteView> = [
    { title: t('suite.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('suite.field.name'),
      dataIndex: 'name',
      render: (name: string, record: SuiteView) => (
        <Typography.Link onClick={() => navigate(`/suites/${record.id}`)}>{name}</Typography.Link>
      ),
    },
    {
      title: t('suite.field.type'),
      dataIndex: 'type',
      width: 110,
      render: (value: string) => <StatusTag tone={suiteTone(value)}>{t(`suite.type.${value}`)}</StatusTag>,
    },
    { title: t('suite.field.caseCount'), dataIndex: 'caseCount', width: 90 },
    { title: t('suite.field.sort'), dataIndex: 'sort', width: 80 },
    { title: t('suite.field.createdBy'), dataIndex: 'createdBy', width: 110 },
  ]

  return (
    <PageContainer>
      <PageHeader title={t('quality.title.suites')} backTo={`/products/${productId}`} />
      <ListFilterForm
        fields={[
          keywordField(t('suite.field.name'), t('common.action.search')),
          selectField('type', t('common.field.type'), suiteMeta.options('type')),
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="quality-suites"
        actions={
          <HasPerm perm="suite-create">
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t('suite.action.create')}
            </Button>
          </HasPerm>
        }
        rowKey="id"
        loading={suites.isPending}
        dataSource={suites.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: 20,
          total: suites.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <SuiteCreateModal
        productId={productId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(item) => navigate(`/suites/${item.id}`)}
      />
    </PageContainer>
  )
}
