import type { MenuNode } from '@zentao/api-client/generated/model/menuNode'
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Empty,
  Flex,
  Input,
  Space,
  Switch,
  Tree,
  Typography,
} from '@zentao/design-system'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** 一个节点的授权身份：key 是树里的节点键，perm 是它带的权限码（目录可以没有）。 */
type PickNode = {
  key: string
  title: string
  perm: string | null
  children: PickNode[]
}

export type PrivilegeTreePickerProps = {
  /** 菜单树（管理视图：含目录/菜单/按钮，含停用节点）。 */
  tree: MenuNode[]
  /** 已勾选的权限码集合（受控：页面持有，保存时统一提交）。 */
  selected: ReadonlySet<string>
  /** 勾选/取消一组权限码（父子联动时一组 = 该节点及其所有下级）。 */
  onToggle: (codes: string[], checked: boolean) => void
  /** 一次替换整棵树的勾选（全选/全不选）。 */
  onToggleAll: (codes: string[], checked: boolean) => void
}

/**
 * 权限勾选树（T22）：把「角色能做什么」画成菜单管理里那棵树的形状——一级模块 → 目录 → 菜单 → 按钮。
 *
 * 勾选粒度到按钮级：菜单管理里给页面挂的按钮节点（type=button）就是这里的叶子，
 * 于是「操作列按钮给不给这个角色」在同一个地方一眼看全。
 *
 * 父子联动（缺省开）沿用管理后台的常见语义：勾一个节点 = 连同它下面所有权限码一起勾上；
 * 关掉则每个节点的权限码各自独立（勾了页面不给它下面的按钮，是合法组合）。
 */
export function PrivilegeTreePicker({ tree, selected, onToggle, onToggleAll }: PrivilegeTreePickerProps) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const [linked, setLinked] = useState(true)
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])

  const nodes = useMemo(() => toPickNodes(tree, t), [tree, t])
  const allCodes = useMemo(() => collectCodes(nodes), [nodes])

  /** 关键词：命中项连同祖先一起留下，并自动展开命中路径（否则搜到了也藏在收起的分支里）。 */
  const shown = useMemo(() => {
    if (keyword.trim() === '') {
      return { nodes, autoExpand: [] as string[] }
    }
    const needle = keyword.trim().toLowerCase()
    const autoExpand: string[] = []
    const prune = (list: PickNode[], ancestors: string[]): PickNode[] =>
      list.flatMap((node) => {
        const children = prune(node.children, [...ancestors, node.key])
        const hit = node.title.toLowerCase().includes(needle) || node.perm?.toLowerCase().includes(needle) === true
        if (!hit && children.length === 0) {
          return []
        }
        autoExpand.push(...ancestors, node.key)
        return [{ ...node, children: hit ? node.children : children }]
      })
    return { nodes: prune(nodes, []), autoExpand }
  }, [nodes, keyword])

  const checkedKeys = useMemo(() => keysWithSelectedCodes(nodes, selected), [nodes, selected])
  const containerKeys = useMemo(() => collectContainerKeys(nodes), [nodes])
  const expanded = [...new Set([...expandedKeys, ...shown.autoExpand])]

  const codesByKey = useMemo(() => mapCodesByKey(nodes), [nodes])

  /** 联动勾选：一个节点被勾/取消 → 它整棵子树的权限码一起勾/取消；不联动则只动它自己。 */
  const toggleNode = (key: string, checked: boolean): void => {
    const codes = linked ? subtreeCodes(nodes, key) : (codesByKey.get(key) ?? [])
    onToggle(codes, checked)
  }

  return (
    <Card
      title={t('org.role.matrixTreeTitle')}
      extra={
        <Space size={8} wrap>
          <Input
            aria-label="privilege-tree-search"
            allowClear
            value={keyword}
            placeholder={t('org.role.matrixSearch')}
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 200 }}
          />
          <Switch aria-label="privilege-tree-linked" size="small" checked={linked} onChange={setLinked} />
          <Typography.Text type="secondary">{t('org.role.matrixLinkChildren')}</Typography.Text>
          <Button
            size="small"
            onClick={() => setExpandedKeys(expanded.length === containerKeys.length ? [] : containerKeys)}
          >
            {expanded.length === containerKeys.length ? t('org.role.matrixCollapseAll') : t('org.role.matrixExpandAll')}
          </Button>
          <Button size="small" onClick={() => onToggleAll(allCodes, true)}>
            {t('common.action.selectAll')}
          </Button>
          <Button size="small" onClick={() => onToggleAll(allCodes, false)}>
            {t('org.role.matrixClearAll')}
          </Button>
        </Space>
      }
    >
      {shown.nodes.length === 0 ? (
        <Empty description={t('common.empty')} />
      ) : (
        <Tree
          checkable
          selectable={false}
          // 独立勾选：每个节点（含按钮）的权限码各自成立，父节点勾上不等于替它所有下级授权
          checkStrictly
          checkedKeys={{ checked: checkedKeys, halfChecked: [] }}
          expandedKeys={expanded}
          onExpand={(keys) => setExpandedKeys(keys.map(String))}
          onCheck={(_, info) => {
            const key = String(info.node.key)
            toggleNode(key, info.checked ?? false)
          }}
          treeData={shown.nodes.map(toTreeData)}
        />
      )}
      <Divider style={{ marginBlock: 12 }} />
      <Typography.Text type="secondary">{t('org.role.matrixTreeHint')}</Typography.Text>
    </Card>
  )
}

/** 「未编入菜单」的权限码：菜单树里没有对应节点，仍要可勾（菜单管理里补按钮节点后会自动进树）。 */
export function OrphanCodeGroups({
  items,
  selected,
  onToggle,
}: {
  items: { code: string; domain: string; i18n?: string | undefined }[]
  selected: ReadonlySet<string>
  onToggle: (codes: string[], checked: boolean) => void
}) {
  const { t } = useTranslation()
  const byDomain = new Map<string, typeof items>()
  for (const item of items) {
    byDomain.set(item.domain, [...(byDomain.get(item.domain) ?? []), item])
  }
  return (
    <Card title={t('org.role.matrixOthersTitle')}>
      <Flex vertical gap={8}>
        <Typography.Text type="secondary">{t('org.role.matrixOthersHint')}</Typography.Text>
        {[...byDomain.entries()].map(([domain, codes]) => {
          const values = codes.map((item) => item.code)
          const checkedCount = values.filter((code) => selected.has(code)).length
          return (
            <Flex key={domain} vertical gap={4}>
              <Space size={8}>
                <Typography.Text strong>
                  {t(`org.role.matrixDomain.${domain}`, { defaultValue: domain })}
                </Typography.Text>
                <Checkbox
                  aria-label={`privilege-orphan-domain-${domain}`}
                  indeterminate={checkedCount > 0 && checkedCount < values.length}
                  checked={checkedCount === values.length}
                  onChange={(event) => onToggle(values, event.target.checked)}
                >
                  {`${checkedCount}/${values.length}`}
                </Checkbox>
              </Space>
              <Flex wrap gap={12}>
                {codes.map((item) => (
                  <Checkbox
                    key={item.code}
                    aria-label={item.code}
                    checked={selected.has(item.code)}
                    onChange={(event) => onToggle([item.code], event.target.checked)}
                  >
                    {t(item.i18n ?? item.code, { defaultValue: item.code })}
                  </Checkbox>
                ))}
              </Flex>
            </Flex>
          )
        })}
      </Flex>
    </Card>
  )
}

type TreeRow = { key: string; title: ReactNode; children?: TreeRow[] }

function toTreeData(node: PickNode): TreeRow {
  return {
    key: node.key,
    title: (
      <Space size={6}>
        <Typography.Text>{node.title}</Typography.Text>
        {/* 按钮节点的标题就是权限码本身，不再重复挂一个码标签 */}
        {node.perm === null || node.perm === node.title ? null : (
          <Typography.Text type="secondary" code>
            {node.perm}
          </Typography.Text>
        )}
      </Space>
    ),
    ...(node.children.length === 0 ? {} : { children: node.children.map(toTreeData) }),
  }
}

/** 文案解析器：只用到「键 + 缺省值」这一档能力（i18next 的 t 更宽，故收窄签名避免依赖它的重载）。 */
type Translate = (key: string, options: { defaultValue: string }) => string

/** 菜单节点 → 勾选节点（标题本地化：内置节点/按钮是 i18n 键，DB 覆盖行是字面文案）。 */
function toPickNodes(nodes: MenuNode[], t: Translate): PickNode[] {
  return nodes.map((node) => ({
    key: node.key,
    // 按钮节点的标题是 i18n 键 priv.<code>（语言包里的权限码名字表）：缺键时回落到权限码本身
    title: t(node.title, { defaultValue: node.perm ?? node.title }),
    perm: node.perm ?? null,
    children: toPickNodes(node.children, t),
  }))
}

/** 树里出现过的权限码（已编入菜单的那些）。 */
export function treeCodes(nodes: MenuNode[]): Set<string> {
  const codes = new Set<string>()
  const walk = (list: MenuNode[]): void => {
    for (const node of list) {
      if (node.perm !== null && node.perm !== undefined && node.perm !== '') {
        codes.add(node.perm)
      }
      walk(node.children)
    }
  }
  walk(nodes)
  return codes
}

function collectCodes(nodes: PickNode[]): string[] {
  const codes: string[] = []
  for (const node of nodes) {
    if (node.perm !== null) {
      codes.push(node.perm)
    }
    codes.push(...collectCodes(node.children))
  }
  return codes
}

function collectContainerKeys(nodes: PickNode[]): string[] {
  const keys: string[] = []
  for (const node of nodes) {
    if (node.children.length > 0) {
      keys.push(node.key, ...collectContainerKeys(node.children))
    }
  }
  return keys
}

function mapCodesByKey(nodes: PickNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const walk = (list: PickNode[]): void => {
    for (const node of list) {
      map.set(node.key, node.perm === null ? [] : [node.perm])
      walk(node.children)
    }
  }
  walk(nodes)
  return map
}

/** 勾选态：权限码在已选集合里的节点（独立勾选，父节点不因下级而变）。 */
function keysWithSelectedCodes(nodes: PickNode[], selected: ReadonlySet<string>): string[] {
  const keys: string[] = []
  for (const node of nodes) {
    if (node.perm !== null && selected.has(node.perm)) {
      keys.push(node.key)
    }
    keys.push(...keysWithSelectedCodes(node.children, selected))
  }
  return keys
}

function subtreeCodes(nodes: PickNode[], key: string): string[] {
  const found = findNode(nodes, key)
  return found === null ? [] : collectCodes([found])
}

function findNode(nodes: PickNode[], key: string): PickNode | null {
  for (const node of nodes) {
    if (node.key === key) {
      return node
    }
    const hit = findNode(node.children, key)
    if (hit !== null) {
      return hit
    }
  }
  return null
}
