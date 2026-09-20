/** @route /admin/lang-upload @title platform.langUpload.title @perm lang-manage @menu admin/lang @order 2 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, errorText, type Translator } from '@zentao/api-client'
import type { LangImportView } from '@zentao/api-client/generated/model/langImportView'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Flex,
  ListCard,
  PageContainer,
  PageHeader,
  Select,
  StatusTag,
  Table,
  type TableColumnsType,
  Tabs,
  Typography,
  Upload,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { withParam } from '../../../shared/url'
import { downloadLangPack, fetchLangImports, fetchLocaleOptions, uploadLangImport } from '../api/platform.api'

/** 可上传语言（Excel 语言列 = 语言包目录内的语言，platform 卡 §3.12；zh-tw 无语言包，不在此列）。 */
const IMPORT_LANGUAGES = ['zh-cn', 'en']
/** 服务端行级原因码的 fields 键前缀（platform 卡 §3.12：`row:<Excel 行号>`）。 */
const ROW_PREFIX = 'row:'

/** 失败行（行号升序）；`file` 键是文件级错误，单独渲染。 */
function failedRows(fields: Record<string, string>): { row: number; reason: string }[] {
  return Object.entries(fields)
    .filter(([key]) => key.startsWith(ROW_PREFIX))
    .map(([key, reason]) => ({ row: Number(key.slice(ROW_PREFIX.length)), reason }))
    .sort((a, b) => a.row - b.row)
}

/** 原因码 → 文案：缺 i18n 键时回落原始码（码是 ASCII，en 界面不会因此冒中文）。 */
function reasonText(t: Translator, reason: string): string {
  const key = `platform.langUpload.reason.${reason}`
  const text = t(key)
  return text === key ? reason : text
}

/**
 * 多语言上传（platform 卡 §3.12；旧 custom-set 的导入/导出面）：上传 Tab = 下载语言包 + 上传 Excel，
 * 上传记录 Tab = 谁在什么时候传了什么、成了几行（失败也留痕）。
 */
export default function LangUploadPage() {
  const { t } = useTranslation()
  const message = useMessage()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [uploadLang, setUploadLang] = useState('zh-cn')
  const [result, setResult] = useState<LangImportView | null>(null)
  const [failure, setFailure] = useState<{ fields: Record<string, string>; message: string } | null>(null)

  const locales = useQuery({ queryKey: ['getDict', 'locales'], queryFn: fetchLocaleOptions })
  const page = Number(searchParams.get('page') ?? 1)
  const q = searchParams.get('q') ?? ''
  const langFilter = searchParams.get('lang') ?? ''
  const statusFilter = searchParams.get('status') ?? ''
  const logs = useQuery({
    queryKey: ['listLangImports', { page, q, langFilter, statusFilter }],
    queryFn: () =>
      fetchLangImports({
        page,
        limit: 20,
        sort: '-createdAt',
        ...(q === '' ? {} : { q }),
        filters: {
          ...(langFilter === '' ? {} : { lang: langFilter }),
          ...(statusFilter === '' ? {} : { status: statusFilter }),
        },
      }),
  })

  const download = useMutation({
    mutationFn: downloadLangPack,
    onSuccess: () => message.success(t('common.message.exported')),
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  const upload = useMutation({
    mutationFn: (file: File) => uploadLangImport(file, uploadLang),
    onSuccess: (view) => {
      setResult(view)
      setFailure(null)
      void queryClient.invalidateQueries({ queryKey: ['listLangImports'] })
    },
    // 校验失败（42201）：失败记录已由服务端落库，这里只呈现原因码（fields）与按码映射的提示
    onError: (error) => {
      setResult(null)
      setFailure({
        fields: error instanceof ApiError ? (error.fields ?? {}) : {},
        message: errorText(error, t, 'platform.langUpload.failed'),
      })
    },
  })

  const uploadOptions = (locales.data ?? []).filter((item) => IMPORT_LANGUAGES.includes(item.value))
  const rows = failure === null ? [] : failedRows(failure.fields)
  const failureColumns: TableColumnsType<{ row: number; reason: string }> = [
    { title: t('platform.langUpload.row'), dataIndex: 'row', width: 90 },
    {
      title: t('platform.langUpload.reason'),
      dataIndex: 'reason',
      render: (reason: string) => reasonText(t, reason),
    },
  ]

  const logColumns: TableColumnsType<LangImportView> = [
    { title: t('platform.langImport.field.lang'), dataIndex: 'lang', width: 100 },
    { title: t('platform.langImport.field.fileName'), dataIndex: 'fileName' },
    { title: t('platform.langImport.field.totalRows'), dataIndex: 'totalRows', width: 90 },
    { title: t('platform.langImport.field.appliedRows'), dataIndex: 'appliedRows', width: 90 },
    { title: t('platform.langImport.field.failedRows'), dataIndex: 'failedRows', width: 90 },
    {
      title: t('common.field.status'),
      dataIndex: 'status',
      width: 100,
      render: (status: string) => (
        <StatusTag tone={status === 'success' ? 'active' : 'error'}>
          {t(`platform.langImport.status.${status}`)}
        </StatusTag>
      ),
    },
    { title: t('platform.langImport.field.createdBy'), dataIndex: 'createdBy', width: 110 },
    {
      title: t('platform.langImport.field.createdAt'),
      dataIndex: 'createdAt',
      width: 180,
      render: (createdAt: string) => new Date(createdAt).toLocaleString(),
    },
    {
      title: t('platform.langImport.field.message'),
      dataIndex: 'message',
      render: (text: string | null) => text ?? '',
    },
  ]

  const uploadTab = (
    <Card>
      <Flex vertical gap={12}>
        <Flex align="center" gap={8} wrap>
          <Button loading={download.isPending} onClick={() => download.mutate()}>
            {t('platform.langUpload.download')}
          </Button>
          <Select
            aria-label={t('platform.langImport.field.lang')}
            value={uploadLang}
            style={{ width: 140 }}
            options={uploadOptions}
            onChange={setUploadLang}
          />
          <Upload
            accept=".xlsx,.xls"
            maxCount={1}
            showUploadList={false}
            // beforeUpload=false：拦截 antd 自己的上传动作，由 useMutation 走生成的 multipart 请求
            beforeUpload={(file) => {
              upload.mutate(file)
              return false
            }}
          >
            <Button type="primary" loading={upload.isPending}>
              {t('platform.langUpload.selectFile')}
            </Button>
          </Upload>
          <Typography.Text type="secondary">{t('platform.langUpload.hint')}</Typography.Text>
        </Flex>

        {result !== null ? (
          <Alert
            type="success"
            showIcon
            message={`${t('platform.langUpload.success')}：${t('platform.langUpload.result.total', { total: result.totalRows })}、${t('platform.langUpload.result.applied', { applied: result.appliedRows })}`}
          />
        ) : null}

        {failure !== null ? (
          <Alert
            type="error"
            showIcon
            message={failure.message}
            description={
              <Flex vertical gap={8}>
                {failure.fields.file !== undefined ? (
                  <Typography.Text>
                    {`${t('platform.langUpload.reason')}：${reasonText(t, failure.fields.file)}`}
                  </Typography.Text>
                ) : null}
                {rows.length > 0 ? (
                  <>
                    <Typography.Text>{t('platform.langUpload.result.failed', { failed: rows.length })}</Typography.Text>
                    <Table rowKey="row" size="small" pagination={false} columns={failureColumns} dataSource={rows} />
                  </>
                ) : null}
              </Flex>
            }
          />
        ) : null}
      </Flex>
    </Card>
  )

  const logsTab = (
    <>
      <ListFilterForm
        fields={[
          keywordField(t('platform.langImport.field.fileName'), t('common.action.search')),
          selectField('lang', t('platform.langImport.field.lang'), uploadOptions),
          selectField('status', t('common.field.status'), [
            { value: 'success', label: t('platform.langImport.status.success') },
            { value: 'failed', label: t('platform.langImport.status.failed') },
          ]),
        ]}
      />
      <ListCard
        columns={logColumns}
        columnSettingKey="platform-lang-imports"
        rowKey="id"
        loading={logs.isPending}
        dataSource={logs.data?.items ?? []}
        locale={{ emptyText: <EmptyState description={t('platform.langImport.empty')} /> }}
        pagination={{
          current: page,
          pageSize: 20,
          total: logs.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
    </>
  )

  return (
    <PageContainer>
      <PageHeader title={t('platform.langUpload.title')} />
      <Tabs
        items={[
          { key: 'upload', label: t('platform.langUpload.tab.upload'), children: uploadTab },
          { key: 'logs', label: t('platform.langUpload.tab.logs'), children: logsTab },
        ]}
      />
    </PageContainer>
  )
}
