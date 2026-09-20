/** @route /admin/roles @title org.role.title @perm role-view @menu admin @order 4 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  ConfirmAction,
  Flex,
  HasPerm,
  hasPerm,
  ListCard,
  PageContainer,
  Space,
  spacing,
  type TableColumnsType,
  Tabs,
  Tag,
  Typography,
  useMessage,
  usePrivileges,
} from '@zentao/design-system'
import { SUPPORTED_LANGUAGES } from '@zentao/i18n'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { keywordField, ListFilterForm } from '../../../shared/list-filter'
import { withParams } from '../../../shared/url'
import { deleteRole, type RoleView } from '../api/org.api'
import { GroupListTab } from '../components/group-list-tab'
import { RoleFormModal } from '../components/role-form-modal'
import { ROLES_QUERY_KEY, roleLabel, useRoles } from '../role-options'

/**
 * 角色列表（org 卡 §6；2026-09-20 把原 /org/groups「角色管理」整页并入本页，两类角色同页两页签）：
 * - 「角色」页签 = 权限角色（`auth_group`：权限码矩阵 + 成员集 + 数据可见集），原 group-list-page 内容原样迁入
 *   `components/group-list-tab`，行内动作仍按 group-view/group-priv-edit/group-edit/group-copy/group-delete 显隐；
 *   此页签本身对无 `group-view` 者不可见（数据也不拉取）；
 * - 「岗位角色」页签 = 岗位角色字典（`account_role`，§3.4；旧禅道 后台→自定义→用户→角色列表），
 *   即账号资料上 role 列的选项集。
 * 页签在 URL（`?tab=roles|dict`，缺省 roles），刷新/深链保持所在页签。
 * 路由权限码 id 仍是 `role-view`（岗位角色字典读），故仅持 `group-view` 而无 `role-view` 的账号进不来本页——
 * 待裁决项，见 tmp/ws-c-doc-notes.md。
 */
export default function RoleListPage() {
  const message = useMessage()
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<RoleView | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const privileges = usePrivileges()
  const q = (searchParams.get('q') ?? '').toLowerCase()

  const roles = useRoles()
  const remove = useMutation({
    mutationFn: (code: string) => deleteRole(code),
    onSuccess: () => {
      message.success(t('org.role.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: [ROLES_QUERY_KEY] })
    },
    // 守卫失败（内置角色/仍被账号使用 → 42203）按错误码出文案：后端 message 只作开发兜底
    onError: (error) => message.error(errorText(error, t)),
  })

  const otherLanguages = SUPPORTED_LANGUAGES.filter((language) => language !== i18n.language)
  const items = (roles.data?.items ?? []).filter(
    (role) =>
      q === '' ||
      role.code.includes(q) ||
      Object.values(role.labels ?? {}).some((label) => label.toLowerCase().includes(q)),
  )

  const columns: TableColumnsType<RoleView> = [
    { title: t('org.role.field.code'), dataIndex: 'code', width: 140 },
    {
      title: t('org.role.field.name'),
      key: 'name',
      render: (_: unknown, record: RoleView) => (
        <Flex vertical>
          <Typography.Text>{roleLabel(record, i18n.language)}</Typography.Text>
          {/* 副行：其余语言的名字（字典不枚举语言，有几个显示几个） */}
          {otherLanguages.map((language) =>
            record.labels[language] ? (
              <Typography.Text key={language} type="secondary">
                {`${language}: ${record.labels[language]}`}
              </Typography.Text>
            ) : null,
          )}
        </Flex>
      ),
    },
    { title: t('org.role.field.sort'), dataIndex: 'sort', width: 90 },
    {
      title: t('org.role.field.builtin'),
      dataIndex: 'builtin',
      width: 100,
      render: (builtin: boolean) => (builtin ? <Tag color="blue">{t('org.role.field.builtin')}</Tag> : null),
    },
    { title: t('org.role.field.accountCount'), dataIndex: 'accountCount', width: 120 },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 160,
      render: (_: unknown, record: RoleView) => (
        <Space wrap size={4}>
          <HasPerm perm="role-manage">
            <Button type="link" size="small" onClick={() => setEditing(record)}>
              {t('common.action.edit')}
            </Button>
          </HasPerm>
          <HasPerm perm="role-manage">
            {/* 守卫提示常驻（内置角色/仍被账号使用都删不掉），真守卫在服务端（42203 → 错误提示） */}
            <ConfirmAction
              title={t('org.role.deleteTitle', { name: roleLabel(record, i18n.language) })}
              description={
                <>
                  <div>{t('org.role.guard.builtin')}</div>
                  <div>{t('org.role.guard.inUse')}</div>
                </>
              }
              onConfirm={() => remove.mutate(record.code)}
            >
              <Button type="link" size="small" danger>
                {t('common.action.delete')}
              </Button>
            </ConfirmAction>
          </HasPerm>
        </Space>
      ),
    },
  ]

  const closeForm = () => {
    setCreating(false)
    setEditing(null)
  }

  const dictTab = {
    key: 'dict',
    label: t('org.role.tab.dict'),
    children: (
      <Flex vertical gap={spacing.lg}>
        <ListFilterForm fields={[keywordField(t('org.role.field.name'), t('common.action.search'))]} />
        <ListCard
          columns={columns}
          columnSettingKey="org-roles"
          actions={
            <HasPerm perm="role-manage">
              <Button type="primary" onClick={() => setCreating(true)}>
                {t('org.role.action.create')}
              </Button>
            </HasPerm>
          }
          rowKey="code"
          loading={roles.isPending}
          dataSource={items}
          pagination={false}
        />
        <RoleFormModal role={editing} open={creating || editing !== null} onClose={closeForm} />
      </Flex>
    ),
  }
  // 页签按权限码装配：权限角色页签要 group-view（无码即不挂载，组列表连请求都不发）
  const tabs = [
    ...(hasPerm(privileges, 'group-view')
      ? [{ key: 'roles', label: t('org.role.tab.roles'), children: <GroupListTab /> }]
      : []),
    dictTab,
  ]
  const requested = searchParams.get('tab') ?? ''
  // URL 写错或无权的页签一律回落：有「角色」页签即落它（缺省页签），否则落字典页签
  const activeKey = tabs.find((tab) => tab.key === requested)?.key ?? tabs[0]?.key ?? dictTab.key

  return (
    <PageContainer>
      <Tabs
        activeKey={activeKey}
        // 切页签一并清掉 q/page：两个列表同名参数的语义不同（服务端组筛选 vs 客户端字典过滤），不互相串
        onChange={(key) => setSearchParams(withParams(searchParams, { tab: key, q: undefined, page: undefined }))}
        items={tabs}
      />
    </PageContainer>
  )
}
