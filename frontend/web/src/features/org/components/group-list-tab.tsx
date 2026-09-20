import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteGroup } from '@zentao/api-client/generated'
import type { GroupView } from '@zentao/api-client/generated/model/groupView'
import {
  Button,
  ConfirmAction,
  Flex,
  HasPerm,
  ListCard,
  Space,
  spacing,
  type TableColumnsType,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE } from '../../../shared/list-dsl'
import { keywordField, ListFilterForm } from '../../../shared/list-filter'
import { withParams } from '../../../shared/url'
import { fetchGroups } from '../api/org.api'
import { GroupAclModal } from './group-acl-modal'
import { GroupCopyModal } from './group-copy-modal'
import { GroupFormModal } from './group-form-modal'

/**
 * 「角色」页签（原 /org/groups 列表页，2026-09-20 合并进 /admin/roles；org 卡 §6）。
 * 一个角色 = 一组权限码 + 一批成员 + 一份数据可见集，行内动作直达权限矩阵/成员/数据权限/复制/删除。
 * 筛选与列表两卡结构（筛选卡右下角查询/重置 + 列表卡功能按钮/表格/列设置），不含 PageContainer——
 * 页面根容器归宿主页（role-list-page），本组件只画页签内容。
 */
export function GroupListTab() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<GroupView | null>(null)
  const [copying, setCopying] = useState<GroupView | null>(null)
  const [aclOf, setAclOf] = useState<GroupView | null>(null)

  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)
  const groups = useQuery({
    queryKey: ['listGroups', { q, page }],
    queryFn: () => fetchGroups({ page, limit: DEFAULT_PAGE_SIZE, q }),
  })
  const remove = useMutation({
    mutationFn: (groupId: number) => deleteGroup(groupId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['listGroups'] })
    },
  })

  const columns: TableColumnsType<GroupView> = [
    { title: t('org.group.field.id'), dataIndex: 'id', width: 70 },
    { title: t('org.group.field.name'), dataIndex: 'name' },
    { title: t('org.group.field.description'), dataIndex: 'description' },
    { title: t('org.group.field.memberCount'), dataIndex: 'memberCount', width: 90 },
    { title: t('org.group.field.privilegeCount'), dataIndex: 'privilegeCount', width: 90 },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 340,
      render: (_: unknown, record: GroupView) => (
        <Space wrap size={4}>
          {/* 入口按**目标动作**的权限码显隐：矩阵页 group-priv-edit、数据权限 PATCH /groups 要 group-edit；
              成员页是 group-view 可读（写动作在页内再按 group-member-edit 拦） */}
          <HasPerm perm="group-priv-edit">
            <Button type="link" size="small" onClick={() => navigate(`/org/groups/${record.id}/privileges`)}>
              {t('org.group.action.privileges')}
            </Button>
          </HasPerm>
          <Button type="link" size="small" onClick={() => navigate(`/org/groups/${record.id}`)}>
            {t('org.group.action.members')}
          </Button>
          <HasPerm perm="group-edit">
            <Button type="link" size="small" onClick={() => setAclOf(record)}>
              {t('org.group.action.acl')}
            </Button>
          </HasPerm>
          <HasPerm perm="group-edit">
            <Button type="link" size="small" onClick={() => setEditing(record)}>
              {t('common.action.edit')}
            </Button>
          </HasPerm>
          <HasPerm perm="group-copy">
            <Button type="link" size="small" onClick={() => setCopying(record)}>
              {t('org.group.action.copy')}
            </Button>
          </HasPerm>
          {/* 内置 admin 角色（id=1）不可删除（服务端同码守卫 42203） */}
          {record.id !== 1 && (
            <HasPerm perm="group-delete">
              <ConfirmAction
                title={t('org.group.deleteTitle')}
                description={t('org.group.deleteHint', { name: record.name })}
                onConfirm={() => remove.mutate(record.id)}
              >
                <Button type="link" size="small" danger>
                  {t('common.action.delete')}
                </Button>
              </ConfirmAction>
            </HasPerm>
          )}
        </Space>
      ),
    },
  ]

  const closeForm = () => {
    setCreating(false)
    setEditing(null)
  }

  return (
    <Flex vertical gap={spacing.lg}>
      <ListFilterForm fields={[keywordField(t('org.group.field.name'), t('common.action.search'))]} />
      <ListCard
        columns={columns}
        columnSettingKey="org-groups"
        actions={
          <HasPerm perm="group-create">
            <Button type="primary" onClick={() => setCreating(true)}>
              {t('org.group.action.create')}
            </Button>
          </HasPerm>
        }
        rowKey="id"
        loading={groups.isPending}
        dataSource={groups.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: DEFAULT_PAGE_SIZE,
          total: groups.data?.total ?? 0,
          showSizeChanger: false,
          onChange: (next) => setSearchParams(withParams(searchParams, { page: String(next) })),
        }}
      />
      <GroupFormModal group={editing} open={creating || editing !== null} onClose={closeForm} />
      <GroupCopyModal group={copying} open={copying !== null} onClose={() => setCopying(null)} />
      <GroupAclModal group={aclOf} open={aclOf !== null} onClose={() => setAclOf(null)} />
    </Flex>
  )
}
