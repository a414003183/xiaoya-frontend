// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import type { NavigationGroup } from './app-layout'
import { filterNavigation } from './global-search'

const navigation: NavigationGroup[] = [
  {
    key: 'org',
    title: 'nav.group.org',
    icon: 'TeamOutlined',
    children: [
      { path: '/org/accounts', title: '账号列表', perm: 'account-view', order: 1 },
      { path: '/org/groups', title: '角色管理', perm: 'group-view', order: 2 },
    ],
  },
  {
    key: 'product',
    title: 'nav.group.product',
    children: [{ path: '/products', title: '产品列表', perm: 'product-view', order: 1 }],
  },
]
const translate = (key: string) => key
const allVisible = () => true

describe('侧栏导航搜索（UI 三项修订 2026-09-20：只搜菜单与页面）', () => {
  it('空关键词不出候选（不打扰）', () => {
    expect(filterNavigation(navigation, '   ', translate, allVisible)).toEqual([])
  })

  it('按菜单名包含匹配，命中项带所属分组名', () => {
    const hits = filterNavigation(navigation, '角色', translate, allVisible)
    expect(hits).toEqual([{ path: '/org/groups', title: '角色管理', group: 'nav.group.org' }])
  })

  it('组名命中时列出该组全部项（按「组织」找得到账号列表）', () => {
    const hits = filterNavigation(navigation, 'nav.group.org', translate, allVisible)
    expect(hits.map((hit) => hit.path)).toEqual(['/org/accounts', '/org/groups'])
  })

  it('大小写无关匹配英文关键字', () => {
    const english: NavigationGroup[] = [
      { key: 'p', title: 'Products', children: [{ path: '/products', title: 'Product List', order: 1 }] },
    ]
    expect(filterNavigation(english, 'product', (key) => key, allVisible).map((hit) => hit.path)).toEqual(['/products'])
  })

  it('无权限的页面不出现在候选（避免搜到点进去 403）', () => {
    const visible = (perm: string | undefined) => perm !== 'group-view'
    expect(filterNavigation(navigation, '角色', translate, visible)).toEqual([])
  })

  it('命中数封顶 10 条（快速跳页，不是检索系统）', () => {
    const many: NavigationGroup[] = [
      {
        key: 'x',
        title: 'x',
        children: Array.from({ length: 25 }, (_, index) => ({
          path: `/x/${index}`,
          title: `页面 ${index}`,
          order: index,
        })),
      },
    ]
    expect(filterNavigation(many, '页面', translate, allVisible)).toHaveLength(10)
  })

  it('三级导航：分区下的页面能搜到，位置标注为「组 / 分区」', () => {
    const nested: NavigationGroup[] = [
      {
        key: 'admin',
        title: '系统',
        children: [
          {
            key: 'admin/lang',
            title: '多语言',
            order: 2,
            children: [{ path: '/admin/lang-upload', title: '多语言上传', order: 2 }],
          },
        ],
      },
    ]
    expect(filterNavigation(nested, '上传', (key) => key, allVisible)).toEqual([
      { path: '/admin/lang-upload', title: '多语言上传', group: '系统 / 多语言' },
    ])
  })

  it('三级导航：分区名命中时列出分区内全部项', () => {
    const nested: NavigationGroup[] = [
      {
        key: 'admin',
        title: '系统',
        children: [
          {
            key: 'admin/lang',
            title: '多语言',
            order: 2,
            children: [
              { path: '/admin/lang-items', title: '文案覆盖', order: 1 },
              { path: '/admin/lang-upload', title: '多语言上传', order: 2 },
            ],
          },
        ],
      },
    ]
    expect(filterNavigation(nested, '多语言', (key) => key, allVisible).map((hit) => hit.path)).toEqual([
      '/admin/lang-items',
      '/admin/lang-upload',
    ])
  })

  it('三级导航：分区内无权限的项不出现在候选', () => {
    const nested: NavigationGroup[] = [
      {
        key: 'admin',
        title: '系统',
        children: [
          {
            key: 'admin/lang',
            title: '多语言',
            order: 2,
            children: [{ path: '/admin/lang-upload', title: '多语言上传', perm: 'lang-manage', order: 2 }],
          },
        ],
      },
    ]
    expect(
      filterNavigation(
        nested,
        '上传',
        (key) => key,
        (perm) => perm !== 'lang-manage',
      ),
    ).toEqual([])
  })
})
