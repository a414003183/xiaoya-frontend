/** @route /test-cases/:caseId @title quality.title.testCaseDetail @perm testcase-view @hide @activeMenu /products */
// list-standard: exempt (sub-table) — 详情/表单内的结构性子表，非列表页
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Descriptions,
  EmptyState,
  HasPerm,
  PageContainer,
  PageHeader,
  PageLoading,
  Popconfirm,
  Space,
  StatusTag,
  Table,
  Tabs,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { actionsFor } from '../../../shared/meta'
import { withParam } from '../../../shared/url'
import { ActivityTimeline, CommentPanel, FileUploadField } from '../../platform'
import { deleteTestCaseAction, fetchTestCase, fetchTestCaseActivities, fetchTestCaseMeta, qk } from '../api/quality.api'
import { TestCaseReviewModal } from '../components/test-case-review-modal'
import { BugCreateModal } from '../forms/bug-create-modal'
import { TestCaseEditModal } from '../forms/test-case-edit-modal'
import { actionI18nKey, testCaseTone } from '../model'

/** 用例详情（T-5 / quality §6 D 范式：前置条件 + 步骤/预期表 + lastRun 三字段只读 + 动态页签；B-QUA-02 从本用例提 Bug）。 */
export default function TestCaseDetailPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const caseId = Number(useParams().caseId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [bugOpen, setBugOpen] = useState(false)

  const testCase = useQuery({ queryKey: qk.quality.testCase(caseId), queryFn: () => fetchTestCase(caseId) })
  const meta = useQuery({ queryKey: qk.quality.caseMeta(), queryFn: fetchTestCaseMeta })
  const view = testCase.data

  const remove = useMutation({
    mutationFn: () => deleteTestCaseAction(caseId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['getTestCase'] })
      void queryClient.invalidateQueries({ queryKey: ['listTestCases'] })
      void queryClient.invalidateQueries({ queryKey: ['listLibraryCases'] })
      // 库用例（productId=0）无产品维列表，回库列表
      navigate(view && view.productId > 0 ? `/products/${view.productId}/test-cases` : '/libraries')
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  if (testCase.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const stepColumns = [
    { title: t('testCase.field.stepSort'), dataIndex: 'sort', width: 70 },
    {
      title: t('testCase.field.stepDescription'),
      dataIndex: 'description',
      render: (text: string) => (
        <Typography.Paragraph className="tw:mb-0" style={{ whiteSpace: 'pre-wrap' }}>
          {text}
        </Typography.Paragraph>
      ),
    },
    {
      title: t('testCase.field.stepExpects'),
      dataIndex: 'expects',
      render: (text: string | null) => (
        <Typography.Paragraph className="tw:mb-0" style={{ whiteSpace: 'pre-wrap' }}>
          {text ?? '-'}
        </Typography.Paragraph>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            {view?.title ?? ''}
            <StatusTag tone={testCaseTone(view?.status ?? 'normal')}>
              {t(`testCase.status.${view?.status ?? 'normal'}`)}
            </StatusTag>
          </Space>
        }
        backTo={view ? `/products/${view.productId}/test-cases` : '/products'}
        extra={
          <>
            {actionsFor(meta.data?.actions, view?.status).map((action) => (
              <Button
                key={action.action}
                type={action.action === 'review' ? 'primary' : 'default'}
                onClick={() => (action.action === 'review' ? setReviewOpen(true) : setEditOpen(true))}
              >
                {t(actionI18nKey('testCase', action.action))}
              </Button>
            ))}
            {view && view.productId > 0 ? (
              <HasPerm perm="bug-create">
                <Button aria-label="case-report-bug" onClick={() => setBugOpen(true)}>
                  {t('bug.action.create')}
                </Button>
              </HasPerm>
            ) : null}
            <HasPerm perm="testcase-delete">
              <Popconfirm title={t('testCase.message.deleteHint')} onConfirm={() => remove.mutate()}>
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
            { key: 'id', label: t('testCase.field.id'), children: view?.id ?? '-' },
            {
              key: 'priority',
              label: t('testCase.field.priority'),
              children: t(`common.priority.${view?.priority ?? 3}`),
            },
            { key: 'type', label: t('testCase.field.type'), children: t(`testCase.type.${view?.type ?? 'feature'}`) },
            {
              key: 'stage',
              label: t('testCase.field.stage'),
              children: (view?.stage ?? []).map((item) => t(`testCase.stage.${item}`)).join('、') || '-',
            },
            {
              key: 'precondition',
              label: t('testCase.field.precondition'),
              span: 3,
              children: view?.precondition ? (
                <Typography.Paragraph className="tw:mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                  {view.precondition}
                </Typography.Paragraph>
              ) : (
                '-'
              ),
            },
            { key: 'storyId', label: t('testCase.field.story'), children: view?.storyId ? `#${view.storyId}` : '-' },
            { key: 'keywords', label: t('testCase.field.keywords'), children: view?.keywords ?? '-' },
            { key: 'version', label: t('testCase.field.version'), children: view?.version ?? 1 },
            // lastRun 三字段只读（quality §3.2：Result 副作用写）
            {
              key: 'lastRunResult',
              label: t('testCase.field.lastRunResult'),
              children: view?.lastRunResult ? t(`testCase.result.${view.lastRunResult}`) : '-',
            },
            { key: 'lastRunner', label: t('testCase.field.lastRunner'), children: view?.lastRunner ?? '-' },
            { key: 'lastRunAt', label: t('testCase.field.lastRunAt'), children: view?.lastRunAt ?? '-' },
            {
              key: 'reviewers',
              label: t('testCase.field.reviewers'),
              children: (view?.reviewers ?? []).join('、') || '-',
            },
            { key: 'reviewedAt', label: t('testCase.field.reviewedAt'), children: view?.reviewedAt ?? '-' },
            { key: 'createdBy', label: t('common.field.createdBy'), children: view?.createdBy ?? '-' },
          ]}
        />
      </Card>
      <Card>
        <Tabs
          activeKey={searchParams.get('tab') ?? 'steps'}
          onChange={(key) => setSearchParams(withParam(searchParams, 'tab', key))}
          items={[
            {
              key: 'steps',
              label: t('testCase.tab.steps'),
              children:
                (view?.steps ?? []).length === 0 ? (
                  <EmptyState description={t('common.empty')} />
                ) : (
                  <Table
                    rowKey="sort"
                    size="small"
                    columns={stepColumns}
                    dataSource={view?.steps ?? []}
                    pagination={false}
                  />
                ),
            },
            {
              key: 'activities',
              label: t('testCase.tab.activities'),
              children: <ActivityTimeline fetchPage={(beforeId) => fetchTestCaseActivities(caseId, beforeId)} />,
            },
            {
              key: 'files',
              label: t('testCase.tab.files'),
              children: (
                <HasPerm perm="file-upload">
                  <FileUploadField objectType="testCase" objectId={caseId} />
                </HasPerm>
              ),
            },
            {
              key: 'comments',
              label: t('platform.comment.title'),
              children: <CommentPanel objectType="testCase" objectId={caseId} />,
            },
          ]}
        />
      </Card>
      <TestCaseReviewModal testCase={view ?? null} open={reviewOpen} onClose={() => setReviewOpen(false)} />
      {view ? (
        <TestCaseEditModal
          productId={view.productId}
          testCase={view}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
      {view && view.productId > 0 ? (
        <BugCreateModal
          productId={view.productId}
          testCaseId={caseId}
          open={bugOpen}
          onClose={() => setBugOpen(false)}
          onCreated={(bug) => navigate(`/bugs/${bug.id}`)}
        />
      ) : null}
    </PageContainer>
  )
}
