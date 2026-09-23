import {
  AppstoreOutlined,
  BarChartOutlined,
  BellOutlined,
  BookOutlined,
  BugOutlined,
  CalendarOutlined,
  CloudOutlined,
  ClusterOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  DesktopOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  FolderOutlined,
  GlobalOutlined,
  HomeOutlined,
  ProductOutlined,
  ProjectOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SettingOutlined,
  SolutionOutlined,
  TagsOutlined,
  TeamOutlined,
  ToolOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons'
import type { ComponentType } from 'react'

/**
 * 菜单图标登记表（T21）：菜单里存的图标是一个**名字**（字符串），渲染时在这里查组件。
 *
 * 名字表是唯一事实源：菜单管理页的图标选择器只列这里的键，侧栏与菜单表单都用 {@link MenuIcon} 渲染，
 * 于是「选了图标但侧栏不显示」不可能发生（两处查同一张表）。新增图标：这里加一行即可。
 */
export const MENU_ICONS: Record<string, ComponentType> = {
  AppstoreOutlined,
  BarChartOutlined,
  BellOutlined,
  BookOutlined,
  BugOutlined,
  CalendarOutlined,
  CloudOutlined,
  ClusterOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  DesktopOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  FolderOutlined,
  GlobalOutlined,
  HomeOutlined,
  ProductOutlined,
  ProjectOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SettingOutlined,
  SolutionOutlined,
  TagsOutlined,
  TeamOutlined,
  ToolOutlined,
  TrophyOutlined,
  UserOutlined,
}

/** 可选图标名（图标选择器的选项；按字母序，便于找）。 */
export const MENU_ICON_NAMES = Object.keys(MENU_ICONS).sort()

/** 图标名 → 元素；名字为空或未登记时返回 null（不显示图标，不是报错）。 */
export function MenuIcon({ name }: { name?: string | null | undefined }) {
  const Icon = name === undefined || name === null ? undefined : MENU_ICONS[name]
  return Icon === undefined ? null : <Icon />
}
