import type { RouteEntry } from '@zentao/api-client/generated/model/routeEntry'
import { Result } from '@zentao/design-system'
import { type ComponentType, type LazyExoticComponent, type ReactNode, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import type { RouteObject } from 'react-router'
import { generatedRoutes, pageComponents } from './routes'

/**
 * 动态路由（T26）：路由表由后端下发（`GET /menus/routes`：内置基线 + 菜单管理的 DB 覆盖），
 * 组件实现只能来自代码——按 `component` 名从生成的组件表 {@link pageComponents} 里取。
 *
 * 于是：**路径与层级是数据**（管理端改菜单即时生效），**页面实现是代码**（只能从已有页面里选）。
 * 这正是「动态路由，不是硬编码」的分界线：前端不再把 path 写死在路由文件里。
 *
 * 取不到路由表（未登录/首屏/接口失败/离线）时回落 {@link generatedRoutes}——那是同一份基线生成的
 * 静态表，与后端基线同源，故回落不是降级而是同一条数据的另一条来源。
 */
export function buildRoutes(routes: readonly RouteEntry[]): RouteObject[] {
  const items = routes.filter((route) => route.component !== null && route.component !== undefined)
  if (items.length === 0) {
    return generatedRoutes
  }
  const built: RouteObject[] = []
  for (const route of items) {
    const Component = pageComponents[route.component]
    if (Component === undefined) {
      // 后端认识这个路径但代码里没有这个组件（旧前端 + 新菜单）：给一句人话，而不是白屏
      built.push({ path: route.path, element: <MissingComponent name={route.component} /> })
      continue
    }
    built.push({
      path: route.path,
      element: <LazyRoute Component={Component} />,
      handle: { title: route.title, perm: route.perm ?? undefined },
    })
  }
  return built
}

/** 后端认识这个路径、代码里却没有这个组件（旧前端 + 新菜单）：给一句人话，而不是白屏。 */
function MissingComponent({ name }: { name: string }): ReactNode {
  const { t } = useTranslation()
  return <Result status="404" title={name} subTitle={t('platform.menu.missingComponent')} />
}

/** 懒加载壳：与生成表里的 withSuspense 同款（页面组件是 lazy() 出来的）。 */
function LazyRoute({ Component }: { Component: LazyExoticComponent<ComponentType> }): ReactNode {
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  )
}
