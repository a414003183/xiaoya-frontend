/** @route /suites/:suiteId @title quality.title.suiteDetail @perm suite-view @hide @activeMenu /products */
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
  Space,
  StatusTag,
  type TableColumnsType,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import {
  deleteSuiteAction,
  fetchSuite,
  fetchTestCase,
  qk,
  type TestCaseView,
  unlinkSuiteCasesAction,
} from '../api/quality.api'
import { SuiteLinkCaseModal } from '../components/suite-link-case-modal'
import { SuiteFormModal } from '../forms/suite-create-modal'
import { suiteTone, testCaseTone } from '../model'

/** 套件详情（T-7 / quality §6 D 范式：套件信息 + 用例清单 + 关联/解除；无状态机故无动作区）。 */
export default function SuiteDetailPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const suiteId = Number(useParams().suiteId)
  const [editOpen, setEditOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)

  const suite = useQuery({ queryKey: qk.quality.suite(suiteId), queryFn: () => fetchSuite(suiteId) })
  const view = suite.data
  const caseIds = view?.caseIds ?? []

  // 套件无「用例清单」端点，详情按 caseIds 逐条取用例（§5：GET /suites/{suiteId} 才含 caseIds）
  const cases = useQuery({
    queryKey: ['getTestCase', 'suiteCases', suiteId, caseIds.join(',')],
    queryFn: () => Promise.all(caseIds.map((caseId) => fetchTestCase(caseId))),
    enabled: caseIds.length > 0,
  })

  const unlink = useMutation({
    mutationFn: (caseId: number) => unlinkSuiteCasesAction(suiteId, [caseId]),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['getSuite'] })
      void queryClient.invalidateQueries({ queryKey: ['listSuites'] })
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteSuiteAction(suiteId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['getSuite'] })
      void queryClient.invalidateQueries({ queryKey: ['listSuites'] })
      navigate(`/products/${view?.productId ?? 0}/suites`)
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  if (suite.isPending) {
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
    {
      title: t('common.action.manage'),
      key: 'manage',
      width: 110,
      render: (_: unknown, record: TestCaseView) => (
        <HasPerm perm="suite-link-case">
          <Popconfirm
            title={t('suite.message.unlinkConfirm')}
            onConfirm={() => unlink.mutate(record.id)}
            okText={t('common.action.submit')}
            cancelText={t('common.action.cancel')}
          >
            <Button size="small" danger loading={unlink.isPending}>
              {t('suite.action.unlinkCase')}
            </Button>
          </Popconfirm>
        </HasPerm>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            {view?.name ?? ''}
            <StatusTag tone={suiteTone(view?.type ?? 'public')}>{t(`suite.type.${view?.type ?? 'public'}`)}</StatusTag>
          </Space>
        }
        backTo={view ? `/products/${view.productId}/suites` : '/products'}
        extra={
          <>
            <HasPerm perm="suite-link-case">
              <Button onClick={() => setLinkOpen(true)}>{t('suite.action.linkCase')}</Button>
            </HasPerm>
            <HasPerm perm="suite-edit">
              <Button type="primary" onClick={() => setEditOpen(true)}>
                {t('suite.action.edit')}
              </Button>
            </HasPerm>
            <HasPerm perm="suite-delete">
              <Popconfirm title={t('suite.message.deleteHint')} onConfirm={() => remove.mutate()}>
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
            { key: 'id', label: t('suite.field.id'), children: view?.id ?? '-' },
            { key: 'productId', label: t('suite.field.product'), children: view?.productId ?? '-' },
            { key: 'type', label: t('suite.field.type'), children: t(`suite.type.${view?.type ?? 'public'}`) },
            { key: 'sort', label: t('suite.field.sort'), children: view?.sort ?? 0 },
            { key: 'caseCount', label: t('suite.field.caseCount'), children: view?.caseCount ?? 0 },
            { key: 'createdBy', label: t('suite.field.createdBy'), children: view?.createdBy ?? '-' },
            {
              key: 'description',
              label: t('suite.field.description'),
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
        title={t('suite.tab.cases')}
        columns={columns}
        columnSettingKey="suite-cases"
        rowKey="id"
        loading={cases.isPending}
        dataSource={cases.data ?? []}
        pagination={false}
      />
      {view ? (
        <SuiteFormModal productId={view.productId} suite={view} open={editOpen} onClose={() => setEditOpen(false)} />
      ) : null}
      {view ? <SuiteLinkCaseModal suite={view} open={linkOpen} onClose={() => setLinkOpen(false)} /> : null}
    </PageContainer>
  )
}
