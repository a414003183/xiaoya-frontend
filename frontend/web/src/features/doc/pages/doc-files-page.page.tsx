/** @route /doc/files @title doc.title.files @perm doc-view @menu doc @order 3 */
import { useQuery } from '@tanstack/react-query'
import type { FileView } from '@zentao/api-client/generated/model/fileView'
import { ListCard, PageContainer, Select, type TableColumnsType, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { ListFilterForm } from '../../../shared/list-filter'
import { fileDownloadUrl } from '../../platform'
import { fetchDoc, fetchDocFiles, fetchDocs, qk, TREE_LIMIT } from '../api/doc.api'
import { docExcerpt } from '../model'

/** 附件库（T-5 / doc §6 L 范式）。附件挂在文档上：platform §5 的 GET /files 要求 filters[objectType]+filters[objectId]
 *  同时必填（缺一 40001），契约没有跨对象的全局附件列表端点，故本页按文档选择后列出其附件。 */
export default function DocFilesPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const docId = Number(searchParams.get('docId') ?? 0)
  const selected = docId > 0

  const docs = useQuery({
    queryKey: qk.doc.list({ scene: 'files', limit: TREE_LIMIT }),
    queryFn: () => fetchDocs({ limit: TREE_LIMIT }),
  })
  const doc = useQuery({ queryKey: qk.doc.detail(docId), queryFn: () => fetchDoc(docId), enabled: selected })
  const files = useQuery({
    queryKey: qk.doc.files(docId),
    queryFn: () => fetchDocFiles(docId),
    enabled: selected,
  })

  const sizeLabel = (bytes: number): string =>
    bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

  const columns: TableColumnsType<FileView> = [
    { title: t('common.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('file.field.title'),
      dataIndex: 'title',
      // 下载地址按 backend FileViews 的同形路径拼（MSW 的 url 少了 /api/v1 前缀，见偏差报告）
      render: (title: string, record: FileView) => (
        <Typography.Link href={fileDownloadUrl(record.id)} target="_blank">
          {title}
        </Typography.Link>
      ),
    },
    { title: t('file.field.extension'), dataIndex: 'extension', width: 100 },
    {
      title: t('file.field.size'),
      dataIndex: 'size',
      width: 100,
      render: (value: number) => sizeLabel(value),
    },
    { title: t('file.field.downloads'), dataIndex: 'downloads', width: 100 },
    { title: t('common.field.createdBy'), dataIndex: 'createdBy', width: 110 },
    { title: t('common.field.createdAt'), dataIndex: 'createdAt', width: 180 },
  ]

  return (
    <PageContainer>
      <ListFilterForm
        fields={[
          {
            name: 'docId',
            label: t('doc.field.doc'),
            /* 对象选择器：需搜索且标题更长，宽度按本页需要给（value 传字符串与 URL 同形） */
            control: (
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: 280 }}
                placeholder={t('doc.message.pickDoc')}
                options={(docs.data?.items ?? []).map((item) => ({
                  value: String(item.id),
                  label: `#${item.id} ${docExcerpt(item.title, 40)}`,
                }))}
              />
            ),
          },
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="doc-files"
        toolbar={
          selected ? (
            <Typography.Text type="secondary">
              {t('doc.field.doc')}：{doc.data?.title ?? `#${docId}`}
            </Typography.Text>
          ) : null
        }
        rowKey="id"
        loading={files.isPending}
        dataSource={files.data?.items ?? []}
        pagination={false}
      />
    </PageContainer>
  )
}
