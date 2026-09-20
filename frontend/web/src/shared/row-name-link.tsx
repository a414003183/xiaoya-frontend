/**
 * 列表「名称」列的详情入口（用户要求 2026-09-20：列表页点名称即进详情，操作列不再重复「详情」）。
 *
 * 为什么是共享件而不是各页继续写 `<Typography.Link onClick={…}>`：那套写法渲染的 `<a>` 没有 href，
 * 不可 Tab 聚焦、Enter 无效（键盘用户只能走已删掉的「详情」按钮）。本件保留 antd 链接外观（Typography.Link），
 * 但落一个真 `href`：可聚焦/回车可开/右键与 Ctrl·中键可新窗口，普通左键才拦成 SPA 导航。
 * 各页名称单元格一律用它，形状（含名称旁的标签）仍由各页自己排。
 */
import { Typography } from '@zentao/design-system'
import type { MouseEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router'

export function RowNameLink({ to, children }: { to: string; children: ReactNode }) {
  const navigate = useNavigate()

  return (
    <Typography.Link
      href={to}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        // 修饰键/中键：留给浏览器（新标签页、新窗口）；只有普通左键走 SPA 导航
        if (event.defaultPrevented || event.button !== 0) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </Typography.Link>
  )
}
