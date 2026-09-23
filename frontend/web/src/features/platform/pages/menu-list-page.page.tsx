/** @route /admin/menus @title platform.menu.title @perm menu-manage @menu admin/system @order 4 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { MenuNode } from '@zentao/api-client/generated/model/menuNode'
import {
  Button,
  ConfirmAction,
  Flex,
  ListCard,
  MenuIcon,
  PageContainer,
  Space,
  StatusTag,
  type TableColumnsType,
  Tag,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { keywordField, ListFilterForm } from '../../../shared/list-filter'
import { deleteMenuAction, fetchMenuTree, MENU_ROUTES_KEY, MENU_TREE_KEY, MY_MENUS_KEY } from '../api/platform.api'
import { MenuFormModal, type MenuFormTarget } from '../components/menu-form-modal'

/**
 * 表格行：**叶子不带 children**（antd 树表按 children 是否存在决定画不画展开箭头——空数组也是真值，
 * 留着会给没有下级的行画一个点了没反应的箭头）。
 */
type MenuRow = Omit<MenuNode, 'children'> & { children?: MenuRow[] }

/**
 * 菜单管理（T19 P2-1 / T21 / T03 纯 DB 化）：一棵可维护的菜单树——`menu` 表就是菜单，没有「内置/覆盖」之分。
 *
 * 三类节点：目录（一级模块 / 组内目录）、菜单（指向页面，key 是它的 path）、按钮（只带权限码，
 * 给角色授权按按钮级勾选用）。写路径：行「编辑」→ PATCH 按 nodeKey 改那一行；「新增」→ 建新节点。
 * 按钮是代码派生的（页面 HasPerm 扫描 + 权限编目按域归属），名字走语言包 `priv.<code>`，
 * 故本页不给按钮编辑/删除入口——它的增删随代码走。
 *
 * 树的展开态：**首次进入是收起的**（菜单是维护面，一次全展开反而看不出层级），左上的展开/收起按钮一键切换；
 * 叶子节点没有展开按钮（没有下一级，留着是噪音）。
 */
export default function MenuListPage() {
  const { t } = useTranslation()
  const message = useMessage()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [target, setTarget] = useState<MenuFormTarget | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const keyword = (searchParams.get('q') ?? '').toLowerCase()

  const tree = useQuery({ queryKey: MENU_TREE_KEY, queryFn: fetchMenuTree })
  const remove = useMutation({
    mutationFn: (nodeKey: string) => deleteMenuAction(nodeKey),
    onSuccess: () => {
      message.success(t('platform.menu.message.deleted'))
      invalidate()
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  /**
   * 改完菜单要一并失效两个下游：侧栏源（MY_MENUS_KEY，同一份合并结果的另一个出口）
   * 与**动态路由表**（MENU_ROUTES_KEY）——路由表是 `staleTime: Infinity`，除主动失效没有别的重取路径，
   * 漏了它就出现「侧栏按新路径跳、路由表还是旧路径」= 404 白屏（FE-01）。
   * 顺带把保存节点的上级展开——新建的节点落在一棵收起的树里，等于「保存了但看不见」。
   */
  function invalidate(node?: MenuNode): void {
    if (node !== undefined && node.parentKey !== null && node.parentKey !== undefined) {
      setExpandedKeys((keys) => (keys.includes(node.parentKey as string) ? keys : [...keys, node.parentKey as string]))
    }
    void queryClient.invalidateQueries({ queryKey: MENU_TREE_KEY })
    void queryClient.invalidateQueries({ queryKey: MY_MENUS_KEY })
    void queryClient.invalidateQueries({ queryKey: MENU_ROUTES_KEY })
  }

  /** 关键词过滤：命中项连同其祖先一起留下（树按层展开，去掉祖先等于看不见命中项）。 */
  const items = useMemo(() => {
    const all = (tree.data?.items ?? []).map(toRow)
    if (keyword === '') {
      return all
    }
    // 命中判定必须先本地化：树里的 title 是 i18n 键（内置节点），拿键去比中文关键词永远不中
    const matches = (node: MenuRow): boolean =>
      t(node.title).toLowerCase().includes(keyword) ||
      (node.path ?? '').toLowerCase().includes(keyword) ||
      (node.perm ?? '').toLowerCase().includes(keyword)
    return all.map((group) => prune(group, matches)).filter((group): group is MenuRow => group !== null)
  }, [tree.data, keyword, t])

  const containers = useMemo(() => containerKeys(items), [items])
  const allExpanded = containers.length > 0 && containers.every((key) => expandedKeys.includes(key))

  const columns: TableColumnsType<MenuRow> = [
    {
      title: t('platform.menu.field.title'),
      key: 'title',
      render: (_: unknown, record: MenuRow) => (
        <Space size={6}>
          <MenuIcon name={record.icon} />
          {/* title 是 i18n 键或管理员填的字面文案：t() 命中就本地化，缺键原样显示 */}
          <Typography.Text>{t(record.title)}</Typography.Text>
          {record.hidden ? <Tag color="orange">{t('platform.menu.hidden')}</Tag> : null}
        </Space>
      ),
    },
    {
      title: t('platform.menu.field.kind'),
      dataIndex: 'kind',
      width: 90,
      render: (kind: string) => (
        <Tag color={kind === 'button' ? 'gold' : kind === 'item' ? 'geekblue' : 'default'}>
          {t(`platform.menu.kind.${kind}`)}
        </Tag>
      ),
    },
    {
      title: t('platform.menu.field.path'),
      dataIndex: 'path',
      render: (path: string | null | undefined) =>
        path === null || path === undefined ? (
          <Typography.Text type="secondary">{t('platform.menu.path.empty')}</Typography.Text>
        ) : (
          <Typography.Text code>{path}</Typography.Text>
        ),
    },
    {
      title: t('platform.menu.field.perm'),
      dataIndex: 'perm',
      width: 160,
      render: (perm: string | null | undefined) =>
        perm === null || perm === undefined ? '' : <Typography.Text code>{perm}</Typography.Text>,
    },
    { title: t('platform.menu.field.orderNo'), dataIndex: 'orderNo', width: 70 },
    {
      title: t('common.field.status'),
      dataIndex: 'status',
      width: 90,
      render: (status: string) => (
        <StatusTag tone={status === 'active' ? 'active' : 'error'}>{t(`platform.menu.status.${status}`)}</StatusTag>
      ),
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 190,
      render: (_: unknown, record: MenuRow) => (
        <Space wrap size={4}>
          {/* 新增下级：组下可建目录/菜单、分区下可建菜单、菜单下可建按钮（越级由后端校验挡回） */}
          {record.kind === 'button' ? null : (
            <Button type="link" size="small" onClick={() => setTarget({ mode: 'create', parent: record })}>
              {t('platform.menu.action.createChild')}
            </Button>
          )}
          {/* 按钮是代码派生的（名字走语言包 priv.<code>），没有可维护的行：本页不给它编辑/删除 */}
          {record.kind === 'button' ? null : (
            <Button type="link" size="small" onClick={() => setTarget({ mode: 'edit', node: record })}>
              {t('common.action.edit')}
            </Button>
          )}
          {record.kind === 'button' ? null : (
            <ConfirmAction
              title={t('platform.menu.deleteTitle')}
              description={
                record.children !== undefined
                  ? t('platform.menu.deleteHint.subtree')
                  : t('platform.menu.deleteHint.new')
              }
              onConfirm={() => remove.mutate(record.key)}
            >
              <Button type="link" size="small" danger>
                {t('common.action.delete')}
              </Button>
            </ConfirmAction>
          )}
        </Space>
      ),
    },
  ]

  return (
    <PageContainer>
      <ListFilterForm fields={[keywordField(t('platform.menu.searchLabel'), t('common.action.search'))]} />
      <ListCard
        columns={columns}
        columnSettingKey="platform-menus"
        actions={
          <Space wrap>
            <Button type="primary" onClick={() => setTarget({ mode: 'create', parent: null })}>
              {t('platform.menu.action.create')}
            </Button>
            <Button onClick={() => setExpandedKeys(allExpanded ? [] : containers)}>
              {allExpanded ? t('platform.menu.action.collapseAll') : t('platform.menu.action.expandAll')}
            </Button>
          </Space>
        }
        rowKey="key"
        loading={tree.isPending}
        dataSource={items}
        // 首次进入是收起的；叶子没有 children 键，因此不会画展开箭头（没有下一级，留着是噪音）
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys([...keys].map(String)),
        }}
        footer={() => (
          <Flex vertical gap={4}>
            <Typography.Text type="secondary">{t('platform.menu.containerHint')}</Typography.Text>
            <Typography.Text type="secondary">{t('platform.menu.hiddenHint')}</Typography.Text>
            <Typography.Text type="secondary">{t('platform.menu.expandHint')}</Typography.Text>
          </Flex>
        )}
        pagination={false}
      />
      <MenuFormModal
        target={target}
        groups={tree.data?.items ?? []}
        open={target !== null}
        onClose={() => setTarget(null)}
        onSaved={invalidate}
      />
    </PageContainer>
  )
}

/** API 节点 → 表格行：叶子的 children 整个去掉（见 {@link MenuRow}）。 */
function toRow(node: MenuNode): MenuRow {
  const { children, ...rest } = node
  return children.length === 0 ? rest : { ...rest, children: children.map(toRow) }
}

/** 可展开的容器键（有子节点的节点）。 */
function containerKeys(nodes: MenuRow[]): string[] {
  const keys: string[] = []
  for (const node of nodes) {
    if (node.children !== undefined) {
      keys.push(node.key)
      keys.push(...containerKeys(node.children))
    }
  }
  return keys
}

/** 关键词剪枝：命中即保留，否则看子节点还有没有活的（matches 已本地化标题再比）。 */
function prune(node: MenuRow, matches: (node: MenuRow) => boolean): MenuRow | null {
  if (matches(node)) {
    return node
  }
  if (node.children === undefined) {
    return null
  }
  const children = node.children
    .map((child) => prune(child, matches))
    .filter((child): child is MenuRow => child !== null)
  return children.length === 0 ? null : { ...node, children }
}
