import {
  AutoComplete,
  Button,
  Flex,
  hasPerm,
  Input,
  SearchOutlined,
  Typography,
  usePrivileges,
} from '@zentao/design-system'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import type { NavigationGroup, NavigationItem } from './app-layout'
import { isSection } from './app-layout'

/** 命中上限：侧栏搜索是「快速跳页」，不是检索系统——超过 10 条应改用更具体的关键词。 */
const MAX_HITS = 10

export type NavSearchHit = { path: string; title: string; group: string }

/**
 * 导航搜索（UI 三项修订 2026-09-20）：**只搜菜单与页面**——按当前语言的菜单名/组名做包含匹配，
 * 命中即跳该路由。不再检索业务对象（那是各列表页筛选的职责，混在一起反而找不到页面）；
 * 纯前端过滤（导航树就在手边，无网络往返、无防抖），只列权限内的项（无码页搜不到，避免点进 403）。
 * 三级结构（用户裁决 2026-09-20）下分区名同样参与匹配，命中项的位置标注为「组 / 分区」。
 */
export function filterNavigation(
  navigation: NavigationGroup[],
  keyword: string,
  translate: (key: string) => string,
  visible: (perm: string | undefined) => boolean,
): NavSearchHit[] {
  const query = keyword.trim().toLowerCase()
  if (query === '') return []
  const hits: NavSearchHit[] = []
  const push = (item: NavigationItem, location: string, inheritedHit: boolean): boolean => {
    if (!visible(item.perm)) return false
    const title = translate(item.title)
    if (!inheritedHit && !title.toLowerCase().includes(query)) return false
    hits.push({ path: item.path, title, group: location })
    return hits.length === MAX_HITS
  }
  for (const group of navigation) {
    const groupTitle = translate(group.title)
    const groupHit = groupTitle.toLowerCase().includes(query)
    for (const node of group.children) {
      if (isSection(node)) {
        const sectionTitle = translate(node.title)
        const sectionHit = groupHit || sectionTitle.toLowerCase().includes(query)
        for (const item of node.children) {
          if (push(item, `${groupTitle} / ${sectionTitle}`, sectionHit)) return hits
        }
        continue
      }
      if (push(node, groupTitle, groupHit)) return hits
    }
  }
  return hits
}

export function GlobalSearch({
  navigation,
  collapsed = false,
  onExpand,
}: {
  navigation: NavigationGroup[]
  /** 收起态：搜索框放不下，退化为图标钮（点击先展开侧栏）。 */
  collapsed?: boolean
  onExpand?: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const privileges = usePrivileges()
  const [keyword, setKeyword] = useState('')

  const options = useMemo(
    () =>
      filterNavigation(navigation, keyword, t, (perm) => !perm || hasPerm(privileges, perm)).map((hit) => ({
        value: hit.path,
        label: (
          <Flex align="center" justify="space-between" gap={8}>
            <Typography.Text ellipsis>{hit.title}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {hit.group}
            </Typography.Text>
          </Flex>
        ),
      })),
    [navigation, keyword, t, privileges],
  )

  if (collapsed) {
    return (
      <Button
        type="text"
        block
        aria-label={t('platform.search.placeholder')}
        icon={<SearchOutlined />}
        onClick={onExpand}
      />
    )
  }

  return (
    <AutoComplete
      style={{ width: '100%' }}
      value={keyword}
      onChange={setKeyword}
      options={options}
      filterOption={false}
      notFoundContent={
        keyword.trim() === '' ? null : (
          <Typography.Text type="secondary">{t('platform.search.noResults')}</Typography.Text>
        )
      }
      onSelect={(path) => {
        void navigate(path)
        setKeyword('')
      }}
    >
      <Input
        allowClear
        prefix={<SearchOutlined />}
        maxLength={60}
        placeholder={t('platform.search.placeholder')}
        aria-label={t('platform.search.placeholder')}
      />
    </AutoComplete>
  )
}
