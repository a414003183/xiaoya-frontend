/** @route /admin/lang-upload @title platform.langUpload.title @perm lang-manage @menu admin/lang @order 1 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, errorText } from '@zentao/api-client'
import type { LangImportView } from '@zentao/api-client/generated/model/langImportView'
import {
  Button,
  EmptyState,
  ListCard,
  PageContainer,
  StatusTag,
  type TableColumnsType,
  Upload,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE } from '../../../shared/list-dsl'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { withParam } from '../../../shared/url'
import { downloadLangPack, fetchLangImports, fetchLocaleOptions, uploadLangImport } from '../api/platform.api'
import { LangUploadResultModal, type UploadOutcome } from '../components/lang-upload-result-modal'

/**
 * 多语言上传（platform 卡 §3.12；T21 收敛为**一页**，T05 单文件全语言）：
 * 上传记录列表（谁在什么时候传了什么、成了几行、失败在哪几行）+ 上传动作本身（下载语言包 / 传 Excel）。
 *
 * 用户 2026-09-21 定稿：「只保留一个页面——上传记录页 + 上传按钮」，故原来的「上传 / 上传记录 / 文案覆盖」
 * 三页签收成一个：**在线逐键改文案（文案覆盖）已删**，文案一律走 Excel 统一覆盖，上传即生效
 * （前端运行时合并 `lang_item` 覆盖层，后端消息经 `LangPackMessageSource` 同源解析）。
 * ADR-005 起也不再有语言选择器：一份 xlsx 包揽 `key | zh-cn | en`，语言由列头决定。
 *
 * 失败行明细与成功回执放结果弹窗（上传是瞬时动作，不该把列表页长期占掉两块告警区）。
 */
export default function LangUploadPage() {
  const { t } = useTranslation()
  const message = useMessage()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [outcome, setOutcome] = useState<UploadOutcome | null>(null)

  const page = Number(searchParams.get('page') ?? 1)
  const q = searchParams.get('q') ?? ''
  const langFilter = searchParams.get('filters[lang]') ?? ''
  const statusFilter = searchParams.get('filters[status]') ?? ''

  const locales = useQuery({ queryKey: ['getDict', 'locales'], queryFn: fetchLocaleOptions })
  const logs = useQuery({
    queryKey: ['listLangImports', { page, q, langFilter, statusFilter }],
    queryFn: () =>
      fetchLangImports({
        page,
        limit: DEFAULT_PAGE_SIZE,
        sort: '-createdAt',
        ...(q === '' ? {} : { q }),
        // filters 字面量留在调用点：check-filter-fields 按它对齐契约的 filters[x] 名单（06 A6-2）
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
    mutationFn: (file: File) => uploadLangImport(file),
    onSuccess: (view) => {
      setOutcome({ kind: 'success', view })
      // 一上传即生效：覆盖层缓存与前端运行时合并都要重取（后端缓存由上传端点清）
      invalidate()
    },
    // 校验失败（42201）：失败记录已由服务端落库，这里只呈现原因码（fields）与按码映射的提示
    onError: (error) => {
      setOutcome({
        kind: 'failure',
        fields: error instanceof ApiError ? (error.fields ?? {}) : {},
        message: errorText(error, t, 'platform.langUpload.failed'),
      })
      void queryClient.invalidateQueries({ queryKey: ['listLangImports'] })
    },
  })

  /** 上传会改覆盖层：记录列表 + 前端运行时合并的覆盖查询都要失效（切语言会带 lang 参数，前缀失效即可）。 */
  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['listLangImports'] })
    void queryClient.invalidateQueries({ queryKey: ['listLangOverrides'] })
  }

  /** 筛选用的语言选项：新记录恒 `all`，历史行是原语言码（列头即语言，故不再约束可上传语言）。 */
  const langFilterOptions = locales.data ?? []

  const columns: TableColumnsType<LangImportView> = [
    {
      title: t('platform.langImport.field.lang'),
      dataIndex: 'lang',
      width: 100,
      // 单文件全语言：新记录 lang=all，渲染成「全语言」（历史行原样显示 zh-cn/en）
      render: (lang: string) => (lang === 'all' ? t('platform.langImport.allLangs') : lang),
    },
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

  return (
    <PageContainer>
      <ListFilterForm
        fields={[
          keywordField(t('platform.langImport.field.fileName'), t('common.action.search')),
          selectField('filters[lang]', t('platform.langImport.field.lang'), langFilterOptions),
          selectField('filters[status]', t('common.field.status'), [
            { value: 'success', label: t('platform.langImport.status.success') },
            { value: 'failed', label: t('platform.langImport.status.failed') },
          ]),
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="platform-lang-imports"
        actions={
          <>
            <Button loading={download.isPending} onClick={() => download.mutate()}>
              {t('platform.langUpload.download')}
            </Button>
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
          </>
        }
        toolbar={<span>{t('platform.langUpload.hint')}</span>}
        rowKey="id"
        loading={logs.isPending}
        dataSource={logs.data?.items ?? []}
        locale={{ emptyText: <EmptyState description={t('platform.langImport.empty')} /> }}
        pagination={{
          current: page,
          pageSize: DEFAULT_PAGE_SIZE,
          total: logs.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <LangUploadResultModal
        outcome={outcome}
        onClose={() => {
          setOutcome(null)
          invalidate()
        }}
      />
    </PageContainer>
  )
}
