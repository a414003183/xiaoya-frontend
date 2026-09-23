/** @route /personnel @title personnel.title @perm personnel-view @menu org @order 4 */

import { useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Alert,
  Card,
  ListCard,
  PageContainer,
  PageLoading,
  sideTreeWidth,
  type TableColumnsType,
  Tree,
  Typography,
} from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE } from '../../../shared/list-dsl'
import { keywordField, ListFilterForm } from '../../../shared/list-filter'
import { paramNumber, withParam } from '../../../shared/url'
import {
  type AccountView,
  fetchAccounts,
  fetchDepartmentTree,
  fetchPersonnelMembers,
  type PersonnelMemberView,
} from '../api/org.api'
import { departmentKeyId, departmentNames, departmentTreeData } from '../model'
import { useRoleLabels } from '../role-options'

const PAGE_SIZE = DEFAULT_PAGE_SIZE

/**
 * 人员管理 · 成员列表（T-14 / org 卡 §6 L 范式：左部门树过滤 + 在办任务/未解决 Bug 计数列）。
 * 行跳账号详情：成员视图只带登录名，账号 id 经 /accounts 映射（account-view 为默认权限码）。
 */
export default function PersonnelListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const departmentId = searchParams.get('departmentId')
  const q = searchParams.get('q') ?? ''
  const page = paramNumber(searchParams, 'page', 1)

  const departments = useQuery({ queryKey: ['getDepartmentTree'], queryFn: fetchDepartmentTree })
  // account → id 映射（详情跳转用）；失败不阻断页面，行内退化为纯文本
  const accounts = useQuery({
    queryKey: ['listAccounts', 'personnel-map'],
    queryFn: () => fetchAccounts({ limit: 200 }),
  })
  const members = useQuery({
    queryKey: ['listPersonnelMembers', departmentId, q, page],
    queryFn: () =>
      fetchPersonnelMembers({
        page,
        limit: PAGE_SIZE,
        ...(departmentId ? { 'filters[departmentId]': departmentId } : {}),
        ...(q ? { q } : {}),
      }),
  })
  // 角色的展示名来自角色表（T23）——hook 必须在提前 return 之前调用
  const roleLabelsOf = useRoleLabels()

  if (members.isPending || departments.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  if (members.error) {
    return (
      <PageContainer>
        <Alert type="error" showIcon message={errorText(members.error, t, 'personnel.message.loadFailed')} />
      </PageContainer>
    )
  }

  const names = departmentNames(departments.data ?? [])
  const accountIds = new Map((accounts.data?.items ?? []).map((item: AccountView) => [item.account, item.id]))
  const columns: TableColumnsType<PersonnelMemberView> = [
    { title: t('personnel.field.account'), dataIndex: 'account' },
    { title: t('personnel.field.realName'), dataIndex: 'realName' },
    {
      title: t('personnel.field.department'),
      dataIndex: 'departmentId',
      render: (value: number | null | undefined) =>
        value === null || value === undefined ? '-' : (names.get(value) ?? `#${value}`),
    },
    {
      title: t('personnel.field.role'),
      key: 'roles',
      // 账号的角色是成员关系（T23）：展示名来自角色表（空值显示 -）
      render: (_: unknown, record: { roleIds?: readonly number[] }) => roleLabelsOf(record.roleIds),
    },
    { title: t('personnel.field.openTaskCount'), dataIndex: 'openTaskCount', width: 120 },
    { title: t('personnel.field.unresolvedBugCount'), dataIndex: 'unresolvedBugCount', width: 140 },
  ]

  return (
    <PageContainer>
      <div className="zt-split tw:gap-4">
        <Card title={t('org.department.title')} size="small" style={{ width: sideTreeWidth, flexShrink: 0 }}>
          <Tree
            blockNode
            defaultExpandAll
            selectedKeys={departmentId ? [`department-${departmentId}`] : []}
            onSelect={(keys) => {
              const key = keys[0]
              const id = typeof key === 'string' ? departmentKeyId(key) : null
              setSearchParams(withParam(withParam(searchParams, 'page', 1), 'departmentId', id ?? undefined))
            }}
            treeData={departmentTreeData(departments.data ?? [])}
          />
        </Card>
        <div className="zt-split-main tw:gap-4">
          <ListFilterForm fields={[keywordField(t('personnel.search'), t('personnel.search'))]} />
          <ListCard<PersonnelMemberView>
            columns={columns}
            columnSettingKey="org-personnel"
            actions={
              <Typography.Link onClick={() => navigate('/personnel/workload')}>
                {t('personnel.action.workload')}
              </Typography.Link>
            }
            rowKey="account"
            className="tw:cursor-pointer"
            dataSource={members.data?.items ?? []}
            // 行跳账号详情：成员视图只带登录名，id 经 /accounts 映射（映射缺失时该行不可跳）
            onRow={(record) => {
              const id = accountIds.get(record.account)
              return id === undefined ? {} : { onClick: () => navigate(`/org/accounts/${id}`) }
            }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: members.data?.total ?? 0,
              onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
            }}
          />
        </div>
      </div>
    </PageContainer>
  )
}
