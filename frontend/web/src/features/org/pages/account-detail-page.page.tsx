/** @route /org/accounts/:accountId @title org.account.detailTitle @perm account-view @hide @activeMenu /org/accounts */
import { useQuery } from '@tanstack/react-query'
import { Card, Descriptions, PageContainer, PageHeader, PageLoading, Tabs, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { ActivityTimeline, CommentPanel } from '../../platform'
import { fetchAccount, fetchAccountActivities } from '../api/org.api'
import { useRoleLabels } from '../role-options'

/** 账号详情（org 卡 §6：页头 + 资料区 + 动态页签；旧 user-profile/dynamic）。 */
export default function AccountDetailPage() {
  const { t } = useTranslation()
  const accountId = Number(useParams().accountId)
  const account = useQuery({ queryKey: ['getAccount', accountId], queryFn: () => fetchAccount(accountId) })
  // 账号的角色是成员关系（T23）：展示名来自角色表，多个角色顿号分隔
  const roleLabelsOf = useRoleLabels()

  if (account.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  const view = account.data

  return (
    <PageContainer>
      <PageHeader title={view?.realName ?? ''} backTo="/org/accounts" />
      <Card>
        <Descriptions
          column={2}
          items={[
            { key: 'account', label: t('org.account.field.account'), children: view?.account ?? '-' },
            { key: 'roles', label: t('org.account.field.roles'), children: roleLabelsOf(view?.roleIds) },
            { key: 'email', label: t('org.account.field.email'), children: view?.email ?? '-' },
            {
              key: 'status',
              label: t('org.account.field.status'),
              children: <Typography.Text>{t(`org.account.status.${view?.status ?? 'active'}`)}</Typography.Text>,
            },
          ]}
        />
      </Card>
      <Card>
        <Tabs
          items={[
            {
              key: 'activities',
              label: t('org.account.tab.activities'),
              children: (
                <ActivityTimeline
                  fetchPage={(beforeId) =>
                    fetchAccountActivities(accountId, beforeId !== undefined ? { limit: 50, beforeId } : { limit: 50 })
                  }
                />
              ),
            },
            {
              key: 'comments',
              label: t('org.account.tab.comments'),
              children: <CommentPanel objectType="account" objectId={accountId} />,
            },
          ]}
        />
      </Card>
    </PageContainer>
  )
}
