/** @route /docs/:docId/diff @title docVersion.title.diff @perm doc-view @hide @activeMenu /doc/spaces */
import { useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Card,
  EmptyState,
  PageContainer,
  PageHeader,
  PageLoading,
  Result,
  Select,
  Space,
  Typography,
} from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { withParam } from '../../../shared/url'
import { fetchDoc, fetchDocVersion, fetchDocVersions, qk } from '../api/doc.api'
import { DocDiffView } from '../components/doc-diff-view'

/** 版本比对（T-5 / doc §6 D 范式：?from=&to= 双栏；§5 diff 无端点，两版快照前端渲染）。 */
export default function DocDiffPage() {
  const { t } = useTranslation()
  const docId = Number(useParams().docId)
  const [searchParams, setSearchParams] = useSearchParams()
  const from = Number(searchParams.get('from'))
  const to = Number(searchParams.get('to'))
  const valid = Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= 1

  const doc = useQuery({ queryKey: qk.doc.detail(docId), queryFn: () => fetchDoc(docId) })
  const versions = useQuery({ queryKey: qk.doc.versions(docId), queryFn: () => fetchDocVersions(docId) })
  const fromVersion = useQuery({
    queryKey: qk.doc.version(docId, from),
    queryFn: () => fetchDocVersion(docId, from),
    enabled: valid,
  })
  const toVersion = useQuery({
    queryKey: qk.doc.version(docId, to),
    queryFn: () => fetchDocVersion(docId, to),
    enabled: valid,
  })

  const error = doc.error ?? versions.error ?? fromVersion.error ?? toVersion.error
  if (doc.isPending || versions.isPending || (valid && (fromVersion.isPending || toVersion.isPending))) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  // 快照读取权限随主文档（§3.3）：不可见 → 40401/40302，原样呈现
  if (error) {
    return (
      <PageContainer>
        <PageHeader title={t('docVersion.title.diff')} backTo={`/docs/${docId}/versions`} />
        <Result
          status="error"
          title={t('doc.message.unavailable')}
          subTitle={errorText(error, t, 'common.message.failed')}
        />
      </PageContainer>
    )
  }

  const options = (versions.data?.items ?? []).map((item) => ({ value: item.version, label: `v${item.version}` }))
  const pick = (side: 'from' | 'to', value: number): void => setSearchParams(withParam(searchParams, side, value))

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            <Typography.Text strong>{doc.data?.title ?? ''}</Typography.Text>
            <Typography.Text type="secondary">{t('docVersion.title.diff')}</Typography.Text>
          </Space>
        }
        backTo={`/docs/${docId}/versions`}
        extra={
          <>
            <Select
              aria-label="diff-from"
              className="tw:w-[110px]"
              value={valid ? from : undefined}
              options={options}
              onChange={(value) => pick('from', Number(value))}
            />
            <Typography.Text>{'→'}</Typography.Text>
            <Select
              aria-label="diff-to"
              className="tw:w-[110px]"
              value={valid ? to : undefined}
              options={options}
              onChange={(value) => pick('to', Number(value))}
            />
          </>
        }
      />
      <Card>
        {!valid ? (
          <EmptyState description={t('docVersion.message.pickVersions')} />
        ) : fromVersion.data && toVersion.data ? (
          <DocDiffView from={fromVersion.data} to={toVersion.data} />
        ) : null}
      </Card>
    </PageContainer>
  )
}
