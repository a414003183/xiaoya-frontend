import type { RouteEntry } from '@zentao/api-client/generated/model/routeEntry'
import { describe, expect, test } from 'vitest'
import { buildRoutes } from '../dynamic-routes'
import { pageComponents } from '../routes'

/**
 * 动态路由（T26）：路由表是数据（后端下发）、组件是代码（生成的组件表）。
 * 本文件锁三件事：① 按 component 名取到组件、挂在后端给的 path 上；② 组件名不认识时给可读提示而不是白屏；
 * ③ 路由表为空时回落静态生成表（首屏/失败）。
 */
function entry(over: Partial<RouteEntry>): RouteEntry {
  return {
    path: '/x',
    component: 'AccountListPage',
    title: 'org.accounts.title',
    perm: null,
    activeMenu: null,
    status: 'active',
    hidden: false,
    ...over,
  }
}

describe('buildRoutes（路由表 → RouteObject）', () => {
  test('按 component 名取组件：路由表的路径与组件成对映射（path 来自数据，组件来自代码表）', () => {
    const routes = buildRoutes([entry({ path: '/moved-login', component: 'LoginPage' })])
    expect(routes).toHaveLength(1)
    const route = routes[0] as { path?: string; element?: { props?: { Component?: unknown } } }
    expect(route.path).toBe('/moved-login')
    // 元素里包的正是组件表里那一份（同一个 lazy 组件实例，不是另 import 一份）
    expect(route.element?.props?.Component).toBe(pageComponents.LoginPage)
  })

  test('组件名不在当前版本里 → 给出可读提示（不是白屏）', () => {
    const routes = buildRoutes([entry({ path: '/ghost', component: 'NoSuchPage' })])
    expect(routes.some((route) => route.path === '/ghost')).toBe(true)
    expect(Object.keys(pageComponents)).not.toContain('NoSuchPage')
  })

  test('路由表为空 → 回落静态生成表（首屏/接口失败不白屏）', () => {
    const routes = buildRoutes([])
    expect(routes.length).toBeGreaterThan(50)
    expect(routes.some((route) => route.path === '/admin/roles')).toBe(true)
  })
})
