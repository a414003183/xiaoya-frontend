/** @route /docs/:docId/versions @title docVersion.title.list @perm doc-view @hide @activeMenu /doc/spaces */
import { useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { DocVersionView } from '@zentao/api-client/generated/model/docVersionView'
import {
  Button,
  ListCard,
  PageContainer,
  PageHeader,
  PageLoading,
  Result,
  Space,
  type TableColumnsType,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { fetchDoc, fetchDocVersions, qk } from '../api/doc.api'
import { docExcerpt, showDraftBadge } from '../model'

/** 版本历史（T-5 / doc §6 L 范式：勾选两版跳 diff 页；列表固定 version desc、不分页，§3.3）。 */
export default function DocVersionsPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const docId = Number(useParams().docId)
  const [selected, setSelected] = useState<number[]>([])

  const doc = useQuery({ queryKey: qk.doc.detail(docId), queryFn: () => fetchDoc(docId) })
  const versions = useQuery({ queryKey: qk.doc.versions(docId), queryFn: () => fetchDocVersions(docId) })

  if (doc.isPending || versions.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  if (doc.error || versions.error) {
    const error = doc.error ?? versions.error
    return (
      <PageContainer>
        <PageHeader title={t('docVersion.title.list')} backTo={`/docs/${docId}`} />
        <Result
          status="error"
          title={t('doc.message.unavailable')}
          subTitle={errorText(error, t, 'common.message.failed')}
        />
      </PageContainer>
    )
  }

  const compare = (): void => {
    const [first, second] = [...selected].sort((a, b) => a - b)
    if (first === undefined || second === undefined) {
      message.warning(t('docVersion.message.selectTwo'))
      return
    }
    navigate(`/docs/${docId}/diff?from=${first}&to=${second}`)
  }

  const columns: TableColumnsType<DocVersionView> = [
    {
      title: t('docVersion.field.version'),
      dataIndex: 'version',
      width: 100,
      render: (value: number) => `v${value}`,
    },
    { title: t('docVersion.field.title'), dataIndex: 'title' },
    {
      title: t('docVersion.field.digest'),
      dataIndex: 'digest',
      render: (value: string | null) => docExcerpt(value, 60),
    },
    { title: t('common.field.createdBy'), dataIndex: 'createdBy', width: 110 },
    { title: t('common.field.createdAt'), dataIndex: 'createdAt', width: 180 },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            <Typography.Text strong>{doc.data?.title ?? ''}</Typography.Text>
            <Typography.Text type="secondary">{t('docVersion.title.list')}</Typography.Text>
            {doc.data && showDraftBadge(doc.data) ? (
              <Typography.Text type="warning">{t('doc.field.hasDraft')}</Typography.Text>
            ) : null}
          </Space>
        }
        backTo={`/docs/${docId}`}
        extra={
          <Button type="primary" disabled={selected.length !== 2} onClick={compare} aria-label="doc-version-compare">
            {t('docVersion.action.compare')}
          </Button>
        }
      />
      <ListCard
        columns={columns}
        columnSettingKey="doc-versions"
        rowKey="version"
        dataSource={versions.data?.items ?? []}
        pagination={false}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys.map((key) => Number(key))),
          // 只勾两版（§6：选两版跳 diff）
          getCheckboxProps: (record) => ({
            disabled: selected.length >= 2 && !selected.includes(record.version),
          }),
        }}
      />
    </PageContainer>
  )
}
