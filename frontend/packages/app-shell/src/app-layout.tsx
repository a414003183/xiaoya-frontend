import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok } from '@zentao/api-client'
import { getMe, logout } from '@zentao/api-client/generated'
import {
  Avatar,
  BackTargetScope,
  Button,
  DashboardOutlined,
  Dropdown,
  ExperimentOutlined,
  FileTextOutlined,
  Flex,
  hasPerm,
  Layout,
  LogoutOutlined,
  Menu,
  MenuFoldOutlined,
  type MenuProps,
  MenuUnfoldOutlined,
  PageContainer,
  ProductOutlined,
  ProjectOutlined,
  SettingOutlined,
  siderBrandHeight,
  siderCollapsedWidth,
  siderMenuWidth,
  siderRailWidth,
  siderWidth,
  spacing,
  TeamOutlined,
  Tooltip,
  Typography,
  theme,
  UserOutlined,
  useMessage,
  usePrivileges,
} from '@zentao/design-system'
import { type ComponentType, lazy, type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router'
import { GlobalSearch } from './global-search'
import { TabBar } from './tab-bar'
import { ThemeSwitch } from './theme-switch'
import { useUiStore } from './ui-store'

// 403 回退懒加载：antd Result 的三张内嵌 SVG 插图（~29KB raw）只在权限拒绝时才需要（P6 T-8 首屏预算）
const Forbidden = lazy(() => import('./forbidden'))

const { Sider, Content } = Layout

export type NavigationItem = {
  path: string
  title: string
  perm?: string
  icon?: string
  order: number
}

/** 组内二级分区（用户裁决 2026-09-20）：菜单最多三级（组 → 分区 → 项），两级都内联展开。 */
export type NavigationSection = {
  key: string
  title: string
  order: number
  children: NavigationItem[]
}

export type NavigationGroup = {
  key: string
  title: string
  icon?: string
  children: (NavigationItem | NavigationSection)[]
}

/** 分区与叶子项的判别：分区有 children，叶子有 path（生成器保证二者互斥）。 */
export function isSection(node: NavigationItem | NavigationSection): node is NavigationSection {
  return 'children' in node
}

/**
 * 选中叶子 → 需展开的祖先容器键（组 → 分区）：菜单高亮定位与该组自动展开共用。
 * ponytail: 只按「组 → 分区 → 项」三层遍历（route-codegen 的 SECTION_META 也只有这一层，展开更深层级需改成递归）。
 */
export function ancestorKeys(navigation: NavigationGroup[], path: string): string[] {
  for (const group of navigation) {
    for (const node of group.children) {
      if (isSection(node)) {
        if (node.children.some((item) => item.path === path)) return [group.key, node.key]
        continue
      }
      if (node.path === path) return [group.key]
    }
  }
  return []
}

/**
 * 静态 backTo → 「该页最近访问的完整 URL」（06 A5-2 V-03）：详情页返回时带上列表原本的筛选/页码。
 * 标签身份是路径名（一个页面一个标签），完整 URL 存在标签的 href 上，故按路径名精确命中即可。
 */
export function resolveBackTarget(backTo: string, tabs: readonly { key: string; href: string }[]): string {
  return tabs.find((tab) => tab.key === backTo)?.href ?? backTo
}

/** 组图标名 → 组件（名字来自 route-codegen GROUP_META，06 §八-8.1 站点地图）。 */
const GROUP_ICONS: Record<string, ComponentType> = {
  DashboardOutlined,
  ProductOutlined,
  ProjectOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  TeamOutlined,
  SettingOutlined,
}

/**
 * 带参路由 → 菜单高亮解析（06 A1）：静态路径直查 activeMenuMap；动态模式（/bugs/:bugId）
 * 转正则按「最长模式优先」匹配具体 URL（/bugs/5）。无匹配返回 undefined（该页不点亮菜单）。
 */
export function resolveActiveMenu(pathname: string, activeMenuMap: Record<string, string>): string | undefined {
  if (activeMenuMap[pathname] !== undefined) return activeMenuMap[pathname]
  const patterns = Object.entries(activeMenuMap)
    .filter(([pattern]) => pattern.includes(':'))
    .sort((a, b) => b[0].length - a[0].length)
  for (const [pattern, target] of patterns) {
    const regex = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[^/]+/g, '[^/]+')}$`)
    if (regex.test(pathname)) return target
  }
  return undefined
}

/** 侧栏品牌区高度（= 旧 Header 高：品牌仍在顶部一条 56 高的带内，只是归属左列）。 */
export const HEADER_HEIGHT = siderBrandHeight

/**
 * 应用外壳（01 §3.4 / UI 三项修订 2026-09-20）：
 * **左列由侧栏独占**——品牌（logo）/ 导航搜索 / 菜单 / 底部收起钮；**右侧只有页签条与页面**。
 * 页签条一行两区（用户裁决 2026-09-20 二次修订）：左为已打开页面，右为全局工具
 * （通知·语言·主题·头像），高度与侧栏品牌行对齐。顶部标题栏整体取消：原「标题栏 + 标签条」
 * 两行 chrome 收成一行，收起/展开钮在侧栏底部。
 *
 * 滚动模型不变：框架恒 100vh，侧栏菜单区与内容区各自内部滚动，页面不随数据量变高（用户裁决 2026-09-19）。
 * 菜单/选中态/权限显隐从路由树单源派生（navigation 树 + activeMenuMap）。
 */
export function AppLayout({
  navigation = [],
  activeMenuMap = {},
  tabBarExtra,
}: {
  navigation?: NavigationGroup[]
  activeMenuMap?: Record<string, string>
  /** 页签条右端工具区（通知铃铛等域内组件，由装配层注入）。 */
  tabBarExtra?: ReactNode
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const message = useMessage()
  const siderCollapsed = useUiStore((state) => state.siderCollapsed)
  const toggleSiderCollapsed = useUiStore((state) => state.toggleSiderCollapsed)
  const setSiderCollapsed = useUiStore((state) => state.setSiderCollapsed)
  const openKeys = useUiStore((state) => state.openKeys)
  const setOpenKeys = useUiStore((state) => state.setOpenKeys)
  const privileges = usePrivileges()
  const matches = useMatches()
  /* 侧栏底部显示当前登录人：/me 已由会话门取过（同 queryKey 共享缓存），此处只读不重取。 */
  const me = useQuery({
    queryKey: ['getMe'],
    queryFn: async () => ok(await getMe()).data,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const displayName = me.data?.account.realName ?? me.data?.account.account ?? ''
  const logoutMutation = useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      void queryClient.invalidateQueries()
      void navigate('/login')
    },
    onError: () => message.error(t('auth.login.message.invalid')),
  })

  const visibleItems = (items: NavigationItem[]) => items.filter((item) => !item.perm || hasPerm(privileges, item.perm))
  /* 组 → 分区 → 项：分区先按权限过滤子项，空分区不出现在菜单（与整组空则整组不出现同口径）。 */
  const visibleChildren = (group: NavigationGroup) =>
    group.children
      .map((node) => (isSection(node) ? { ...node, children: visibleItems(node.children) } : node))
      .filter((node) => (isSection(node) ? node.children.length > 0 : visibleItems([node]).length > 0))

  const toMenuItems = (nodes: (NavigationItem | NavigationSection)[]): NonNullable<MenuProps['items']> =>
    nodes.map((node) =>
      isSection(node)
        ? { key: node.key, label: t(node.title), children: toMenuItems(node.children) }
        : { key: node.path, label: t(node.title) },
    )

  const pathname = matches[matches.length - 1]?.pathname
  const selectedKey = pathname ? (resolveActiveMenu(pathname, activeMenuMap) ?? pathname) : undefined
  const ancestors = selectedKey === undefined ? [] : ancestorKeys(navigation, selectedKey)

  /*
   * 两栏导航（用户裁决 2026-09-20 二次修订）：**左栏＝一级组**（图标 + 名称的纵向栏，点击既不下拉也不导航，
   * 只把右栏切到该组）；**右栏＝该组的二级菜单**，二级项自带子项时在右栏内联下拉出三级。
   * 右栏恒显示「当前所在组」——点左栏别的组只切右栏，不改变所在页；路由一变即回到当前页所在组
   * （点组不导航，故手工选择连同「选时的 pathname」一起记账：路径不匹配即自动回落到路由所在组，无需副作用）。
   * 权限过滤按组进行：组内无可见项（含分区全空）即整组不进左栏（无码账号看不到该组，e2e 按此断言）。
   */
  const visibleGroups = navigation.filter((group) => visibleChildren(group).length > 0)
  const routeGroup = ancestors[0]
  const [picked, setPicked] = useState<{ path: string | undefined; group: string } | null>(null)
  const pickedGroup = picked !== null && picked.path === pathname ? picked.group : undefined
  const activeGroup = visibleGroups.find((group) => group.key === (pickedGroup ?? routeGroup)) ?? visibleGroups[0]
  const railItems: NonNullable<MenuProps['items']> = visibleGroups.map((group) => {
    const Icon = group.icon ? GROUP_ICONS[group.icon] : undefined
    return { key: group.key, icon: Icon ? <Icon /> : undefined, label: t(group.title) }
  })
  const columnItems: NonNullable<MenuProps['items']> = activeGroup ? toMenuItems(visibleChildren(activeGroup)) : []
  /* 高亮：左栏点亮所属组，右栏点亮当前页；收起态只剩左栏，故只按组点亮。 */
  const railSelectedKeys = activeGroup ? [activeGroup.key] : []
  const columnSelectedKeys = selectedKey === undefined ? [] : [selectedKey]

  /* 右栏内二级分区（含当前页者）自动展开：导航落位即展开祖先链；用户仍可手动收起，下次导航再展开。 */
  const sectionPath = ancestors.slice(1).join('|')
  useEffect(() => {
    const missing = sectionPath === '' ? [] : sectionPath.split('|').filter((key) => !openKeys.includes(key))
    if (missing.length > 0) setOpenKeys([...openKeys, ...missing])
  }, [sectionPath, openKeys, setOpenKeys])

  const requiredPerm = matches.flatMap((match) => {
    const perm = (match.handle as { perm?: string } | undefined)?.perm
    return perm ? [perm] : []
  })[0]
  const routeDenied = requiredPerm !== undefined && !hasPerm(privileges, requiredPerm)

  // 多标签（06 A1-6）：路由落位即开/激活 tab（登录页不入）；滚动位置按 tab 保存与恢复。
  // 标签身份 = 路径名（用户裁决 2026-09-19：同一页面的不同查询/页内页签不新开标签），
  // 完整 URL（含 query）存 href，切回标签即恢复筛选/分页（06 A5-2 V-03）。
  const openTab = useUiStore((state) => state.openTab)
  const { search } = useLocation()
  const locationKey = `${pathname ?? ''}${search}`
  const currentTitleKey = matches
    .flatMap((match) => {
      const title = (match.handle as { title?: string } | undefined)?.title
      return title ? [title] : []
    })
    .at(-1)
  useEffect(() => {
    /* 无 handle.title 的落点（重定向路由，如 /org/groups → /admin/roles）不留标签：
       否则标签条先落一个「页面」空标签，再叠上真正的目标页。每个页面注解都有 @title（codegen 强制）。 */
    if (pathname && pathname !== '/login' && currentTitleKey !== undefined)
      openTab({ key: pathname, href: locationKey, titleKey: currentTitleKey ?? 'nav.tabs.untitled' })
  }, [pathname, locationKey, currentTitleKey, openTab])
  // 内容区（固定框架内）的按 tab 滚动位置保存/恢复。
  // 保存取 scroll 监听的实时值而非切换时再读：路由切换瞬间新页先挂载、高度变短会把 scrollTop 钳到 0。
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollMap = useRef<Record<string, number>>({})
  const liveScrollRef = useRef(0)
  const prevPathRef = useRef<string | null>(null)
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const onScroll = (): void => {
      liveScrollRef.current = el.scrollTop
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    if (!pathname || pathname === '/login') return
    const previous = prevPathRef.current
    if (previous !== null && previous !== locationKey) scrollMap.current[previous] = liveScrollRef.current
    prevPathRef.current = locationKey
    // 路由切换时页面先以短高挂载、取数后才长高，单次赋值会被钳制：rAF+短延迟各重放一次
    // ponytail: >200ms 的慢取数不重放（升级路径=ResizeObserver 观察内容高度变化重放至用户首次滚动）。
    const el = contentRef.current
    if (!el) return
    const target = scrollMap.current[locationKey] ?? 0
    el.scrollTop = target
    const raf = requestAnimationFrame(() => {
      el.scrollTop = target
    })
    const timer = window.setTimeout(() => {
      el.scrollTop = target
    }, 200)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [locationKey, pathname])

  // 详情页返回：静态 backTo 解析成「同前缀最近访问过的完整 URL」（含筛选参数，06 A5-2 V-03）
  const resolveBack = useCallback((backTo: string) => resolveBackTarget(backTo, useUiStore.getState().tabs), [])

  const { token } = theme.useToken()
  const collapseLabel = t(siderCollapsed ? 'nav.sider.expand' : 'nav.sider.collapse')
  /* 当前登录人入口（页签条右端）：头像 + 姓名（点开 = 个人资料/退出）。
     触发钮用真 Button（可聚焦 + 有可访问名，e2e 按 nav.user.label 定位）。 */
  const userMenu = (
    <Dropdown
      trigger={['hover']}
      menu={{
        items: [
          { key: 'profile', icon: <UserOutlined />, label: t('my.profile.title') },
          { type: 'divider' },
          { key: 'logout', icon: <LogoutOutlined />, label: t('common.action.logout'), danger: true },
        ],
        onClick: ({ key }) => {
          if (key === 'profile') void navigate('/my/profile')
          if (key === 'logout') logoutMutation.mutate()
        },
      }}
    >
      <Button type="text" aria-label={t('nav.user.label')} icon={<Avatar size="small" icon={<UserOutlined />} />}>
        <Typography.Text ellipsis style={{ maxWidth: 120 }}>
          {displayName}
        </Typography.Text>
      </Button>
    </Dropdown>
  )

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        collapsible
        trigger={null}
        collapsed={siderCollapsed}
        width={siderWidth}
        collapsedWidth={siderCollapsedWidth}
        /* theme 恒 light：底色取 lightSiderBg=colorBgContainer，随亮暗算法与右侧统一翻转（XinAdmin 口径） */
        theme="light"
        style={{
          height: '100%',
          borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* 品牌（logo）：随侧栏，不再占右侧内容区一行 */}
          <Flex
            align="center"
            justify={siderCollapsed ? 'center' : 'flex-start'}
            gap={spacing.sm}
            style={{ height: siderBrandHeight, flexShrink: 0, paddingInline: spacing.lg }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                flexShrink: 0,
                borderRadius: token.borderRadius,
                background: token.colorPrimary,
                color: token.colorTextLightSolid,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
              }}
            >
              Z
            </div>
            {!siderCollapsed && (
              <Typography.Title level={5} style={{ margin: 0, whiteSpace: 'nowrap' }}>
                ZenTao
              </Typography.Title>
            )}
          </Flex>
          {/* 导航搜索：只搜菜单与页面（业务对象检索归各列表页筛选） */}
          <div style={{ paddingInline: spacing.md, paddingBottom: spacing.md, flexShrink: 0 }}>
            <GlobalSearch
              navigation={navigation}
              collapsed={siderCollapsed}
              onExpand={() => setSiderCollapsed(false)}
            />
          </div>
          {/* 两栏菜单区：左＝一级栏（**图标栏**，点击只切换右栏，不下拉不导航；名称走 antd 收起态自带的 hover 提示）
              → 右＝该组的二级栏（顶部一条组名标题，二级带子项时栏内下拉出三级）。
              左右双栏 + 图标栏的理由：一级名称中英长度差大（「组织」vs Organization），并排文字在 232 内栏宽下必截断；
              收起态只剩图标栏，点一级即展开侧栏并把右栏切到该组。 */}
          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', alignItems: 'flex-start' }}>
            <Menu
              mode="inline"
              theme="light"
              inlineCollapsed
              inlineIndent={0}
              selectedKeys={railSelectedKeys}
              items={railItems}
              onClick={({ key }) => {
                setPicked({ path: pathname, group: key })
                setSiderCollapsed(false)
              }}
              style={{
                width: siderRailWidth,
                flexShrink: 0,
                borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
              }}
            />
            {!siderCollapsed && (
              <div style={{ width: siderMenuWidth, flexShrink: 0 }}>
                {/* 组名标题：图标栏没有文字，二级栏顶部补上「我在哪个组」，避免只剩一堆二级项难定位 */}
                <Typography.Text
                  type="secondary"
                  style={{
                    display: 'block',
                    paddingBlock: spacing.sm,
                    paddingInline: spacing.md,
                    fontWeight: 600,
                  }}
                >
                  {activeGroup ? t(activeGroup.title) : ''}
                </Typography.Text>
                <Menu
                  mode="inline"
                  theme="light"
                  selectedKeys={columnSelectedKeys}
                  openKeys={openKeys}
                  onOpenChange={setOpenKeys}
                  items={columnItems}
                  onClick={({ key }) => navigate(key)}
                />
              </div>
            )}
          </div>
          {/* 侧栏底部只留收起/展开钮（用户裁决 2026-09-20；通知/语言/主题/头像已移到页签条右端） */}
          <div
            style={{
              flexShrink: 0,
              borderTop: `1px solid ${token.colorBorderSecondary}`,
              padding: spacing.sm,
            }}
          >
            <Tooltip title={collapseLabel} placement="right">
              <Button
                type="text"
                block
                aria-label={collapseLabel}
                icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={toggleSiderCollapsed}
              />
            </Tooltip>
          </div>
        </div>
      </Sider>
      <Layout style={{ minHeight: 0 }}>
        {/* 页签条：右侧内容列唯一的一层 chrome —— 左侧已打开页面、右侧全局工具（通知/语言/主题/头像）。
            高度与侧栏品牌行同高（siderBrandHeight），页签垂直居中，故不贴顶、不挤在一条细缝里。 */}
        <div
          style={{
            flexShrink: 0,
            minHeight: siderBrandHeight,
            display: 'flex',
            alignItems: 'center',
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            paddingInline: spacing.lg,
            paddingBlock: spacing.sm,
          }}
        >
          <TabBar
            extra={
              <>
                {tabBarExtra}
                <ThemeSwitch />
                {userMenu}
              </>
            }
          />
        </div>
        {/* padding 归 PageContainer（06 A3-1/playbook §5：页面根独占 24px）；滚动只在内容区内部。
            flex 列 + .zt-page 吃满高度：内容不足一屏时页面也铺满（style.css 页面铺满规则）。 */}
        <Content style={{ minHeight: 0 }}>
          <div ref={contentRef} style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {routeDenied ? (
              <PageContainer>
                <Suspense fallback={null}>
                  <Forbidden />
                </Suspense>
              </PageContainer>
            ) : (
              <BackTargetScope resolve={resolveBack}>{<Outlet />}</BackTargetScope>
            )}
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
