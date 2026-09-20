/** @route /org/groups/:groupId/privileges @title org.group.matrixTitle @perm group-priv-edit @hide @activeMenu /admin/roles */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok } from '@zentao/api-client'
import { getDict, saveGroupPrivileges } from '@zentao/api-client/generated'
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Flex,
  PageContainer,
  PageHeader,
  PageLoading,
  Space,
  Typography,
} from '@zentao/design-system'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { fetchGroupPrivileges } from '../api/org.api'

/** 字典条目（platform §3.9）：i18n 是后端下发的文案键 `priv.<code>`，前端语言包是它的内建真源。 */
type CatalogItem = { code: string; domain: string; i18n: string }

/**
 * 角色权限矩阵（org 卡 §6：按资源分组，数据源 GET /dicts/privileges + GET privileges，整体保存；旧 managepriv）。
 * 权限名走字典下发的 i18n 键（B-ORG-07 的「裸码终态」已按用户验收反馈改判），域标题同源，
 * 两个语言包各 182 条；将来新增权限码只需在后端注册时给出 `priv.<code>` 键。
 * 每域带「全选」（半选态由 antd indeterminate 表达），顶部实时显示已选数量。
 */
export default function GroupPrivMatrixPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const groupId = Number(useParams().groupId)
  const current = useQuery({ queryKey: ['getGroupPrivileges', groupId], queryFn: () => fetchGroupPrivileges(groupId) })
  const catalog = useQuery({
    queryKey: ['getDict', 'privileges'],
    queryFn: async () => ok(await getDict('privileges')).data.items as CatalogItem[],
  })
  const [selected, setSelected] = useState<Set<string> | null>(null)

  const effective: Set<string> = useMemo(() => selected ?? new Set(current.data?.codes ?? []), [selected, current.data])

  const save = useMutation({
    mutationFn: async (codes: string[]) => ok(await saveGroupPrivileges(groupId, { codes })).data,
    onSuccess: () => {
      setSelected(null)
      void queryClient.invalidateQueries({ queryKey: ['getGroupPrivileges', groupId] })
      void queryClient.invalidateQueries({ queryKey: ['getGroup', groupId] })
      void queryClient.invalidateQueries({ queryKey: ['getMe'] })
    },
  })

  if (current.isPending || catalog.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const byDomain = new Map<string, CatalogItem[]>()
  for (const item of catalog.data ?? []) {
    byDomain.set(item.domain, [...(byDomain.get(item.domain) ?? []), item])
  }

  const toggle = (code: string) => {
    const next = new Set(effective)
    if (next.has(code)) {
      next.delete(code)
    } else {
      next.add(code)
    }
    setSelected(next)
  }

  const toggleDomain = (codes: string[], checked: boolean) => {
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

  const total = catalog.data?.length ?? 0

  return (
    <PageContainer>
      <PageHeader title={t('org.group.matrixTitle')} backTo={`/org/groups/${groupId}`} />
      <Card>
        <Flex vertical gap={16}>
          {[...byDomain.entries()].map(([domain, items]) => {
            const codes = items.map((item) => item.code)
            const checked = codes.filter((code) => effective.has(code)).length
            return (
              <div key={domain}>
                <Flex align="center" justify="space-between" gap={12} wrap>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    {t(`org.group.matrixDomain.${domain}`, { defaultValue: domain })}
                  </Typography.Title>
                  <Space size={8}>
                    <Typography.Text type="secondary">{`${checked}/${codes.length}`}</Typography.Text>
                    <Checkbox
                      indeterminate={checked > 0 && checked < codes.length}
                      checked={checked === codes.length}
                      onChange={(event) => toggleDomain(codes, event.target.checked)}
                    >
                      {t('common.action.selectAll')}
                    </Checkbox>
                  </Space>
                </Flex>
                <Flex wrap gap={12} style={{ marginTop: 8 }}>
                  {items.map((item) => (
                    <Checkbox
                      key={item.code}
                      aria-label={item.code}
                      checked={effective.has(item.code)}
                      onChange={() => toggle(item.code)}
                    >
                      {t(item.i18n, { defaultValue: item.code })}
                    </Checkbox>
                  ))}
                </Flex>
                <Divider style={{ marginBlock: 12 }} />
              </div>
            )
          })}
          <Flex align="center" justify="space-between" gap={12} wrap>
            <Space>
              <Button
                type="primary"
                disabled={selected === null}
                loading={save.isPending}
                onClick={() => void save.mutateAsync([...effective])}
              >
                {t('org.group.action.saveMatrix')}
              </Button>
              <Button onClick={() => setSelected(null)}>{t('common.action.cancel')}</Button>
            </Space>
            <Typography.Text type="secondary">
              {t('org.group.matrixSelected', { count: effective.size, total })}
            </Typography.Text>
          </Flex>
        </Flex>
      </Card>
    </PageContainer>
  )
}
