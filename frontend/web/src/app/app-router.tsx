import { SESSION_EXPIRED_EVENT } from '@zentao/api-client'
import { AppLayout, LangSwitch, SessionGate } from '@zentao/app-shell'
import { useEffect } from 'react'
import { createBrowserRouter, Navigate, type RouteObject, RouterProvider } from 'react-router'
// 深导入绕过域 barrel（01 §3.2 登记例外）：barrel 再导出 CommentPanel/ActivityTimeline，其 antd 样式注册为
// 模块级副作用不可摇除，会随首屏急切加载（P6 T-8 预算）；NotificationBell 是 shell 级组件唯一直连。
// domain-boundary-ok 01 §3.2 已登记的首屏预算例外（B2-5 门禁放行此唯一一处）
import { NotificationBell } from '../features/platform/components/notification-bell'
import { LangOverrides } from '../shared/lang-overrides'
import { activeMenuMap, generatedRoutes, navigation } from './routes'

/** 登录页等公开路由不进会话门。 */
const PUBLIC_PATHS = new Set(['/login'])

function toChild(route: RouteObject): RouteObject {
  const { path, ...rest } = route
  return path !== undefined ? { ...rest, path: path.slice(1) } : rest
}

const gated = generatedRoutes.filter((route) => route.path === undefined || !PUBLIC_PATHS.has(route.path))

const router = createBrowserRouter([
  ...generatedRoutes.filter((route) => route.path !== undefined && PUBLIC_PATHS.has(route.path)),
  {
    path: '/',
    element: <SessionGate />,
    children: [
      {
        element: (
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
        ),
        children: [
          // 域名入口：登录即工作台（06 A1-4：脚手架首页已删，/ 固定落 /my）
          { index: true, element: <Navigate to="/my" replace /> },
          // doc §6 页面表：/doc → /doc/my；生成器只认页面注解，不做重定向声明
          { path: 'doc', element: <Navigate to="/doc/my" replace /> },
          // org 卡 §6（2026-09-20 合并）：原「角色管理」列表页已并入 /admin/roles 的「角色」页签，旧书签/外链不 404
          { path: 'org/groups', element: <Navigate to="/admin/roles?tab=roles" replace /> },
          ...gated.map(toChild),
        ],
      },
    ],
  },
])

export function AppRouter() {
  useEffect(() => {
    const onSessionExpired = (): void => {
      void router.navigate('/login')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
  }, [])
  return <RouterProvider router={router} />
}
