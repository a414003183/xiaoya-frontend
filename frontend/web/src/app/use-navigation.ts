import { useQuery } from '@tanstack/react-query'
import type { MenuNode } from '@zentao/api-client/generated/model/menuNode'
import type { NavigationGroup, NavigationItem, NavigationSection } from '@zentao/app-shell'
import { fetchMyMenus, MY_MENUS_KEY } from '../features/platform'
import { navigation as staticNavigation } from './routes'

/**
 * 侧栏菜单源（T19 P2-1）：`GET /menus/my`（内置基线 + DB 覆盖合并；服务端已按调用者权限码过滤）
 * 为主，读不到（首屏加载中 / 接口失败 / 未登录）就回落代码生成的静态 `navigation`。
 *
 * 两条路在「没有 DB 覆盖」时等价——后端基线就是同一批页面注解生成的（menu/navigation.json），
 * 故回落不是降级，而是同一份数据的另一条来源。
 *
 * ponytail: 菜单不进全局搜索以外的缓存策略——react-query 默认缓存 + 管理页改完菜单后失效
 * MY_MENUS_KEY（见 menu-form-modal）。
 */
export function useNavigation(): NavigationGroup[] {
  const menus = useQuery({ queryKey: MY_MENUS_KEY, queryFn: fetchMyMenus, staleTime: Number.POSITIVE_INFINITY })
  return menus.data === undefined ? staticNavigation : toNavigation(menus.data.items)
}

/** 内置组图标来自静态 navigation（route-codegen 的 GROUP_META，也是后端基线 JSON 里的 icon 字段）；
 *  这里留一份是为了 API 树没带图标时兜底（真机踩过：丢了图标，左栏从图标退回纯文字）。 */
const STATIC_GROUP_ICONS = new Map(staticNavigation.map((group) => [group.key, group.icon]))

/**
 * API 树 → app-shell 的 navigation 形状：字段名差异（orderNo → order、path 可空 → 必填）加组图标回填，
 * 结构上都是「组 →（分区 →）项」。容器键与叶子路径原样带过，菜单高亮与自动展开都靠它们。
 */
export function toNavigation(groups: MenuNode[]): NavigationGroup[] {
  return groups.map((group) => {
    // T21：一级模块可由菜单管理页新建并配图标，故以菜单行里的 icon 为准，静态表只兜底
    const icon = group.icon ?? STATIC_GROUP_ICONS.get(group.key)
    return {
      key: group.key,
      title: group.title,
      // 按需展开（exactOptionalPropertyTypes：显式 undefined 不是合法 prop 值）
      ...(icon === undefined ? {} : { icon }),
      children: group.children.map((child) => (child.kind === 'section' ? toSection(child) : toItem(child))) as (
        | NavigationItem
        | NavigationSection
      )[],
    }
  })
}

function toSection(section: MenuNode): NavigationSection {
  return {
    key: section.key,
    title: section.title,
    order: section.orderNo,
    children: section.children.map(toItem),
  }
}

function toItem(item: MenuNode): NavigationItem {
  return {
    path: item.path ?? item.key,
    title: item.title,
    order: item.orderNo,
    ...(item.perm === null || item.perm === undefined ? {} : { perm: item.perm }),
  }
}
