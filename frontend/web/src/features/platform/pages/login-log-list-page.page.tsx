/** @route /admin/login-logs @title platform.loginLog.title @perm audit-log-view @menu admin/audit @order 2 */
import { PageContainer, PageHeader } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { dateRangeField, keywordField, ListFilterForm } from '../../../shared/list-filter'
import { AuditLogTable } from '../components/audit-log-table'

/**
 * 登录日志（platform 卡 §3.13）：审计流水里 login / login-failed 两个动作的视图。
 * 只读页；动作条件由 AuditLogTable 的 actionFilter 预设写死在请求里——筛选区不暴露该控件。
 */
export default function LoginLogListPage() {
  const { t } = useTranslation()
  return (
    <PageContainer>
      <PageHeader title={t('platform.loginLog.title')} />
      <ListFilterForm
        fields={[
          keywordField(t('platform.auditLog.filter.account'), t('common.action.search')),
          dateRangeField('filters[createdAt]', t('platform.auditLog.filter.dateRange')),
        ]}
      />
      {/* 动作恒为 login,login-failed（逗号即服务端 IN）；手改 URL 的 filters[action] 不生效 */}
      <AuditLogTable actionFilter="login,login-failed" columnSettingKey="platform-login-logs" />
    </PageContainer>
  )
}
