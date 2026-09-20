import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from './ui-store'

const state = () => useUiStore.getState()

beforeEach(() => {
  useUiStore.setState({ tabs: [], activeTabKey: null })
})

describe('多标签 store（06 A1-6 开关/激活逻辑；2026-09-19 标签身份改路径名）', () => {
  it('openTab：新路径追加并激活，重复路径只激活不重复开', () => {
    state().openTab({ key: '/products', href: '/products', titleKey: 'a' })
    state().openTab({ key: '/bugs/9', href: '/bugs/9', titleKey: 'b' })
    state().openTab({ key: '/products', href: '/products', titleKey: 'a' })
    expect(state().tabs.map((tab) => tab.key)).toEqual(['/products', '/bugs/9'])
    expect(state().activeTabKey).toBe('/products')
  })

  it('同一页面换筛选/翻页/切页内页签不新开标签，href 更新为最新 URL', () => {
    state().openTab({ key: '/my/bugs', href: '/my/bugs', titleKey: 'a' })
    state().openTab({ key: '/my/bugs', href: '/my/bugs?role=resolver', titleKey: 'a' })
    state().openTab({ key: '/my/bugs', href: '/my/bugs?role=resolver&page=2', titleKey: 'a' })
    expect(state().tabs).toHaveLength(1)
    expect(state().tabs[0]?.href).toBe('/my/bugs?role=resolver&page=2')
  })

  it('closeTab：关激活 tab 接管左侧邻居，全关返回 null', () => {
    state().openTab({ key: '/products', href: '/products', titleKey: 'a' })
    state().openTab({ key: '/projects', href: '/projects?page=2', titleKey: 'b' })
    state().openTab({ key: '/bugs/9', href: '/bugs/9', titleKey: 'c' })
    expect(state().closeTab('/bugs/9')).toBe('/projects')
    expect(state().activeTabKey).toBe('/projects')
    expect(state().closeTab('/projects')).toBe('/products')
    expect(state().closeTab('/products')).toBeNull()
    expect(state().tabs).toEqual([])
  })

  it('closeTab：关非激活 tab 不改变激活态', () => {
    state().openTab({ key: '/products', href: '/products', titleKey: 'a' })
    state().openTab({ key: '/projects', href: '/projects', titleKey: 'b' })
    expect(state().closeTab('/products')).toBe('/projects')
    expect(state().activeTabKey).toBe('/projects')
  })

  it('closeAll：清空全部标签并清掉激活态', () => {
    state().openTab({ key: '/a', href: '/a', titleKey: 'a' })
    state().openTab({ key: '/b', href: '/b?page=2', titleKey: 'b' })
    expect(state().closeAll()).toBeNull()
    expect(state().tabs).toEqual([])
    expect(state().activeTabKey).toBeNull()
  })

  it('closeOthers/closeRight：收敛到目标 tab', () => {
    state().openTab({ key: '/a', href: '/a', titleKey: 'a' })
    state().openTab({ key: '/b', href: '/b', titleKey: 'b' })
    state().openTab({ key: '/c', href: '/c', titleKey: 'c' })
    state().closeOthers('/b')
    expect(state().tabs.map((tab) => tab.key)).toEqual(['/b'])
    state().openTab({ key: '/d', href: '/d', titleKey: 'd' })
    state().openTab({ key: '/e', href: '/e', titleKey: 'e' })
    state().closeRight('/d')
    expect(state().tabs.map((tab) => tab.key)).toEqual(['/b', '/d'])
    expect(state().activeTabKey).toBe('/d')
  })
})
