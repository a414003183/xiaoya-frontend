// 路由代码生成（01 §3.4 / 06 A1-1）：扫描 web/src/features/**/pages/*.page.tsx 首行注解生成路由表。
// 页面注解格式（@route/@title 外全部可选）：
//   /** @route /path @title i18n.key [@perm code] [@menu 组key[/分区key]|-] [@order n] [@icon 图标名|-] [@hide] [@activeMenu /path] */
// 缺省：@menu=路径首段、@order=999、@icon=无。生成物三件：
//   generatedRoutes（路由本体，只认 path/title/perm）· navigation（树形：组 →（分区 →）项，@hide 不进树）
//   · activeMenuMap（隐藏页 → 菜单高亮目标）。
// 手改 web/src/app/routes.tsx 即 CI 红（pnpm routes:check）。
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const frontendDir = join(root, 'frontend')
const webSrc = join(frontendDir, 'web', 'src')
const featuresDir = join(webSrc, 'features')
const outputFile = join(webSrc, 'app', 'routes.tsx')

// 一级组目录（06 §八-8.1 站点地图）：固定展示序 + 组图标；未登记组排已知组之后（按字典序），
// 不报错——A1-2 回填前的过渡态靠它跑通生成；回填后新组名应登记进本表（防游离组）。
const GROUP_META = {
  dashboard: { icon: 'DashboardOutlined' },
  product: { icon: 'ProductOutlined' },
  project: { icon: 'ProjectOutlined' },
  quality: { icon: 'ExperimentOutlined' },
  doc: { icon: 'FileTextOutlined' },
  org: { icon: 'TeamOutlined' },
  admin: { icon: 'SettingOutlined' },
}

// 组内二级分区（用户裁决 2026-09-20）：`@menu 组key/分区key` 让页面落到组内分区，菜单因此最多三级
// （组 → 分区 → 项），一级/二级都内联下拉展开（不做右侧浮层）。分区必须登记在本表——未登记即报错，
// 否则分区标题没有 i18n 键、也没有固定展示序（游离分区）。
const SECTION_META = {
  'admin/lang': { order: 2, title: 'nav.section.adminLang' },
  'admin/audit': { order: 5, title: 'nav.section.auditLog' },
}

/** 注解键白名单：出现白名单外的 @key 即报错（防拼写静默丢失）。 */
const KNOWN_KEYS = new Set(['route', 'title', 'perm', 'menu', 'order', 'icon', 'hide', 'activeMenu'])

/** @type {Array<{path: string, title: string, perm: string|null, menu: string|null, order: number, icon: string|null, hide: boolean, activeMenu: string|null, relImport: string, name: string}>} */
const pages = []

function parseAnnotation(firstLine, full) {
  if (!firstLine.startsWith('/**') || !firstLine.endsWith('*/')) {
    throw new Error(`路由注解缺失或格式错误: ${full}\n  期望首行: /** @route /path @title i18n.key [...] */\n  实际首行: ${firstLine.trim()}`)
  }
  const body = firstLine.slice(3, -2)
  const tokens = [...body.matchAll(/@(route|title|perm|menu|order|icon|hide|activeMenu)(?:\s+([^\s@]+))?/g)]
  if (tokens.length === 0) {
    throw new Error(`路由注解缺失 @route: ${full}\n  实际首行: ${firstLine.trim()}`)
  }
  // 白名单外的 @key（如 @orde）会被上面的正则跳过——单独扫一遍全部 @word 兜底报错
  for (const unknown of body.matchAll(/@(\w+)/g)) {
    if (!KNOWN_KEYS.has(unknown[1])) {
      throw new Error(`路由注解含未知字段 @${unknown[1]}: ${full}\n  允许的字段: ${[...KNOWN_KEYS].join(' ')}`)
    }
  }
  const seen = new Set()
  const values = {}
  for (const [, key, value] of tokens) {
    if (seen.has(key)) throw new Error(`路由注解字段 @${key} 重复: ${full}`)
    seen.add(key)
    values[key] = value ?? true
  }
  if (!values.route || values.route === true) throw new Error(`路由注解缺少 @route 路径: ${full}`)
  if (!values.title || values.title === true) {
    throw new Error(`路由注解缺少 @title（进菜单/面包屑的必需字段）: ${full}`)
  }
  if (values.order !== undefined && (!/^\d+$/.test(String(values.order)) || values.order === true)) {
    throw new Error(`@order 必须是整数: ${full}\n  实际: ${values.order}`)
  }
  return values
}

function scanPages(dir) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      scanPages(full)
      continue
    }
    if (!entry.name.endsWith('.page.tsx')) continue
    const firstLine =
      readFileSync(full, 'utf8')
        .split('\n')
        .find((line) => line.trim().length > 0) ?? ''
    const values = parseAnnotation(firstLine, full)
    const relImport =
      '../' +
      full
        .slice(webSrc.length + 1)
        .replace(/\.tsx$/, '')
        .replaceAll('\\', '/')
    // 组件名 = 文件名（去 `.page.tsx`）转大驼峰 + `Page`；文件名已带 `-page` 段（02 §4 页面命名）
    // 时先剥掉再拼，否则生成 `BoardPagePage` 双后缀（08 B2-6）。
    const componentName = `${entry.name
      .replace(/\.page\.tsx$/, '')
      .replace(/-page$/, '')
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')}Page`
    const rawMenu =
      values.menu && values.menu !== true && values.menu !== '-'
        ? values.menu
        : values.menu === '-'
          ? null
          : values.route.replace(/^\//, '').split('/')[0] || null
    if (rawMenu !== null && rawMenu.includes('/') && !(rawMenu in SECTION_META)) {
      throw new Error(
        `@menu 引用了未登记的分区: ${full}\n  实际: ${rawMenu}\n  请先登记进 route-codegen.mjs 的 SECTION_META（含 order 与 title i18n 键）。`,
      )
    }
    pages.push({
      path: values.route,
      title: values.title,
      perm: values.perm && values.perm !== true ? values.perm : null,
      menu: rawMenu,
      order: values.order && values.order !== true ? Number(values.order) : 999,
      icon: values.icon && values.icon !== true && values.icon !== '-' ? values.icon : null,
      hide: values.hide === true,
      activeMenu: values.activeMenu && values.activeMenu !== true ? values.activeMenu : null,
      relImport,
      name: componentName,
    })
  }
}

scanPages(featuresDir)

// @activeMenu 目标必须是已存在页面的静态路径（:param 路径无法作菜单 key 高亮）
const allPaths = new Set(pages.map((page) => page.path))
for (const page of pages) {
  if (page.activeMenu === null) continue
  if (!allPaths.has(page.activeMenu)) {
    throw new Error(`@activeMenu 指向不存在的路由: ${page.path} → ${page.activeMenu}`)
  }
  if (page.activeMenu.includes(':')) {
    throw new Error(`@activeMenu 不允许指向带参路径: ${page.path} → ${page.activeMenu}`)
  }
}

pages.sort((a, b) => a.path.localeCompare(b.path))

// —— 树形导航组装：已知组按 GROUP_META 声明序，未知组按字典序排后；组内「项 + 分区」按 order 混排 ——
const groupOrder = (key) => {
  const known = Object.keys(GROUP_META)
  const index = known.indexOf(key)
  return index >= 0 ? index : known.length
}
/** @returns {{items: Array<object>, sections: Map<string, Array<object>>}} */
const emptyGroup = () => ({ items: [], sections: new Map() })
const groups = new Map()
for (const page of pages) {
  if (page.hide || page.menu === null) continue
  if (!page.menu.includes('/')) {
    if (!groups.has(page.menu)) groups.set(page.menu, emptyGroup())
    groups.get(page.menu).items.push(page)
    continue
  }
  const groupKey = page.menu.slice(0, page.menu.indexOf('/'))
  if (!groups.has(groupKey)) groups.set(groupKey, emptyGroup())
  const { sections } = groups.get(groupKey)
  if (!sections.has(page.menu)) sections.set(page.menu, [])
  sections.get(page.menu).push(page)
}
/** 组内子节点混排：项与分区同表按 order，order 相同再按路径/分区键（保证跨运行稳定）。 */
const childNodes = (entry) =>
  [
    ...entry.items.map((page) => ({ order: page.order, tie: page.path, page, sectionKey: null })),
    ...entry.sections
      .entries()
      .map(([sectionKey, items]) => ({ order: SECTION_META[sectionKey].order, tie: sectionKey, page: null, sectionKey, items })),
  ].sort((a, b) => a.order - b.order || a.tie.localeCompare(b.tie))
const sortedGroups = [...groups.entries()]
  .sort((a, b) => groupOrder(a[0]) - groupOrder(b[0]) || a[0].localeCompare(b[0]))
  .map(([key, entry]) => [key, childNodes(entry)])
const sortItems = (items) => [...items].sort((a, b) => a.order - b.order || a.path.localeCompare(b.path))
const itemLine = (item, indent) => {
  const props = [`path: '${item.path}'`, `title: '${item.title}'`, `order: ${item.order}`]
  if (item.perm !== null) props.push(`perm: '${item.perm}'`)
  if (item.icon !== null) props.push(`icon: '${item.icon}'`)
  return `${indent}{ ${props.join(', ')} },`
}

const lines = []
lines.push('/**')
lines.push(
  ' * AUTO-GENERATED by tools/route-codegen.mjs — 禁止手改（01 §3.4），改页面注解后执行 pnpm routes 重新生成。',
)
lines.push(' * 注解字段：@route/@title/@perm/@menu/@order/@icon/@hide/@activeMenu（06 A1-1）。')
lines.push(' */')
lines.push("import { PageLoading } from '@zentao/design-system'")
lines.push("import { lazy, type ReactNode, Suspense } from 'react'")
lines.push("import type { RouteObject } from 'react-router'")
lines.push('')
lines.push('export type NavigationItem = { path: string; title: string; perm?: string; icon?: string; order: number }')
lines.push(
  'export type NavigationSection = { key: string; title: string; order: number; children: NavigationItem[] }',
)
lines.push(
  'export type NavigationGroup = { key: string; title: string; icon?: string; children: (NavigationItem | NavigationSection)[] }',
)
lines.push('')
for (const page of pages) {
  lines.push(`const ${page.name} = lazy(() => import('${page.relImport}'))`)
}
lines.push('')
lines.push('const withSuspense = (node: ReactNode) => <Suspense fallback={<PageLoading />}>{node}</Suspense>')
lines.push('')
lines.push('export const generatedRoutes: RouteObject[] = [')
for (const page of pages) {
  const handleProps = [
    page.title !== null ? `title: '${page.title}'` : null,
    page.perm !== null ? `perm: '${page.perm}'` : null,
  ]
    .filter(Boolean)
    .join(', ')
  lines.push('  {')
  lines.push(`    path: '${page.path}',`)
  lines.push(`    element: withSuspense(<${page.name} />),`)
  if (handleProps.length > 0) lines.push(`    handle: { ${handleProps} },`)
  lines.push('  },')
}
lines.push(']')

lines.push('')
lines.push(
  '/** 层级导航（菜单/搜索派生源，01 §3.4 + 06 A1-1；分区见 SECTION_META）：组 →（分区 →）项；@hide 页不进树。title 均为 i18n 键。 */',
)
lines.push('export const navigation: NavigationGroup[] = [')
for (const [key, nodes] of sortedGroups) {
  const meta = GROUP_META[key]
  lines.push('  {')
  lines.push(`    key: '${key}',`)
  lines.push(`    title: 'nav.group.${key}',`)
  if (meta) lines.push(`    icon: '${meta.icon}',`)
  lines.push('    children: [')
  for (const node of nodes) {
    if (node.sectionKey === null) {
      lines.push(itemLine(node.page, '      '))
      continue
    }
    lines.push('      {')
    lines.push(`        key: '${node.sectionKey}',`)
    lines.push(`        title: '${SECTION_META[node.sectionKey].title}',`)
    lines.push(`        order: ${node.order},`)
    lines.push('        children: [')
    for (const item of sortItems(node.items)) lines.push(itemLine(item, '          '))
    lines.push('        ],')
    lines.push('      },')
  }
  lines.push('    ],')
  lines.push('  },')
}
lines.push(']')

const hiddenWithMenu = pages.filter((page) => page.activeMenu !== null)
if (hiddenWithMenu.length > 0) {
  lines.push('')
  lines.push('/** 隐藏页 → 菜单高亮目标（06 A1-1）：详情/批量等上下文页的菜单归属。 */')
  lines.push('export const activeMenuMap: Record<string, string> = {')
  for (const page of hiddenWithMenu) {
    lines.push(`  '${page.path}': '${page.activeMenu}',`)
  }
  lines.push('}')
}
lines.push('')

writeFileSync(outputFile, `${lines.join('\n')}\n`)

// 生成物必须同时满足 Biome 格式，否则 pnpm routes 之后 lint 必红（同源生成 → 同源格式化）。
// 用 Node 直接跑 Biome 的 JS 入口，避免 Windows 下 .cmd 的 spawn 限制。
// 格式化失败一律抛错（08 B2-6）：旧实现 catch 后只 console.warn，于是"生成物与 lint 不一致"
// 被降级成一行提示、routes:check 照样进绿——这正是假绿。找不到 Biome 入口同样抛错：
// 拿不到格式化器就无法保证同源，宁可红。
// 成功时吞掉 Biome 输出：生成器逐行拼串，长行由 Biome 折行，故每次都会报 "Fixed 1 file"，
// 那是"格式化器干了活"而非"产物变了"（产物跨次运行稳定，routes:check 靠它比对）——留作失败时才打印。
const biomeEntry = join(frontendDir, 'node_modules', '@biomejs', 'biome', 'bin', 'biome')
if (!existsSync(biomeEntry)) {
  throw new Error(`找不到 Biome 入口：${biomeEntry}\n  先执行 cd frontend && pnpm install，再重跑 route-codegen。`)
}
try {
  // cwd 必须是 frontend/：Biome 以 git 根为准找根配置，从仓库根跑会把 frontend/biome.json
  // 判成「嵌套根配置」而直接拒绝执行（与 pnpm lint 同 cwd 才同源）。
  execFileSync(process.execPath, [biomeEntry, 'check', '--write', relative(frontendDir, outputFile)], {
    cwd: frontendDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (error) {
  const detail = error.stdout?.toString() || error.stderr?.toString() || error.message
  throw new Error(`Biome 格式化 ${outputFile} 失败：\n${detail}\n  生成物与 lint 必须同源，格式化不通过即中止。`)
}

const unknownGroups = [...groups.keys()].filter((key) => !(key in GROUP_META))
if (unknownGroups.length > 0) {
  console.warn(`提示：未登记一级组（按字典序排在已知组后，登记进 GROUP_META 可定序）：${unknownGroups.join(', ')}`)
}
console.log(`routes.tsx 生成完毕：${pages.length} 个页面（${sortedGroups.length} 组）→ ${outputFile}`)
