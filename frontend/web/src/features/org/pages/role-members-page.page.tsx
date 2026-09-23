/** @route /admin/roles/:roleId/members @title org.role.membersTitle @perm role-view @hide @activeMenu /admin/roles */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  Descriptions,
  HasPerm,
  Input,
  ListCard,
  PageContainer,
  PageHeader,
  PageLoading,
  Space,
  type TableColumnsType,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { useMutationFeedback } from '../../../shared/use-mutation-feedback'
import { type AccountView, fetchRole, fetchRoleMembers, saveRoleMembers } from '../api/org.api'
import { ROLES_QUERY_KEY, useRoleLabels } from '../role-options'

/** 角色成员（T23）：概览 + 成员表，入口跳权限树；成员读写要 role-member-edit，页本身 role-view 可读。 */
export default function RoleMembersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const roleId = Number(useParams().roleId)
  const role = useQuery({ queryKey: ['getRole', roleId], queryFn: () => fetchRole(roleId) })
  const members = useQuery({ queryKey: ['getRoleMembers', roleId], queryFn: () => fetchRoleMembers(roleId) })
  const [newMember, setNewMember] = useState('')
  const roleLabels = useRoleLabels()
  const feedback = useMutationFeedback()

  const saveMembers = useMutation({
    mutationFn: (ids: number[]) => saveRoleMembers(roleId, ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['getRoleMembers', roleId] })
      void queryClient.invalidateQueries({ queryKey: ['getRole', roleId] })
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY })
    },
    onError: feedback.failed,
  })

  if (role.isPending || members.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const removeMember = (id: number) => {
    const remaining = (members.data?.items ?? []).map((item) => item.id).filter((existing) => existing !== id)
    saveMembers.mutate(remaining)
  }

  const columns: TableColumnsType<AccountView> = [
    { title: t('org.account.field.id'), dataIndex: 'id' },
    { title: t('org.account.field.account'), dataIndex: 'account' },
    { title: t('org.account.field.realName'), dataIndex: 'realName' },
    {
      title: t('org.account.field.roles'),
      key: 'roles',
      render: (_: unknown, record: AccountView) => roleLabels(record.roleIds),
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      render: (_: unknown, record: AccountView) => (
        <HasPerm perm="role-member-edit">
          <Button size="small" danger onClick={() => removeMember(record.id)}>
            {t('org.role.action.removeMember')}
          </Button>
        </HasPerm>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={role.data?.name ?? ''}
        backTo="/admin/roles"
        extra={
          <HasPerm perm="role-priv-edit">
            <Button type="primary" onClick={() => navigate(`/admin/roles/${roleId}/privileges`)}>
              {t('org.role.action.privileges')}
            </Button>
          </HasPerm>
        }
      />
      <Card>
        <Descriptions
          column={2}
          items={[
            { key: 'description', label: t('org.role.field.description'), children: role.data?.description ?? '-' },
            {
              key: 'memberCount',
              label: t('org.role.field.memberCount'),
              children: String(role.data?.memberCount ?? 0),
            },
            {
              key: 'privilegeCount',
              label: t('org.role.field.privilegeCount'),
              children: String(role.data?.privilegeCount ?? 0),
            },
          ]}
        />
      </Card>
      <HasPerm perm="role-member-edit">
        <Space>
          <Input
            aria-label={t('org.role.addMemberById')}
            placeholder={t('org.role.addMemberById')}
            value={newMember}
            style={{ width: 160 }}
            onChange={(event) => setNewMember(event.target.value)}
          />
          <Button
            onClick={() => {
              const id = Number(newMember)
              if (Number.isFinite(id) && id > 0) {
                const current = (members.data?.items ?? []).map((item) => item.id)
                saveMembers.mutate([...current, id])
                setNewMember('')
              }
            }}
          >
            {t('org.role.action.addMember')}
          </Button>
        </Space>
      </HasPerm>
      <ListCard
        title={t('org.role.members')}
        columns={columns}
        columnSettingKey="role-members"
        rowKey="id"
        dataSource={members.data?.items ?? []}
        pagination={false}
      />
    </PageContainer>
  )
}
