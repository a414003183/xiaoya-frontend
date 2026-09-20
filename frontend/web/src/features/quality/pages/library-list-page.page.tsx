/** @route /libraries @title quality.title.libraries @perm library-view @menu quality @order 1 */
import { useQuery } from '@tanstack/react-query'
import { Button, HasPerm, ListCard, PageContainer, type TableColumnsType, Typography } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { keywordField, ListFilterForm } from '../../../shared/list-filter'
import { withParam } from '../../../shared/url'
import { fetchLibraries, qk, type SuiteView } from '../api/quality.api'
import { LibraryCreateModal } from '../forms/library-create-modal'

/** 用例库列表（T-7 / quality §6 L 范式：data-table + 搜索/分页走 URL；读面无产品 ACL，全员可见）。 */
export default function LibraryListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)

  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const libraries = useQuery({
    queryKey: qk.quality.libraryList({ q, page }),
    queryFn: () => fetchLibraries({ page, limit: 20, q }),
  })

  const columns: TableColumnsType<SuiteView> = [
    { title: t('library.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('library.field.name'),
      dataIndex: 'name',
      render: (name: string, record: SuiteView) => (
        <Typography.Link onClick={() => navigate(`/libraries/${record.id}`)}>{name}</Typography.Link>
      ),
    },
    { title: t('library.field.caseCount'), dataIndex: 'caseCount', width: 90 },
    { title: t('library.field.createdBy'), dataIndex: 'createdBy', width: 110 },
    { title: t('library.field.createdAt'), dataIndex: 'createdAt', width: 190 },
  ]

  return (
    <PageContainer>
      <ListFilterForm fields={[keywordField(t('library.field.name'), t('common.action.search'))]} />
      <ListCard
        columns={columns}
        columnSettingKey="quality-libraries"
        actions={
          <HasPerm perm="library-create">
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t('library.action.create')}
            </Button>
          </HasPerm>
        }
        rowKey="id"
        loading={libraries.isPending}
        dataSource={libraries.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: 20,
          total: libraries.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <LibraryCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(item) => navigate(`/libraries/${item.id}`)}
      />
    </PageContainer>
  )
}
