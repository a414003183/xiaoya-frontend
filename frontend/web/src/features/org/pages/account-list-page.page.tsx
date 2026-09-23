/** @route /org/accounts @title org.accounts.title @perm account-view @menu org @order 1 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText, ok } from '@zentao/api-client'
import { disableAccount, enableAccount, getMe, unlockAccount } from '@zentao/api-client/generated'
import type { AccountView } from '@zentao/api-client/generated/model/accountView'
import {
  Button,
  Card,
  ListCard,
  PageContainer,
  PageLoading,
  Space,
  sideTreeWidth,
  type TableColumnsType,
  Tree,
  Typography,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { RowNameLink } from '../../../shared/row-name-link'
import { withParam, withParams } from '../../../shared/url'
import { useMutationFeedback } from '../../../shared/use-mutation-feedback'
import { fetchAccounts, fetchDepartmentTree } from '../api/org.api'
import { AccountDeleteModal } from '../components/account-delete-modal'
import { AccountPasswordModal } from '../components/account-password-modal'
import { AccountResetPasswordModal } from '../components/account-reset-password-modal'
import { AccountCreateModal } from '../forms/account-create-modal'
import { AccountEditModal } from '../forms/account-edit-modal'
import { useRoleLabels, useRoleOptions } from '../role-options'

/** 账号列表（org 卡 §6：左部门树过滤 + 行内动作启停用/解锁/编辑/改密(@me)/重置/删除；旧 user-browse）。
 * 状态/性别筛选值域来自 meta/account（role 走角色字典，见 role-options.ts）。 */
export default function AccountListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const departmentId = searchParams.get('departmentId')
  const status = searchParams.get('status') ?? ''
  const gender = searchParams.get('gender') ?? ''
  const roleId = searchParams.get('roleId') ?? ''
  const accountMeta = useMetaOptions('account')
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page')) || 1
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AccountView | null>(null)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [resetting, setResetting] = useState<AccountView | null>(null)
  const [deleting, setDeleting] = useState<AccountView | null>(null)

  const departments = useQuery({ queryKey: ['getDepartmentTree'], queryFn: fetchDepartmentTree })
  // /me 缓存形状 = 拆封后的 MeView（与 SessionGate/PrivilegesProvider 同 key 同形，A3-3 统一）
  const me = useQuery({ queryKey: ['getMe'], queryFn: async () => ok(await getMe()).data })
  const accounts = useQuery({
    queryKey: ['listAccounts', departmentId, status, gender, roleId, q, page],
    queryFn: () =>
      fetchAccounts({
        page,
        limit: 20,
        ...(departmentId ? { 'filters[departmentId]': departmentId } : {}),
        ...(status ? { 'filters[status]': status } : {}),
        ...(gender ? { 'filters[gender]': gender } : {}),
        ...(roleId ? { 'filters[roleId]': roleId } : {}),
        ...(q ? { q } : {}),
      }),
  })
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['listAccounts'] })
    void queryClient.invalidateQueries({ queryKey: ['getDepartmentTree'] })
  }
  const feedback = useMutationFeedback()
  const disable = useMutation({
    mutationFn: (id: number) => disableAccount(id),
    onSuccess: invalidate,
    onError: feedback.failed,
  })
  const enable = useMutation({
    mutationFn: (id: number) => enableAccount(id),
    onSuccess: invalidate,
    onError: feedback.failed,
  })
  const unlock = useMutation({
    mutationFn: (id: number) => unlockAccount(id),
    onSuccess: invalidate,
    onError: feedback.failed,
  })

  // @me：改密端点仅限本人（org §5 password 守卫）；删除守卫 ≠ 本人/内置 admin（§4）
  const myId = me.data?.account.id
  const isSelf = (record: AccountView) => record.id === myId
  const isProtected = (record: AccountView) => isSelf(record) || record.account === 'admin'

  // 角色的选项与展示名来自角色表（GET /roles），前端无内置角色清单
  const roleOptions = useRoleOptions()
  const roleLabelsOf = useRoleLabels()

  const columns: TableColumnsType<AccountView> = [
    { title: t('org.account.field.id'), dataIndex: 'id' },
    {
      // 登录名即详情入口（用户要求 2026-09-20：列表点名称进详情，操作列不再重复「详情」）
      title: t('org.account.field.account'),
      dataIndex: 'account',
      render: (account: string, record: AccountView) => (
        <RowNameLink to={`/org/accounts/${record.id}`}>{account}</RowNameLink>
      ),
    },
    { title: t('org.account.field.realName'), dataIndex: 'realName' },
    {
      title: t('org.account.field.roles'),
      key: 'roles',
      render: (_: unknown, record: AccountView) => roleLabelsOf(record.roleIds),
    },
    {
      title: t('org.account.field.status'),
      dataIndex: 'status',
      render: (status: string) => (
        <Typography.Text type={status === 'active' ? 'success' : 'secondary'}>
          {t(`org.account.status.${status}`)}
        </Typography.Text>
      ),
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      render: (_: unknown, record: AccountView) => (
        <Space wrap>
          <Button size="small" onClick={() => setEditing(record)}>
            {t('common.action.edit')}
          </Button>
          {isSelf(record) ? (
            <Button size="small" onClick={() => setPasswordOpen(true)}>
              {t('org.account.action.password')}
            </Button>
          ) : null}
          <Button size="small" onClick={() => setResetting(record)}>
            {t('org.account.action.resetPassword')}
          </Button>
          {record.status === 'active' ? (
            <Button size="small" onClick={() => disable.mutate(record.id)}>
              {t('org.account.action.disable')}
            </Button>
          ) : (
            <Button size="small" onClick={() => enable.mutate(record.id)}>
              {t('org.account.action.enable')}
            </Button>
          )}
          {(record.lockedAt ?? null) !== null ? (
            <Button size="small" onClick={() => unlock.mutate(record.id)}>
              {t('org.account.action.unlock')}
            </Button>
          ) : null}
          {isProtected(record) ? null : (
            <Button size="small" danger onClick={() => setDeleting(record)}>
              {t('common.action.delete')}
            </Button>
          )}
        </Space>
      ),
    },
  ]

  if (accounts.isPending || departments.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  if (accounts.error) {
    const message = errorText(accounts.error, t, 'common.loading')
    return (
      <PageContainer>
        <Typography.Text type="secondary">{message}</Typography.Text>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="zt-split tw:gap-4">
        <Card title={t('org.department.title')} size="small" style={{ width: sideTreeWidth, flexShrink: 0 }}>
          <Tree
            blockNode
            defaultExpandAll
            selectedKeys={departmentId ? [departmentId] : []}
            onSelect={(keys) => {
              const key = keys[0]
              // 部门树是筛选条件之一：只换 departmentId，其余筛选保留（关键词/状态/性别已在 URL）
              setSearchParams(
                withParams(searchParams, {
                  departmentId: typeof key === 'string' && key.startsWith('department-') ? key.slice(11) : undefined,
                  page: undefined,
                }),
              )
            }}
            treeData={(departments.data ?? []).map((node) => departmentTreeNode(node))}
          />
        </Card>
        <div className="zt-split-main tw:gap-4">
          <ListFilterForm
            fields={[
              keywordField(t('org.accounts.search'), t('org.accounts.search')),
              selectField('status', t('common.field.status'), accountMeta.options('status')),
              selectField('gender', t('org.account.field.gender'), accountMeta.options('gender')),
              // 角色筛选的值走 URL（字符串）：选项 value 转字符串，与 filters[roleId] 同形
              selectField(
                'roleId',
                t('org.account.field.roles'),
                roleOptions.map((option) => ({ value: String(option.value), label: option.label })),
              ),
            ]}
          />
          <ListCard
            columns={columns}
            columnSettingKey="org-accounts"
            actions={
              <>
                <Button type="primary" onClick={() => setCreating(true)}>
                  {t('org.account.action.create')}
                </Button>
                <Button onClick={() => navigate('/org/accounts/batch')}>{t('org.account.action.batch')}</Button>
              </>
            }
            rowKey="id"
            dataSource={accounts.data?.items ?? []}
            pagination={{
              current: page,
              pageSize: 20,
              total: accounts.data?.total ?? 0,
              onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
            }}
          />
          <AccountCreateModal open={creating} onClose={() => setCreating(false)} />
          <AccountEditModal account={editing} open={editing !== null} onClose={() => setEditing(null)} />
          <AccountPasswordModal accountId={myId ?? null} open={passwordOpen} onClose={() => setPasswordOpen(false)} />
          <AccountResetPasswordModal account={resetting} open={resetting !== null} onClose={() => setResetting(null)} />
          <AccountDeleteModal account={deleting} open={deleting !== null} onClose={() => setDeleting(null)} />
        </div>
      </div>
    </PageContainer>
  )
}

type TreeInput = { id: number; name: string; children?: { id: number; name: string }[] }
type TreeNode = { key: string; title: string; children: TreeNode[] }

function departmentTreeNode(node: TreeInput): TreeNode {
  return {
    key: `department-${node.id}`,
    title: node.name,
    children: (node.children ?? []).map(departmentTreeNode),
  }
}
