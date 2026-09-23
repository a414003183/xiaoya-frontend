/** @route /admin/roles @title org.role.title @perm role-view @menu admin @order 4 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  ConfirmAction,
  HasPerm,
  ListCard,
  PageContainer,
  Space,
  type TableColumnsType,
  Tag,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { keywordField, ListFilterForm } from '../../../shared/list-filter'
import { deleteRole, type RoleView } from '../api/org.api'
import { RoleAclModal } from '../components/role-acl-modal'
import { RoleCopyModal } from '../components/role-copy-modal'
import { RoleFormModal } from '../components/role-form-modal'
import { ROLES_QUERY_KEY, useRoles } from '../role-options'

/**
 * 角色（T23 统一实体）：**一张表装全部角色**，每行都是「权限码 + 成员 + 数据权限」的同一套东西。
 *
 * 旧模型分「权限角色」（auth_group）与「岗位角色」（account_role 字典）两类，功能重复、账号上的角色
 * 还有两套表达——T23 起一个角色就是一组权限码 + 一批成员 + 一份数据权限，账号与角色是成员关系，
 * 故本页不再有类型列/类型筛选，行内动作对每一行都一样：
 * 权限（菜单树勾选）/ 成员 / 数据权限 / 编辑 / 复制 / 删除。
 *
 * 内置角色（超管角色 id=1 与迁移来的岗位角色）不可删除（服务端 42203 同码守卫）；删除前提示成员与
 * 权限码会一并清除。角色是配置级小列表（服务端全量返回），故不接分页。
 */
export default function RoleListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<RoleView | null>(null)
  const [copying, setCopying] = useState<RoleView | null>(null)
  const [aclOf, setAclOf] = useState<RoleView | null>(null)

  const keyword = (searchParams.get('q') ?? '').toLowerCase()
  const roles = useRoles()

  const remove = useMutation({
    mutationFn: (roleId: number) => deleteRole(roleId),
    onSuccess: () => {
      message.success(t('org.role.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ['listAccounts'] })
    },
    // 守卫失败（内置角色 42203）按错误码出文案：后端 message 只作开发兜底
    onError: (error) => message.error(errorText(error, t)),
  })

  const rows = (roles.data?.items ?? []).filter((role) => {
    if (keyword === '') {
      return true
    }
    return (
      role.name.toLowerCase().includes(keyword) ||
      (role.code ?? '').toLowerCase().includes(keyword) ||
      (role.description ?? '').toLowerCase().includes(keyword)
    )
  })

  const columns: TableColumnsType<RoleView> = [
    {
      title: t('org.role.field.name'),
      dataIndex: 'name',
      render: (name: string, record: RoleView) => (
        <Space size={6}>
          <Typography.Text>{name}</Typography.Text>
          {record.builtin ? <Tag color="blue">{t('org.role.field.builtin')}</Tag> : null}
        </Space>
      ),
    },
    {
      title: t('org.role.field.code'),
      dataIndex: 'code',
      width: 140,
      render: (code: string | null) => (code === null ? '' : <Typography.Text code>{code}</Typography.Text>),
    },
    { title: t('org.role.field.description'), dataIndex: 'description' },
    { title: t('org.role.field.memberCount'), dataIndex: 'memberCount', width: 100 },
    {
      title: t('org.role.field.privilegeCount'),
      dataIndex: 'privilegeCount',
      width: 110,
      render: (count: number, record: RoleView) => (
        <Button type="link" size="small" onClick={() => navigate(`/admin/roles/${record.id}/privileges`)}>
          {count}
        </Button>
      ),
    },
    { title: t('org.role.field.sort'), dataIndex: 'sort', width: 80 },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 320,
      render: (_: unknown, record: RoleView) => (
        <Space wrap size={4}>
          {/* 入口按**目标动作**的权限码显隐：权限页 role-priv-edit、数据权限与编辑 role-edit、复制 role-copy；
              成员页可读（写动作在页内再按 role-member-edit 拦） */}
          <HasPerm perm="role-priv-edit">
            <Button type="link" size="small" onClick={() => navigate(`/admin/roles/${record.id}/privileges`)}>
              {t('org.role.action.privileges')}
            </Button>
          </HasPerm>
          <Button type="link" size="small" onClick={() => navigate(`/admin/roles/${record.id}/members`)}>
            {t('org.role.action.members')}
          </Button>
          <HasPerm perm="role-edit">
            <Button type="link" size="small" onClick={() => setAclOf(record)}>
              {t('org.role.action.acl')}
            </Button>
          </HasPerm>
          <HasPerm perm="role-edit">
            <Button type="link" size="small" onClick={() => setEditing(record)}>
              {t('common.action.edit')}
            </Button>
          </HasPerm>
          <HasPerm perm="role-copy">
            <Button type="link" size="small" onClick={() => setCopying(record)}>
              {t('org.role.action.copy')}
            </Button>
          </HasPerm>
          {record.builtin ? null : (
            <HasPerm perm="role-delete">
              <ConfirmAction
                title={t('org.role.deleteTitle', { name: record.name })}
                description={t('org.role.deleteHint')}
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

  return (
    <PageContainer>
      <ListFilterForm fields={[keywordField(t('org.role.field.name'), t('common.action.search'))]} />
      <ListCard
        columns={columns}
        columnSettingKey="org-roles"
        actions={
          <HasPerm perm="role-create">
            <Button type="primary" onClick={() => setCreating(true)}>
              {t('org.role.action.create')}
            </Button>
          </HasPerm>
        }
        rowKey="id"
        loading={roles.isPending}
        dataSource={rows}
        pagination={false}
      />
      <RoleFormModal
        role={editing}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
      />
      <RoleCopyModal role={copying} open={copying !== null} onClose={() => setCopying(null)} />
      <RoleAclModal role={aclOf} open={aclOf !== null} onClose={() => setAclOf(null)} />
    </PageContainer>
  )
}
