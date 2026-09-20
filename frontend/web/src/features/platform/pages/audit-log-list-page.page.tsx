/** @route /admin/audit-logs @title platform.auditLog.title @perm audit-log-view @menu admin/audit @order 1 */
import { PageContainer, PageHeader } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { dateRangeField, keywordField, ListFilterForm } from '../../../shared/list-filter'
import { AuditLogTable } from '../components/audit-log-table'

/**
 * 操作日志（platform 卡 §3.13）：全量审计流水，谁在什么时候做了什么。
 * 只读页——行由写请求的审计横切追加（`audit_log` 没有写端点），故没有新建/编辑/删除，也没有行内动作。
 */
export default function AuditLogListPage() {
  const { t } = useTranslation()
  return (
    <PageContainer>
      <PageHeader title={t('platform.auditLog.title')} />
      <ListFilterForm
        fields={[
          keywordField(t('platform.auditLog.filter.account'), t('common.action.search')),
          keywordField(t('platform.auditLog.filter.action'), t('common.action.search'), 'filters[action]'),
          dateRangeField('filters[createdAt]', t('platform.auditLog.filter.dateRange')),
        ]}
      />
      <AuditLogTable columnSettingKey="platform-audit-logs" />
    </PageContainer>
  )
}
