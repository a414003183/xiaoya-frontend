/** @route /org/groups/:groupId @title org.group.detailTitle @perm group-view @hide @activeMenu /admin/roles */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok } from '@zentao/api-client'
import { saveGroupMembers } from '@zentao/api-client/generated'
import {
  Button,
  Card,
  Descriptions,
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
import { type AccountView, fetchGroup, fetchGroupMembers } from '../api/org.api'

/** 权限组详情（org 卡 §6：成员与权限概览，入口跳矩阵页；旧 group-manageview）。 */
export default function GroupDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const groupId = Number(useParams().groupId)
  const group = useQuery({ queryKey: ['getGroup', groupId], queryFn: () => fetchGroup(groupId) })
  const members = useQuery({ queryKey: ['getGroupMembers', groupId], queryFn: () => fetchGroupMembers(groupId) })
  const [newMember, setNewMember] = useState('')

  const saveMembers = useMutation({
    mutationFn: async (ids: number[]) => ok(await saveGroupMembers(groupId, { accountIds: ids })).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['getGroupMembers', groupId] })
      void queryClient.invalidateQueries({ queryKey: ['getGroup', groupId] })
    },
  })

  if (group.isPending || members.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const removeMember = (id: number) => {
    const remaining = (members.data?.items ?? []).map((item) => item.id).filter((id) => id !== 0)
    void saveMembers.mutateAsync(remaining.filter((existing) => existing !== id))
  }

  const columns: TableColumnsType<AccountView> = [
    { title: t('org.account.field.id'), dataIndex: 'id' },
    { title: t('org.account.field.account'), dataIndex: 'account' },
    { title: t('org.account.field.realName'), dataIndex: 'realName' },
    {
      title: t('common.action.manage'),
      key: 'actions',
      render: (_: unknown, record: AccountView) => (
        <Button size="small" danger onClick={() => removeMember(record.id)}>
          {t('org.group.action.removeMember')}
        </Button>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={group.data?.name ?? ''}
        backTo="/admin/roles"
        extra={
          <Button type="primary" onClick={() => navigate(`/org/groups/${groupId}/privileges`)}>
            {t('org.group.action.privileges')}
          </Button>
        }
      />
      <Card>
        <Descriptions
          column={2}
          items={[
            { key: 'description', label: t('org.group.field.description'), children: group.data?.description ?? '-' },
            {
              key: 'memberCount',
              label: t('org.group.field.memberCount'),
              children: String(group.data?.memberCount ?? 0),
            },
            {
              key: 'privilegeCount',
              label: t('org.group.field.privilegeCount'),
              children: String(group.data?.privilegeCount ?? 0),
            },
          ]}
        />
      </Card>
      <Space>
        <Input
          aria-label={t('org.group.addMemberById')}
          placeholder={t('org.group.addMemberById')}
          value={newMember}
          style={{ width: 160 }}
          onChange={(event) => setNewMember(event.target.value)}
        />
        <Button
          onClick={() => {
            const id = Number(newMember)
            if (Number.isFinite(id) && id > 0) {
              const current = (members.data?.items ?? []).map((item) => item.id)
              void saveMembers.mutateAsync([...current, id])
              setNewMember('')
            }
          }}
        >
          {t('org.group.action.addMember')}
        </Button>
      </Space>
      <ListCard
        title={t('org.group.members')}
        columns={columns}
        columnSettingKey="group-members"
        rowKey="id"
        dataSource={members.data?.items ?? []}
        pagination={false}
      />
    </PageContainer>
  )
}
