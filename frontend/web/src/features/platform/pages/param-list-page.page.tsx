/** @route /admin/params @title platform.param.title @perm setting-manage @menu admin/system @order 2 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  ConfirmAction,
  EmptyState,
  ListCard,
  PageContainer,
  PageLoading,
  Space,
  type TableColumnsType,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE } from '../../../shared/list-dsl'
import { keywordField, ListFilterForm } from '../../../shared/list-filter'
import { paramNumber, withParam } from '../../../shared/url'
import { deleteSettingEntryAction, fetchSettingEntries, type SettingEntryView } from '../api/platform.api'
import { ParamFormModal } from '../components/param-form-modal'

/**
 * 参数管理（T15 P1-3）：`setting` 表**系统行**的原始视图（域 + 键 + JSON 文本值），与「系统设置」页的区别是
 * 后者是按用途编排的表单、这里是全部键的底表。个人偏好行（员工自己的通知开关等）不在这里。
 *
 * 值按 JSON 文本呈现与编辑：读取方（设置页、地盘布局…）按 JSON 解析，页面就不替它做类型转换。
 */
export default function ParamListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = paramNumber(searchParams, 'page', 1)
  const q = searchParams.get('q') ?? ''
  const domain = searchParams.get('filters[domain]') ?? ''
  const [editing, setEditing] = useState<SettingEntryView | null>(null)
  const [creating, setCreating] = useState(false)

  const entries = useQuery({
    queryKey: ['listSettingEntries', { page, q, domain }],
    // filters 字面量留在调用点：check-filter-fields 按它对齐契约的 filters[x] 名单（06 A6-2）
    queryFn: () => fetchSettingEntries({ page, limit: DEFAULT_PAGE_SIZE, q, filters: { domain } }),
  })

  const remove = useMutation({
    mutationFn: (key: string) => deleteSettingEntryAction(key),
    onSuccess: () => {
      message.success(t('platform.param.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['listSettingEntries'] })
    },
    onError: (error) => message.error(errorText(error, t)),
  })

  const columns: TableColumnsType<SettingEntryView> = [
    {
      title: t('platform.param.field.key'),
      dataIndex: 'key',
      width: 260,
      // 键就是这行的身份：点它即打开编辑（值可改、键只读）
      render: (key: string, record: SettingEntryView) => (
        <Button type="link" size="small" onClick={() => setEditing(record)}>
          {key}
        </Button>
      ),
    },
    { title: t('platform.param.field.domain'), dataIndex: 'domain', width: 130 },
    {
      title: t('platform.param.field.value'),
      dataIndex: 'value',
      render: (value: string | null | undefined) =>
        value === null || value === undefined || value === '' ? (
          t('common.field.none')
        ) : (
          <Typography.Text ellipsis style={{ maxWidth: 320 }} title={value}>
            {value}
          </Typography.Text>
        ),
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 140,
      render: (_: unknown, record: SettingEntryView) => (
        <Space wrap size={4}>
          <Button type="link" size="small" onClick={() => setEditing(record)}>
            {t('common.action.edit')}
          </Button>
          <ConfirmAction
            title={t('platform.param.deleteTitle', { key: record.key })}
            description={t('platform.param.deleteDescription')}
            onConfirm={() => remove.mutate(record.key)}
          >
            <Button type="link" size="small" danger>
              {t('common.action.delete')}
            </Button>
          </ConfirmAction>
        </Space>
      ),
    },
  ]

  if (entries.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  if (entries.error) {
    return (
      <PageContainer>
        <Typography.Text type="secondary">{errorText(entries.error, t, 'common.loading')}</Typography.Text>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <ListFilterForm
        fields={[
          keywordField(t('platform.param.filter.key'), t('common.action.search')),
          keywordField(t('platform.param.filter.domain'), t('common.action.search'), 'filters[domain]'),
        ]}
      />
      <ListCard<SettingEntryView>
        columns={columns}
        columnSettingKey="platform-params"
        actions={
          <Button type="primary" onClick={() => setCreating(true)}>
            {t('platform.param.action.create')}
          </Button>
        }
        rowKey="key"
        dataSource={entries.data.items}
        pagination={{
          current: page,
          pageSize: DEFAULT_PAGE_SIZE,
          total: entries.data.total,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
        locale={{ emptyText: <EmptyState description={t('platform.param.empty')} /> }}
      />
      <ParamFormModal
        entry={editing}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
      />
    </PageContainer>
  )
}
