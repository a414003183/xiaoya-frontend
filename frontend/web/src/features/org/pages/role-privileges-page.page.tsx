/** @route /admin/roles/:roleId/privileges @title org.role.privilegeTitle @perm role-priv-edit @hide @activeMenu /admin/roles */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok } from '@zentao/api-client'
import { getDict } from '@zentao/api-client/generated'
import type { MenuNode } from '@zentao/api-client/generated/model/menuNode'
import { Button, Card, Flex, PageContainer, PageHeader, PageLoading, Space, Typography } from '@zentao/design-system'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { useMutationFeedback } from '../../../shared/use-mutation-feedback'
import { fetchGrantableMenus, fetchRolePrivileges, saveRolePrivileges } from '../api/org.api'
import { OrphanCodeGroups, PrivilegeTreePicker, treeCodes } from '../components/privilege-tree-picker'
import { ROLES_QUERY_KEY } from '../role-options'

/** 字典条目（platform §3.9）：i18n 是后端下发的文案键 `priv.<code>`，前端语言包是它的内建真源。 */
type CatalogItem = { code: string; domain: string; i18n: string }

/**
 * 角色权限（T22 改版 / T23 挂在角色下）：**按菜单树勾选**——模块 → 目录 → 菜单 → 按钮，粒度到按钮（操作列）。
 *
 * 三块数据：菜单树（`GET /menus/grantable`，与菜单管理同一棵树）+ 该角色已授权的权限码
 * （`GET /roles/{id}/privileges`）+ 权限编目（`GET /dicts/privileges`，给「未编入菜单」的权限码兜底）。
 *
 * 「其它权限码」是过渡带：权限码由代码注册（每个端点一个），菜单节点由管理员编排，两者不会自动对齐；
 * 在菜单管理里给页面挂上按钮节点后，该权限码就从兜底区搬进树里。保存是整体替换（PUT），
 * 与旧的权限矩阵共用同一份存储（role_priv），鉴权链路不变。
 */
export default function RolePrivilegesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const roleId = Number(useParams().roleId)
  const current = useQuery({ queryKey: ['getRolePrivileges', roleId], queryFn: () => fetchRolePrivileges(roleId) })
  const menus = useQuery({ queryKey: ['listGrantableMenus'], queryFn: fetchGrantableMenus })
  const catalog = useQuery({
    queryKey: ['getDict', 'privileges'],
    queryFn: async () => ok(await getDict('privileges')).data.items as CatalogItem[],
  })
  const [selected, setSelected] = useState<Set<string> | null>(null)

  const effective: Set<string> = useMemo(() => selected ?? new Set(current.data?.codes ?? []), [selected, current.data])

  const feedback = useMutationFeedback()
  const save = useMutation({
    mutationFn: (codes: string[]) => saveRolePrivileges(roleId, codes),
    onSuccess: () => {
      setSelected(null)
      void queryClient.invalidateQueries({ queryKey: ['getRolePrivileges', roleId] })
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ['getMe'] })
    },
    onError: feedback.failed,
  })

  /** 树里出现过的权限码：从编目里减掉它们，剩下的就是「未编入菜单」的兜底区。 */
  const orphanCodes = useMemo(() => {
    const inTree = treeCodes(menus.data?.items ?? [])
    return (catalog.data ?? []).filter((item) => !inTree.has(item.code))
  }, [menus.data, catalog.data])

  /** 勾选/取消一组权限码（树里的父子联动与兜底区的单码勾选共用这条路径）。 */
  const toggle = (codes: string[], checked: boolean): void => {
    const next = new Set(effective)
    for (const code of codes) {
      if (checked) {
        next.add(code)
      } else {
        next.delete(code)
      }
    }
    setSelected(next)
  }

  if (current.isPending || menus.isPending || catalog.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const total = catalog.data?.length ?? 0

  return (
    <PageContainer>
      <PageHeader title={t('org.role.privilegeTitle')} backTo="/admin/roles" />
      <Flex vertical gap={16}>
        <PrivilegeTreePicker
          tree={(menus.data?.items ?? []) as MenuNode[]}
          selected={effective}
          onToggle={toggle}
          onToggleAll={toggle}
        />
        {orphanCodes.length === 0 ? null : (
          <OrphanCodeGroups
            items={orphanCodes.map((item) => ({ code: item.code, domain: item.domain, i18n: item.i18n }))}
            selected={effective}
            onToggle={toggle}
          />
        )}
        <Card>
          <Flex align="center" justify="space-between" gap={12} wrap>
            <Space>
              <Button
                type="primary"
                disabled={selected === null}
                loading={save.isPending}
                onClick={() => save.mutate([...effective])}
              >
                {t('org.role.action.savePrivileges')}
              </Button>
              <Button onClick={() => setSelected(null)}>{t('common.action.cancel')}</Button>
            </Space>
            <Typography.Text type="secondary">
              {t('org.role.privilegeSelected', { count: effective.size, total })}
            </Typography.Text>
          </Flex>
        </Card>
      </Flex>
    </PageContainer>
  )
}
