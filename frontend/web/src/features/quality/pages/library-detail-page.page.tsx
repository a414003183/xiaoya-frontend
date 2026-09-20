/** @route /libraries/:libraryId @title quality.title.libraryDetail @perm library-view @hide @activeMenu /libraries */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Descriptions,
  HasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  PageLoading,
  Popconfirm,
  StatusTag,
  type TableColumnsType,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { withParam } from '../../../shared/url'
import { deleteLibraryAction, fetchLibrary, fetchLibraryCases, qk, type TestCaseView } from '../api/quality.api'
import { LibraryFormModal } from '../forms/library-create-modal'
import { TestCaseEditModal } from '../forms/test-case-edit-modal'
import { testCaseTone } from '../model'

/** 用例库详情（T-7 / quality §6 D 范式：库信息 + 库用例列表内嵌 + 建用例/批量入口 + 编辑弹窗；B-QUA-09 库用例行内编辑）。 */
export default function LibraryDetailPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const libraryId = Number(useParams().libraryId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [editOpen, setEditOpen] = useState(false)
  const [caseEdit, setCaseEdit] = useState<TestCaseView | null>(null)
  const page = Number(searchParams.get('page') ?? 1)

  const library = useQuery({ queryKey: qk.quality.library(libraryId), queryFn: () => fetchLibrary(libraryId) })
  const cases = useQuery({
    queryKey: qk.quality.libraryCases(libraryId, { page }),
    queryFn: () => fetchLibraryCases(libraryId, { page, limit: 20 }),
  })
  const view = library.data

  const remove = useMutation({
    mutationFn: () => deleteLibraryAction(libraryId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['getLibrary'] })
      void queryClient.invalidateQueries({ queryKey: ['listLibraries'] })
      navigate('/libraries')
    },
    // 库内存在未删用例 → 42203，按 code 映射统一文案（§5）
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  if (library.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const columns: TableColumnsType<TestCaseView> = [
    { title: t('testCase.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('testCase.field.title'),
      dataIndex: 'title',
      render: (title: string, record: TestCaseView) => (
        <Typography.Link onClick={() => navigate(`/test-cases/${record.id}`)}>{title}</Typography.Link>
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
      width: 130,
      render: (value: string) => t(`testCase.type.${value}`),
    },
    {
      title: t('testCase.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (value: string) => <StatusTag tone={testCaseTone(value)}>{t(`testCase.status.${value}`)}</StatusTag>,
    },
    { title: t('common.field.createdBy'), dataIndex: 'createdBy', width: 110 },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 90,
      render: (_: unknown, record: TestCaseView) => (
        // B-QUA-09：库用例行内编辑（PATCH /test-cases/{id} 免产品 ACL；弹窗 libraryCase 分支隐藏产品维度字段）
        <HasPerm perm="testcase-edit">
          <Button
            size="small"
            type="link"
            aria-label={`library-case-edit-${record.id}`}
            onClick={() => setCaseEdit(record)}
          >
            {t('common.action.edit')}
          </Button>
        </HasPerm>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={view?.name ?? ''}
        backTo="/libraries"
        extra={
          <>
            <HasPerm perm="library-edit">
              <Button onClick={() => navigate(`/libraries/${libraryId}/test-cases/batch?rows=1`)}>
                {t('library.action.addCase')}
              </Button>
            </HasPerm>
            <HasPerm perm="library-edit">
              <Button onClick={() => navigate(`/libraries/${libraryId}/test-cases/batch`)}>
                {t('library.action.batchCreate')}
              </Button>
            </HasPerm>
            <HasPerm perm="library-edit">
              <Button type="primary" onClick={() => setEditOpen(true)}>
                {t('library.action.edit')}
              </Button>
            </HasPerm>
            <HasPerm perm="library-delete">
              <Popconfirm title={t('library.message.deleteHint')} onConfirm={() => remove.mutate()}>
                <Button danger loading={remove.isPending}>
                  {t('common.action.delete')}
                </Button>
              </Popconfirm>
            </HasPerm>
          </>
        }
      />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('library.field.id'), children: view?.id ?? '-' },
            { key: 'caseCount', label: t('library.field.caseCount'), children: view?.caseCount ?? 0 },
            { key: 'createdBy', label: t('library.field.createdBy'), children: view?.createdBy ?? '-' },
            {
              key: 'description',
              label: t('library.field.description'),
              span: 3,
              children: view?.description ? (
                <Typography.Paragraph className="tw:mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                  {view.description}
                </Typography.Paragraph>
              ) : (
                '-'
              ),
            },
          ]}
        />
      </Card>
      <ListCard
        title={t('library.tab.cases')}
        columns={columns}
        columnSettingKey="library-cases"
        rowKey="id"
        loading={cases.isPending}
        dataSource={cases.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: 20,
          total: cases.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      {view ? <LibraryFormModal library={view} open={editOpen} onClose={() => setEditOpen(false)} /> : null}
      {caseEdit ? (
        <TestCaseEditModal
          productId={caseEdit.productId}
          testCase={caseEdit}
          open
          onClose={() => setCaseEdit(null)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ['listLibraryCases'] })}
        />
      ) : null}
    </PageContainer>
  )
}
