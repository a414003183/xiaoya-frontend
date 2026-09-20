import { describe, expect, it } from 'vitest'
import { ancestorKeys, isSection, type NavigationGroup, resolveActiveMenu, resolveBackTarget } from './app-layout'

const map = {
  '/bugs/:bugId': '/products',
  '/products/:productId/bugs': '/products',
  '/org/accounts/:accountId': '/org/accounts',
  '/my/profile': '/my',
}

describe('resolveActiveMenu（06 A1-3 选中态派生）', () => {
  it('静态路径直查映射表', () => {
    expect(resolveActiveMenu('/my/profile', map)).toBe('/my')
  })

  it('带参路由按模式匹配具体 URL', () => {
    expect(resolveActiveMenu('/bugs/5', map)).toBe('/products')
    expect(resolveActiveMenu('/products/12/bugs', map)).toBe('/products')
    expect(resolveActiveMenu('/org/accounts/33', map)).toBe('/org/accounts')
  })

  it('多模式命中时最长模式优先', () => {
    const both = { '/bugs/:bugId': '/products', '/bugs/:bugId/edit': '/bugs-edit' }
    expect(resolveActiveMenu('/bugs/9/edit', both)).toBe('/bugs-edit')
    expect(resolveActiveMenu('/bugs/9', both)).toBe('/products')
  })

  it('无匹配返回 undefined（页面不点亮菜单）', () => {
    expect(resolveActiveMenu('/search', map)).toBeUndefined()
    expect(resolveActiveMenu('/bugs/5/extra', map)).toBeUndefined()
  })
})

describe('resolveBackTarget（06 A5-2 V-03 筛选状态保持；标签身份=路径名）', () => {
  const tabs = [
    { key: '/products', href: '/products?status=all' },
    { key: '/products/9', href: '/products/9' },
    { key: '/org/accounts', href: '/org/accounts?page=2' },
  ]

  it('命中该页标签时返回其最后一次 URL（含筛选参数）', () => {
    expect(resolveBackTarget('/products', tabs)).toBe('/products?status=all')
    expect(resolveBackTarget('/org/accounts', tabs)).toBe('/org/accounts?page=2')
  })

  it('无匹配回落静态路径', () => {
    expect(resolveBackTarget('/projects', tabs)).toBe('/projects')
  })

  it('精确匹配：/product 不吞 /products，子路径不算同页', () => {
    expect(resolveBackTarget('/product', tabs)).toBe('/product')
    expect(resolveBackTarget('/products/9/stories', tabs)).toBe('/products/9/stories')
  })
})

describe('三级导航（用户裁决 2026-09-20：组 → 分区 → 项，两级都内联下拉）', () => {
  const navigation: NavigationGroup[] = [
    {
      key: 'admin',
      title: 'nav.group.admin',
      icon: 'SettingOutlined',
      children: [
        { path: '/admin/settings', title: 'platform.settings.title', order: 1 },
        {
          key: 'admin/lang',
          title: 'nav.section.adminLang',
          order: 2,
          children: [
            { path: '/admin/lang-items', title: 'platform.lang.title', order: 1 },
            { path: '/admin/lang-upload', title: 'platform.langUpload.title', order: 2 },
          ],
        },
        { path: '/admin/roles', title: 'org.role.title', order: 4 },
      ],
    },
    {
      key: 'org',
      title: 'nav.group.org',
      children: [{ path: '/org/accounts', title: 'org.accounts.title', order: 1 }],
    },
  ]

  const adminChildren = navigation[0]?.children ?? []

  it('分区与叶子项靠 children/path 判别（生成器保证互斥）', () => {
    expect(adminChildren.map(isSection)).toEqual([false, true, false])
  })

  it('分区内叶子返回「组 + 分区」祖先链（选中项所在分区自动展开）', () => {
    expect(ancestorKeys(navigation, '/admin/lang-upload')).toEqual(['admin', 'admin/lang'])
  })

  it('组直属叶子只返回组键', () => {
    expect(ancestorKeys(navigation, '/admin/roles')).toEqual(['admin'])
    expect(ancestorKeys(navigation, '/org/accounts')).toEqual(['org'])
  })

  it('不在导航树里的路径返回空（页面不展开任何组）', () => {
    expect(ancestorKeys(navigation, '/bugs/1')).toEqual([])
    expect(ancestorKeys(navigation, '/admin/lang-missing')).toEqual([])
  })
})
