import { ConfigProvider, Dropdown, Flex, Tabs, type TabsProps } from '@zentao/design-system'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useUiStore } from './ui-store'

/**
 * 多标签条（06 A1-6）：antd Tabs `editable-card`——激活页签带主色描边，点击激活、行内关闭，
 * 右键菜单支持关闭/关闭其他/关闭右侧/关闭全部（antd Tabs + Dropdown 官方组件面，不自绘标签）。
 *
 * 位置（UI 三项修订 2026-09-20）：**右侧内容列的顶部**，只覆盖页面区、不横跨侧栏；
 * 侧栏自身承载品牌与菜单，故整屏只有这一层浏览器 chrome（原「标题栏 + 标签条」两行合一）。
 * 规则：登录页不入 tab；关闭激活 tab 接管左侧邻居，全关落 /my。
 * 一个页面一个标签：标签身份是路径名，点击回到该标签最后一次的 URL（href，含筛选/分页）。
 * horizontalMargin 归零：标签条是独立导航层，不吃 antd 页签默认的 16px 下边距。
 */
export function TabBar({ extra }: { extra?: ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const tabs = useUiStore((state) => state.tabs)
  const activeTabKey = useUiStore((state) => state.activeTabKey)
  const closeTab = useUiStore((state) => state.closeTab)
  const closeAll = useUiStore((state) => state.closeAll)
  const closeOthers = useUiStore((state) => state.closeOthers)
  const closeRight = useUiStore((state) => state.closeRight)

  /* 无已开页签时页签区留空，但右端工具区照常渲染（通知/语言/主题/头像常驻，用户裁决 2026-09-20） */
  if (tabs.length === 0) {
    return (
      <Flex justify="flex-end" align="center" gap={4} style={{ width: '100%' }}>
        {extra}
      </Flex>
    )
  }

  /** 关闭后落位：接管邻居标签时走它的 href（恢复该页原筛选），无邻居则回工作台。 */
  const fallbackHref = (key: string | null): string => tabs.find((tab) => tab.key === key)?.href ?? '/my'

  const onClose = (key: string): void => {
    const fallback = closeTab(key)
    if (key === activeTabKey) void navigate(fallbackHref(fallback))
  }

  const onCloseAll = (): void => {
    closeAll()
    void navigate('/my')
  }

  const items: TabsProps['items'] = tabs.map((tab) => ({
    key: tab.key,
    closable: true,
    label: (
      <Dropdown
        trigger={['contextMenu']}
        menu={{
          items: [
            { key: 'close', label: t('nav.tabs.close') },
            { key: 'closeOthers', label: t('nav.tabs.closeOthers') },
            { key: 'closeRight', label: t('nav.tabs.closeRight') },
            { type: 'divider' },
            { key: 'closeAll', label: t('nav.tabs.closeAll') },
          ],
          onClick: ({ key }) => {
            if (key === 'close') onClose(tab.key)
            if (key === 'closeOthers') closeOthers(tab.key)
            if (key === 'closeRight') closeRight(tab.key)
            if (key === 'closeAll') onCloseAll()
          },
        }}
      >
        <span>{t(tab.titleKey)}</span>
      </Dropdown>
    ),
  }))

  return (
    <ConfigProvider theme={{ components: { Tabs: { horizontalMargin: '0' } } }}>
      <Flex align="center" gap={16} style={{ width: '100%', minWidth: 0 }}>
        <Tabs
          type="editable-card"
          hideAdd
          /* 页签间距（用户裁决 2026-09-20 二次修订：原来挨得太近） */
          tabBarGutter={12}
          style={{ flex: '1 1 auto', minWidth: 0 }}
          {...(activeTabKey !== null ? { activeKey: activeTabKey } : {})}
          items={items}
          onChange={(key) => void navigate(fallbackHref(key))}
          onEdit={(targetKey, action) => {
            if (action === 'remove') onClose(String(targetKey))
          }}
        />
        {extra !== undefined && (
          <Flex align="center" gap={4} style={{ flexShrink: 0 }}>
            {extra}
          </Flex>
        )}
      </Flex>
    </ConfigProvider>
  )
}
