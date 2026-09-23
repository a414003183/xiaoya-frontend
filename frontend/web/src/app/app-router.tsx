import { useQuery } from '@tanstack/react-query'
import { ok, SESSION_EXPIRED_EVENT } from '@zentao/api-client'
import { getMe, listMenuRoutes } from '@zentao/api-client/generated'
import { AppLayout, ErrorFallback, LangSwitch, SessionGate } from '@zentao/app-shell'
import { useEffect, useMemo } from 'react'
import { createBrowserRouter, Navigate, type RouteObject, RouterProvider } from 'react-router'
import { MENU_ROUTES_KEY } from '../features/platform'
// 深导入绕过域 barrel（01 §3.2 登记例外）：barrel 再导出 CommentPanel/ActivityTimeline，其 antd 样式注册为
// 模块级副作用不可摇除，会随首屏急切加载（P6 T-8 预算）；NotificationBell 是 shell 级组件唯一直连。
// domain-boundary-ok 01 §3.2 已登记的首屏预算例外（B2-5 门禁放行此唯一一处）
import { NotificationBell } from '../features/platform/components/notification-bell'
import { LangOverrides } from '../shared/lang-overrides'
import { buildRoutes } from './dynamic-routes'
import { activeMenuMap, generatedRoutes } from './routes'
import { useNavigation } from './use-navigation'

/** 登录页等公开路由不进会话门。 */
const PUBLIC_PATHS = new Set(['/login'])

function toChild(route: RouteObject): RouteObject {
  const { path, ...rest } = route
  return path !== undefined ? { ...rest, path: path.slice(1) } : rest
}

function gatedRoutes(routes: readonly RouteObject[]): RouteObject[] {
  return routes.filter((route) => route.path === undefined || !PUBLIC_PATHS.has(route.path))
}

/**
 * 路由级兜底（FE-P0-1）：errorElement 挂在每条页面路由上（不是壳层路由上），
 * 于是单页抛错（含懒 chunk 加载失败）只换掉页面区，侧栏/页签仍在；壳层自身的错误归根路由（见 makeRouter）。
 * 挂在装配层而非 `routes.tsx`：路由表是生成物（手改会被 routes:check 打回），且动态路由表走同一装配路径。
 */
function withErrorFallback(route: RouteObject): RouteObject {
  return { ...route, errorElement: <ErrorFallback /> }
}

/**
 * 会话内壳层（T19 P2-1）：菜单源改由 useNavigation() 供（`GET /menus/my` 的合并菜单树，
 * 读不到回落静态 navigation）——菜单是异步数据，故壳层必须是组件（钩子要有渲染生命周期），
 * 不能像原先那样把 AppLayout 内联在 createBrowserRouter 的 element 里。
 * 其余外壳装配（文案覆盖层、通知铃铛、语言切换）保持不变。
 */
function ShellLayout() {
  const navigation = useNavigation()
  return (
    <>
      {/* 文案覆盖层装载（platform 卡 §3.12）：登录态内挂载一次，覆盖上传的语言包文案 */}
      <LangOverrides />
      <AppLayout
        navigation={navigation}
        activeMenuMap={activeMenuMap}
        tabBarExtra={
          <>
            <NotificationBell />
            <LangSwitch />
          </>
        }
      />
    </>
  )
}

/**
 * 路由器（T26 动态路由）：**页面路由表由后端下发**（`GET /menus/routes` = 内置基线 + 菜单管理的 DB 覆盖），
 * 组件按 `component` 名从代码生成表里取。取到之前（未登录/首屏）用同源的静态生成表，故首屏不空窗、
 * 失败不白屏；会话建立后拿到路由表就重建一次，管理端改的路径/层级随即生效。
 *
 * 为什么重建而不是嵌套 `<Routes>`：`handle`（标题/权限码）只有在外层路由器里才进 `useMatches()`，
 * 而壳层的 403 判定与页签标题都读它——嵌套子路由会让这些静默失效。
 */
function makeRouter(routes: readonly RouteObject[]) {
  return createBrowserRouter([
    ...routes.filter((route) => route.path !== undefined && PUBLIC_PATHS.has(route.path)).map(withErrorFallback),
    {
      path: '/',
      element: <SessionGate />,
      // 壳层级兜底（FE-P0-1）：react-router 对最外层匹配路由**总是**自建边界，不挂 errorElement 时
      // 落到它自带的英文开发者错误页（真机验过 ShellLayout 抛错即此页）。挂上后壳层自身崩溃 = 整页兜底。
      errorElement: <ErrorFallback />,
      children: [
        {
          element: <ShellLayout />,
          children: [
            // 域名入口：登录即工作台（06 A1-4：脚手架首页已删，/ 固定落 /my）
            { index: true, element: <Navigate to="/my" replace /> },
            // doc §6 页面表：/doc → /doc/my；生成器只认页面注解，不做重定向声明
            { path: 'doc', element: <Navigate to="/doc/my" replace /> },
            // T23：角色统一实体后旧「权限组」详情/矩阵入口（/org/groups*）统一落到角色页
            { path: 'org/groups', element: <Navigate to="/admin/roles" replace /> },
            { path: 'org/groups/:roleId', element: <Navigate to="/admin/roles" replace /> },
            { path: 'org/groups/:roleId/*', element: <Navigate to="/admin/roles" replace /> },
            ...gatedRoutes(routes).map(toChild).map(withErrorFallback),
          ],
        },
      ],
    },
  ])
}

export function AppRouter() {
  // 会话建立后才拉路由表（未登录时它必然 401，白拉一次还会在控制台留错）
  const me = useQuery({ queryKey: ['getMe'], queryFn: async () => ok(await getMe()).data, retry: false })
  const table = useQuery({
    queryKey: MENU_ROUTES_KEY,
    queryFn: async () => ok(await listMenuRoutes()).data,
    enabled: me.isSuccess,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const routes = useMemo(
    () => (table.data === undefined ? generatedRoutes : buildRoutes(table.data.items)),
    [table.data],
  )
  const router = useMemo(() => makeRouter(routes), [routes])

  useEffect(() => {
    const onSessionExpired = (): void => {
      void router.navigate('/login')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
  }, [router])

  // key 让路由表到位时**重挂** Provider：react-router 的 Provider 把首个 router 实例的 state 记在
  // useState 初始化里，只换 router prop 不会采用新路由表（真机踩过：/menus/routes 已 200，页面仍 404）。
  return <RouterProvider key={table.data === undefined ? 'static' : 'dynamic'} router={router} />
}
