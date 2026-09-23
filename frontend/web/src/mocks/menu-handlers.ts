import { HttpResponse, http } from 'msw'
import { currentAccount, db, mockId, NOT_FOUND, privilegesOf, UNAUTHENTICATED } from './db'

/**
 * 菜单管理（T19 P2-1 / T21 / T03 纯 DB 化）mock：端点与 contract/openapi.yaml 的 /menus 家族一一对应。
 * T03 起后端是纯 DB（整树由 V42 从页面注册表播种）：mock 里基线节点**按需物化成 db.menus 行**（rowFor），
 * 写端点按 ?nodeKey= 寻址、组件由 path 推导，行为与后端一致。
 *
 * 基线是**真实基线的缩影**（后端读 menu/navigation.json，那是 route-codegen 的产物，mocks 不引生成物）：
 * 结构照抄（组 → 分区 → 菜单，容器有 key、菜单有 path），只是条目数少到能一眼看懂断言。
 */
type BaselineNode = {
  key: string
  title: string
  icon?: string
  order?: number
  children?: BaselineNode[]
  path?: string
  perm?: string
  /** 页面按钮权限码（真实基线由 route-codegen 扫页面文件得到）。 */
  buttons?: string[]
  hidden?: boolean
  activeMenu?: string
  component?: string
}

const BASELINE: BaselineNode[] = [
  {
    key: 'dashboard',
    title: 'nav.group.dashboard',
    icon: 'DashboardOutlined',
    children: [
      { key: '/my', title: 'workspace.title.dashboard', order: 1, perm: 'todo-view', path: '/my' },
      // 隐藏页（@hide，activeMenu 指向自己的菜单项）：进管理树与路由表，不进侧栏
      {
        key: '/my/tasks',
        title: 'workspace.title.myTasks',
        order: 2,
        perm: 'my-view',
        path: '/my/tasks',
        hidden: true,
        activeMenu: '/my',
      },
    ],
  },
  {
    key: 'admin',
    title: 'nav.group.admin',
    icon: 'SettingOutlined',
    children: [
      {
        key: 'admin/system',
        title: 'nav.section.adminSystem',
        order: 1,
        children: [
          {
            key: '/admin/settings',
            title: 'platform.settings.title',
            order: 1,
            perm: 'setting-manage',
            path: '/admin/settings',
          },
          { key: '/admin/dicts', title: 'platform.dict.title', order: 3, perm: 'setting-manage', path: '/admin/dicts' },
        ],
      },
      {
        key: '/admin/roles',
        title: 'org.role.title',
        order: 4,
        perm: 'role-view',
        path: '/admin/roles',
        buttons: ['role-create', 'role-edit', 'role-delete', 'role-copy', 'role-priv-edit'],
      },
    ],
  },
]

type MenuRow = (typeof db)['menus'][number]

type Node = {
  key: string
  parentKey: string | null
  kind: 'group' | 'section' | 'item' | 'button'
  title: string
  path: string | null
  component: string | null
  icon: string | null
  orderNo: number
  perm: string | null
  status: 'active' | 'disabled'
  hidden: boolean
  children: Node[]
}

/** 基线扁平索引：key → 节点 + 它的上级（渲染类型由层级算，见 baselineKind）。 */
function flatten(
  nodes: BaselineNode[],
  parentKey: string | null,
): Map<string, { node: BaselineNode; parentKey: string | null }> {
  const index = new Map<string, { node: BaselineNode; parentKey: string | null }>()
  for (const node of nodes) {
    index.set(node.key, { node, parentKey })
    if (node.children !== undefined) {
      for (const [key, value] of flatten(node.children, node.key)) {
        index.set(key, value)
      }
    }
  }
  return index
}

const BASELINE_INDEX = flatten(BASELINE, null)

/** 基线节点的渲染类型：有下级 + 无上级 = 一级组；有下级 = 分区；无下级 = 菜单。 */
function baselineKind(key: string): string {
  const hit = BASELINE_INDEX.get(key)
  if (hit === undefined) {
    return 'item'
  }
  return hit.node.children === undefined ? 'item' : hit.parentKey === null ? 'group' : 'section'
}

/** 可见树里的页面：隐藏页只在管理树（作为宿主页的子级）出现，故顶层遍历跳过它们。 */
function isHidden(key: string): boolean {
  return BASELINE_INDEX.get(key)?.node.hidden === true
}

function rowKind(row: MenuRow, parentKind: string | null): string {
  if (row.nodeType === 'dir') {
    return parentKind === null ? 'group' : 'section'
  }
  return row.nodeType === 'button' ? 'button' : 'item'
}

/** 一个 key 的渲染类型（内置或 DB 行；找不到 = null）。 */
function kindOfKey(key: string): string | null {
  if (BASELINE_INDEX.has(key)) {
    return baselineKind(key)
  }
  const row = db.menus.find((item) => item.nodeKey === key)
  if (row === undefined) {
    return null
  }
  return rowKind(row, row.parentKey === null ? null : kindOfKey(row.parentKey))
}

/** 合并视图（管理树与「我的菜单」同一个装配，差异只在过滤）。 */
/** 纯 DB 口径的取行：基线节点在 mock 里按需物化成行（等价于后端 V42 的播种）。 */
function rowFor(key: string): MenuRow | null {
  const existing = db.menus.find((item) => item.nodeKey === key)
  if (existing !== undefined) {
    return existing
  }
  const entry = BASELINE_INDEX.get(key)
  if (entry === undefined) {
    return null
  }
  const kind = baselineKind(key)
  const row: MenuRow = {
    id: mockId(),
    nodeKey: key,
    parentKey: entry.parentKey,
    nodeType: kind === 'button' ? 'button' : kind === 'item' ? 'menu' : 'dir',
    title: entry.node.title,
    component: entry.node.component ?? null,
    path: entry.node.path ?? null,
    icon: entry.node.icon ?? null,
    orderNo: entry.node.order ?? 999,
    perm: entry.node.perm ?? null,
    status: 'active',
  }
  db.menus.push(row)
  return row
}

function tree(privileges: string[] | null): Node[] {
  const rowsByKey = new Map(db.menus.map((row) => [row.nodeKey, row]))
  const childrenOf = (key: string | null): MenuRow[] => db.menus.filter((row) => row.parentKey === key)
  const visiting = new Set<string>()

  function slot(key: string, parentKind: string | null): Node | null {
    if (visiting.has(key)) {
      return null
    }
    visiting.add(key)
    const builtin = BASELINE_INDEX.get(key)
    const row = rowsByKey.get(key)
    if (builtin === undefined && row === undefined) {
      return null
    }
    const kind = builtin === undefined ? rowKind(row as MenuRow, parentKind) : baselineKind(key)

    const children: Node[] = []
    for (const child of builtin?.node.children ?? []) {
      if (isHidden(child.key)) {
        continue // 隐藏页由宿主页的子级渲染（下面 item 分支）
      }
      if (rowsByKey.get(child.key)?.parentKey !== key && rowsByKey.has(child.key)) {
        continue // 被搬家/换上级的行不在这里渲染（本卡不支持搬动，防御历史数据）
      }
      const node = slot(child.key, kind)
      if (node !== null) {
        children.push(node)
      }
    }
    for (const childRow of childrenOf(key)) {
      if (BASELINE_INDEX.has(childRow.nodeKey)) {
        continue
      }
      const node = slot(childRow.nodeKey, kind)
      if (node !== null) {
        children.push(node)
      }
    }
    if (kind === 'item') {
      let index = 0
      for (const code of builtin?.node.buttons ?? []) {
        const buttonKey = `${key}#${code}`
        const buttonRow = rowsByKey.get(buttonKey)
        children.push({
          key: buttonKey,
          parentKey: key,
          kind: 'button',
          title: buttonRow?.title ?? `priv.${code}`,
          path: null,
          component: null,
          icon: null,
          orderNo: buttonRow?.orderNo ?? 900 + index,
          perm: code,
          status: buttonRow?.status ?? 'active',
          hidden: false,
          children: [],
        })
        index += 1
      }
      for (const page of BASELINE_INDEX.values()) {
        if (page.node.hidden === true && page.node.activeMenu === key) {
          const hidden = slot(page.node.key, 'item')
          if (hidden !== null) {
            children.push(hidden)
          }
        }
      }
    }
    children.sort((a, b) => a.orderNo - b.orderNo || a.key.localeCompare(b.key))

    const node: Node = {
      key,
      parentKey: row?.parentKey ?? builtin?.parentKey ?? null,
      kind: kind as Node['kind'],
      title: row?.title ?? builtin?.node.title ?? key,
      path: row === undefined ? (builtin?.node.path ?? null) : row.path,
      component: row?.component ?? builtin?.node.component ?? null,
      icon: row === undefined ? (builtin?.node.icon ?? null) : row.icon,
      orderNo: row?.orderNo ?? builtin?.node.order ?? 999,
      perm: row === undefined ? (builtin?.node.perm ?? null) : row.perm,
      status: row?.status ?? 'active',
      hidden: builtin?.node.hidden === true,
      children,
    }
    return node
  }

  const groups: Node[] = []
  for (const group of BASELINE) {
    const node = slot(group.key, null)
    if (node !== null) {
      groups.push(node)
    }
  }
  for (const row of childrenOf(null)) {
    if (BASELINE_INDEX.has(row.nodeKey)) {
      continue
    }
    const node = slot(row.nodeKey, null)
    if (node !== null) {
      groups.push(node)
    }
  }
  groups.sort((a, b) => a.orderNo - b.orderNo || a.key.localeCompare(b.key))
  return privileges === null ? groups : filterVisible(groups, privileges)
}

function filterVisible(nodes: Node[], privileges: string[]): Node[] {
  const kept: Node[] = []
  for (const node of nodes) {
    if (node.status !== 'active' || node.kind === 'button' || node.hidden) {
      continue
    }
    if (node.kind === 'item') {
      if (node.perm === null || privileges.includes(node.perm)) {
        kept.push(node)
      }
      continue
    }
    const children = filterVisible(node.children, privileges)
    if (children.length > 0) {
      kept.push({ ...node, children })
    }
  }
  return kept
}

const requireSession = (): boolean => db.sessionActive && currentAccount() !== null

export const menuHandlers = [
  http.get('*/api/v1/menus/tree', () => {
    if (!requireSession()) {
      return HttpResponse.json(UNAUTHENTICATED, { status: 401 })
    }
    return HttpResponse.json({ data: { items: tree(null) } })
  }),

  // 角色授权页的数据源（T22）：与 /menus/tree 同一棵树（含按钮节点），入口权限换成 group-priv-edit
  http.get('*/api/v1/menus/grantable', () => {
    if (!requireSession()) {
      return HttpResponse.json(UNAUTHENTICATED, { status: 401 })
    }
    return HttpResponse.json({ data: { items: tree(null) } })
  }),

  // 前端路由表（T26）：全部页面（含隐藏页）的 path/component/perm——前端按它建路由
  http.get('*/api/v1/menus/routes', () => {
    if (!requireSession()) {
      return HttpResponse.json(UNAUTHENTICATED, { status: 401 })
    }
    const items = [...BASELINE_INDEX.entries()]
      .filter(([, entry]) => entry.node.children === undefined)
      .map(([key, entry]) => {
        const row = db.menus.find((item) => item.nodeKey === key)
        return {
          path: row?.path ?? entry.node.path ?? key,
          component: row?.component ?? `${key.replace(/[^a-zA-Z]/g, '')}Page`,
          title: row?.title ?? entry.node.title,
          perm: row?.perm ?? entry.node.perm ?? null,
          activeMenu: entry.node.activeMenu ?? null,
          status: row?.status ?? 'active',
          hidden: entry.node.hidden === true,
        }
      })
    return HttpResponse.json({ data: { items } })
  }),

  // 页面注册表（T03）：path → component 的代码侧清单，菜单表单按 path 匹配组件
  http.get('*/api/v1/menus/page-registry', () => {
    if (!requireSession()) {
      return HttpResponse.json(UNAUTHENTICATED, { status: 401 })
    }
    const items = [...BASELINE_INDEX.values()]
      .filter((entry) => entry.node.children === undefined)
      .map((entry) => ({
        key: entry.node.key,
        path: entry.node.path ?? entry.node.key,
        component: entry.node.component ?? `${entry.node.key.replace(/[^a-zA-Z]/g, '')}Page`,
        titleKey: entry.node.title,
        perm: entry.node.perm ?? null,
        hide: entry.node.hidden === true,
      }))
    return HttpResponse.json({ data: { items } })
  }),

  http.get('*/api/v1/menus/my', () => {
    if (!requireSession()) {
      return HttpResponse.json(UNAUTHENTICATED, { status: 401 })
    }
    return HttpResponse.json({ data: { items: tree(privilegesOf(currentAccount())) } })
  }),

  http.post('*/api/v1/menus', async ({ request }) => {
    if (!requireSession()) {
      return HttpResponse.json(UNAUTHENTICATED, { status: 401 })
    }
    const body = (await request.json()) as {
      parentKey?: string
      type?: 'dir' | 'menu' | 'button'
      title: string
      path?: string
      icon?: string
      perm?: string
      orderNo?: number
      status?: 'active' | 'disabled'
    }
    const type = body.type ?? 'menu'
    const invalid = (fields: Record<string, string>) =>
      HttpResponse.json({ error: { code: 42201, message: '字段校验失败。', fields, traceId: 'mock' } }, { status: 422 })
    if (TYPES.every((value) => value !== type)) {
      return invalid({ type: 'pattern' })
    }
    let nodeKey = 'db-pending'
    if (type === 'menu') {
      if (body.path === undefined || !body.path.startsWith('/')) {
        return invalid({ path: 'pattern' })
      }
      const page = BASELINE_INDEX.get(body.path)
      if (page === undefined) {
        return invalid({ path: 'unknown' })
      }
      // 页面节点的 key 取 path；同一页面再挂一个入口时退化为 db-<id>
      nodeKey = db.menus.some((row) => row.nodeKey === body.path) ? 'db-pending' : body.path
    }
    const parentKey = body.parentKey ?? null
    if (parentKey === null && type !== 'dir') {
      return invalid({ parentKey: 'required' })
    }
    if (parentKey !== null) {
      const parentKind = kindOfKey(parentKey)
      const allowed =
        type === 'dir'
          ? parentKind === 'group'
          : type === 'button'
            ? parentKind === 'item'
            : parentKind === 'group' || parentKind === 'section'
      if (parentKind === null || !allowed) {
        return invalid({ parentKey: parentKind === null ? 'unknown' : 'kind' })
      }
    }
    const page = body.path === undefined ? undefined : BASELINE_INDEX.get(body.path)
    const row: MenuRow = {
      id: mockId(),
      nodeKey,
      parentKey,
      nodeType: type,
      title: body.title,
      component:
        type === 'menu' ? (page?.node.component ?? `${(body.path ?? '').replace(/[^a-zA-Z]/g, '')}Page`) : null,
      path: type === 'menu' ? (body.path ?? null) : null,
      icon: body.icon === undefined || body.icon === '' ? null : body.icon,
      orderNo: body.orderNo ?? 999,
      perm: body.perm === undefined || body.perm === '' ? null : body.perm,
      status: body.status ?? 'active',
    }
    if (row.nodeKey === 'db-pending') {
      row.nodeKey = `db-${row.id}`
    }
    db.menus.push(row)
    return HttpResponse.json({ data: findNode(tree(null), row.nodeKey) ?? null })
  }),

  // 写端点按 nodeKey 走查询参数（T03：页面 key 含 /、按钮 key 含 #，进不了路径段）
  http.patch('*/api/v1/menus', async ({ request }) => {
    if (!requireSession()) {
      return HttpResponse.json(UNAUTHENTICATED, { status: 401 })
    }
    const nodeKey = new URL(request.url).searchParams.get('nodeKey') ?? ''
    const row = rowFor(nodeKey)
    if (row === null) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const body = (await request.json()) as Partial<MenuRow>
    Object.assign(row, {
      ...(body.title === undefined ? {} : { title: body.title }),
      ...(body.path === undefined ? {} : { path: body.path === '' ? null : body.path }),
      ...(body.icon === undefined ? {} : { icon: body.icon === '' ? null : body.icon }),
      ...(body.orderNo === undefined ? {} : { orderNo: body.orderNo }),
      ...(body.perm === undefined ? {} : { perm: body.perm === '' ? null : body.perm }),
      ...(body.status === undefined ? {} : { status: body.status }),
    })
    return HttpResponse.json({ data: findNode(tree(null), row.nodeKey) ?? null })
  }),

  http.delete('*/api/v1/menus', ({ request }) => {
    if (!requireSession()) {
      return HttpResponse.json(UNAUTHENTICATED, { status: 401 })
    }
    const nodeKey = new URL(request.url).searchParams.get('nodeKey') ?? ''
    const row = rowFor(nodeKey)
    if (row === null) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    // 删除即真删：节点连子孙（按钮/隐藏页）一起消失
    const doomed = new Set<string>([row.nodeKey])
    let grew = true
    while (grew) {
      grew = false
      for (const item of db.menus) {
        if (!doomed.has(item.nodeKey) && item.parentKey !== null && doomed.has(item.parentKey)) {
          doomed.add(item.nodeKey)
          grew = true
        }
      }
    }
    for (let index = db.menus.length - 1; index >= 0; index -= 1) {
      const item = db.menus[index]
      if (item !== undefined && doomed.has(item.nodeKey)) {
        db.menus.splice(index, 1)
      }
    }
    return HttpResponse.json({ data: null })
  }),
]

const TYPES = ['dir', 'menu', 'button'] as const

/** 按 key 在树里找节点（写接口的返回体：单行合并后的形状）。 */
function findNode(nodes: Node[], key: string): Node | undefined {
  for (const node of nodes) {
    if (node.key === key) {
      return node
    }
    const hit = findNode(node.children, key)
    if (hit !== undefined) {
      return hit
    }
  }
  return undefined
}
