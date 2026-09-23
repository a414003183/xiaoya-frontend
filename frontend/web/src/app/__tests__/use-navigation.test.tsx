import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import type { NavigationGroup } from '@zentao/app-shell'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../mocks/db'
import { handlers } from '../../mocks/handlers'
import { navigation as staticNavigation } from '../routes'
import { toNavigation, useNavigation } from '../use-navigation'

/**
 * 侧栏菜单源（T19 P2-1）：`GET /menus/my` 为主、静态 `navigation` 回落。
 * 这里锁两条：形状映射（orderNo → order、可空 path → 必填）与「读不到就用静态」的回退契约——
 * 回退是壳层不空的关键（菜单接口挂了侧栏也得在）。
 */
initI18n()

const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/** 探针组件：把钩子结果打平成可断言的文本。 */
function Probe() {
  const navigation = useNavigation()
  return <pre data-testid="nav">{JSON.stringify(navigation)}</pre>
}

function renderProbe() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <Probe />
    </QueryClientProvider>,
  )
}

describe('useNavigation（/menus/my 为主，静态回落）', () => {
  test('toNavigation：分区与叶子分别映射，perm 为空不落字段', () => {
    const groups = toNavigation([
      {
        key: 'admin',
        kind: 'group',
        title: 'nav.group.admin',
        path: null,
        orderNo: 0,
        perm: null,
        status: 'active',
        children: [
          {
            key: 'admin/system',
            kind: 'section',
            title: 'nav.section.adminSystem',
            path: null,
            orderNo: 1,
            perm: null,
            status: 'active',
            children: [
              {
                key: '/admin/dicts',
                kind: 'item',
                title: 'platform.dict.title',
                path: '/admin/dicts',
                orderNo: 3,
                perm: 'setting-manage',
                status: 'active',
                children: [],
              },
            ],
          },
          {
            key: '/my',
            kind: 'item',
            title: 'workspace.title.dashboard',
            path: '/my',
            orderNo: 1,
            perm: null,
            status: 'active',
            children: [],
          },
        ],
      },
    ])

    expect(groups).toEqual([
      {
        key: 'admin',
        title: 'nav.group.admin',
        // 组图标从静态 navigation 回填（API 树不带图标；不回填左栏会从图标退回纯文字）
        icon: staticNavigation.find((group) => group.key === 'admin')?.icon,
        children: [
          {
            key: 'admin/system',
            title: 'nav.section.adminSystem',
            order: 1,
            children: [{ path: '/admin/dicts', title: 'platform.dict.title', order: 3, perm: 'setting-manage' }],
          },
          { path: '/my', title: 'workspace.title.dashboard', order: 1 },
        ],
      },
    ])
  })

  test('接口成功：侧栏用后端下发的树（覆盖行改名后，菜单标题跟着变）', async () => {
    db.menus.push({
      id: 5,
      nodeKey: '/admin/dicts',
      parentKey: 'admin/system',
      nodeType: 'menu',
      title: '数据字典',
      component: null,
      path: '/admin/dicts',
      icon: null,
      orderNo: 3,
      perm: 'setting-manage',
      status: 'active',
    })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('nav').textContent).toContain('数据字典'))
    expect(screen.getByTestId('nav').textContent).not.toContain('platform.dict.title')
  })

  test('接口失败：回落到静态 navigation（侧栏不空，形状一致）', async () => {
    server.use(http.get('*/api/v1/menus/my', () => new HttpResponse(null, { status: 500 })))
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('nav').textContent).toContain('nav.group.admin'))
    const rendered = JSON.parse(screen.getByTestId('nav').textContent ?? '[]') as NavigationGroup[]
    expect(rendered.map((group) => group.key)).toEqual(staticNavigation.map((group) => group.key))
  })
})
