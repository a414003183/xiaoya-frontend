import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'

export type TabEntry = {
  /** 标签身份 = 路径名（不含 query）：同一页面的不同查询/页内页签不新开标签（用户裁决 2026-09-19）。 */
  key: string
  /** 该标签最后一次的完整 URL（含查询）：切回标签时恢复筛选/分页（06 A5-2 V-03）。 */
  href: string
  titleKey: string
}

/**
 * 客户端 UI 状态（01 §3.3 / 06 A1-3/A1-6）：主题三态（亮/暗/跟随系统）、侧栏折叠、菜单展开组、
 * 多标签页。persist 到 localStorage（06 D-A10：UI 偏好统一收口本 store；density 已按 D-A10 删除）。
 *
 * 多标签（06 A1-6 降级口径，STATE 已登记）：tab = 页面 + URL 态（筛选/分页在 query string，切回即恢复）
 * + 每 tab 滚动位置保存恢复（AppLayout 内 ref，会话级）；不做组件级保活——react-router 单 location
 * 模型下跨路由保活需接管路由渲染（每 tab 独立 MemoryRouter + 导航桥接），风险不成比例。
 */
type UiState = {
  themeMode: ThemeMode
  siderCollapsed: boolean
  openKeys: string[]
  tabs: TabEntry[]
  activeTabKey: string | null
  setThemeMode: (themeMode: ThemeMode) => void
  toggleSiderCollapsed: () => void
  setSiderCollapsed: (siderCollapsed: boolean) => void
  setOpenKeys: (openKeys: string[]) => void
  openTab: (tab: TabEntry) => void
  closeTab: (key: string) => string | null
  /** 全部关闭：标签清空，返回应落位的工作台路径（null = 无标签）。 */
  closeAll: () => null
  closeOthers: (key: string) => void
  closeRight: (key: string) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      themeMode: 'light',
      siderCollapsed: false,
      openKeys: [],
      tabs: [],
      activeTabKey: null,
      setThemeMode: (themeMode) => set({ themeMode }),
      toggleSiderCollapsed: () => set((state) => ({ siderCollapsed: !state.siderCollapsed })),
      setSiderCollapsed: (siderCollapsed) => set({ siderCollapsed }),
      setOpenKeys: (openKeys) => set({ openKeys }),
      openTab: (tab) =>
        set((state) => ({
          tabs: state.tabs.some((entry) => entry.key === tab.key)
            ? state.tabs.map((entry) => (entry.key === tab.key ? tab : entry))
            : [...state.tabs, tab],
          activeTabKey: tab.key,
        })),
      // 关闭返回「应接管的邻居 key」（主流交互：接管左侧邻近 tab；全关返回 null → 调用方落 /my）
      closeTab: (key) => {
        const { tabs, activeTabKey } = get()
        const index = tabs.findIndex((entry) => entry.key === key)
        if (index < 0) return activeTabKey
        const next = tabs.filter((_, i) => i !== index)
        const fallback = next[Math.min(Math.max(index - 1, 0), next.length - 1)]?.key ?? null
        set({
          tabs: next,
          activeTabKey: activeTabKey === key ? fallback : activeTabKey,
        })
        return activeTabKey === key ? fallback : activeTabKey
      },
      closeOthers: (key) => set({ tabs: get().tabs.filter((entry) => entry.key === key), activeTabKey: key }),
      closeAll: () => {
        set({ tabs: [], activeTabKey: null })
        return null
      },
      closeRight: (key) => {
        const { tabs, activeTabKey } = get()
        const index = tabs.findIndex((entry) => entry.key === key)
        const next = tabs.slice(0, index + 1)
        set({
          tabs: next,
          activeTabKey: next.some((entry) => entry.key === activeTabKey) ? activeTabKey : key,
        })
      },
    }),
    {
      name: 'zentao-ui',
      version: 2,
      /* v1→v2：标签身份从「路径+查询」改为「路径」（href 另存完整 URL）。旧标签是脏数据（同一页多条），丢弃重建。 */
      migrate: (persisted, version) =>
        version < 2
          ? { ...(persisted as Record<string, unknown>), tabs: [], activeTabKey: null }
          : (persisted as Record<string, unknown>),
      partialize: (state) => ({
        themeMode: state.themeMode,
        siderCollapsed: state.siderCollapsed,
        openKeys: state.openKeys,
        tabs: state.tabs,
        activeTabKey: state.activeTabKey,
      }),
    },
  ),
)

/** 解析后的有效主题：system 跟随 prefers-color-scheme（含运行期变更订阅），供 ConfigProvider algorithm 消费。 */
export function useResolvedThemeMode(): 'light' | 'dark' {
  const themeMode = useUiStore((state) => state.themeMode)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  if (themeMode === 'system') return systemDark ? 'dark' : 'light'
  return themeMode
}
