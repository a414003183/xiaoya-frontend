// check-privilege-menu-sync（T02 / ADR-002 / 特质 01 度量「孤儿权限码数 = 0」）：
// `PrivilegeCatalog` 注册的每个权限码都必须能在菜单基线上找到节点，反之节点上的每个码也必须已注册。
//
// 两个方向的红灯含义：
//   ① catalog 有码而树上无节点 → 授权页「其它权限码（未编入菜单）」里的孤儿：管理员只能在兜底区勾选，
//      权限点可视化维护（ADR-002）名存实亡。修法：宿主页面补 `<HasPerm perm="码">` 后 `pnpm routes`，
//      或按域卡把码下线（删注册 + 删 `@RequirePrivilege` + grep 前端引用）。
//   ② 树上有码而 catalog 未注册 → 该码永远授予不出去（授权保存接口 42201），只有超管 `*` 能用：
//      按钮渲染得出来，普通角色点了必 403。
//
// 归属规则与后端运行时同一套（`platform/menu/MenuQueryService#catalogButtons`）：码可达 ⇔
//   是某页面的 perm（页面节点本身）｜某页面文件的 `<HasPerm>`/`hasPerm` 字面量（按钮节点）｜
//   存在 perm 为 `<码首段>-view` 的页面（域首页兜底归属，给工作流动作码这类页面扫不到的码）。
// 规则只此一处实现（后端 Java + 本脚本），改归属必须两边同改——否则本门禁会与运行时树说法不一。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BACKEND_SRC, ROOT, assertScanFloor, report, walkFiles } from './scan-roots.mjs'

const GATE = 'check-privilege-menu-sync'
const BASELINE = join(ROOT, 'backend', 'src', 'main', 'resources', 'menu', 'navigation.json')

// —— catalog 全量码：扫各域 registrar 与 PrivilegeCatalog 构造器里的 `register("域", List.of("码"…))` ——
const domainOf = new Map()
const registeredAt = new Map()
const conflicts = []
for (const { full, rel } of walkFiles(BACKEND_SRC, { exts: new Set(['.java']) })) {
  const src = readFileSync(full, 'utf8')
  for (const call of src.matchAll(/register\(\s*"([^"]+)"\s*,\s*List\.of\(([^)]*)\)/gs)) {
    const [, domain, body] = call
    for (const quoted of body.matchAll(/"([^"]+)"/g)) {
      const code = quoted[1]
      if (domainOf.has(code) && domainOf.get(code) !== domain) {
        // 同码两域：字典与授权页会出两条同码项，且域归属随注册顺序漂移
        conflicts.push(`同码注册在两个域：${code}（${domainOf.get(code)} @${registeredAt.get(code)} vs ${domain} @${rel}）`)
      }
      domainOf.set(code, domain)
      registeredAt.set(code, rel)
    }
  }
}
assertScanFloor(GATE, domainOf.size, 120)

// —— 菜单基线（route-codegen 产物：页面 perm + 页面文件扫出的按钮字面量）——
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
const pages = baseline.pages ?? []
assertScanFloor(GATE, pages.length, 80)

const pagePerms = new Set()
const declared = new Map() // 按钮码 → 声明它的页面 path（报错定位用）
for (const page of pages) {
  if (page.perm) pagePerms.add(page.perm)
  for (const code of page.buttons ?? []) {
    declared.set(code, [...(declared.get(code) ?? []), page.path])
  }
}
const viewPrefixes = new Set(
  [...pagePerms].filter((perm) => perm.endsWith('-view')).map((perm) => perm.slice(0, -'-view'.length)),
)

// —— 方向 ①：catalog → 树 ——
const orphans = []
for (const [code, domain] of domainOf) {
  if (pagePerms.has(code) || declared.has(code)) continue
  const dash = code.indexOf('-')
  if (dash > 0 && viewPrefixes.has(code.slice(0, dash))) continue
  orphans.push(`${code}（域 ${domain}，注册于 ${registeredAt.get(code)}）`)
}

// —— 方向 ②：树 → catalog ——
const unregistered = []
for (const [code, paths] of declared) {
  if (!domainOf.has(code)) unregistered.push(`${code}（按钮字面量 @ ${paths.join(', ')}）`)
}
for (const perm of pagePerms) {
  if (!domainOf.has(perm)) unregistered.push(`${perm}（页面 perm）`)
}

const problems = [
  ...orphans.map((item) => `孤儿权限码（树上有节点的码必须来自 catalog，反之亦然）：${item}`),
  ...unregistered.map((item) => `未注册权限码（授予不出去，普通角色点了必 403）：${item}`),
  ...conflicts,
]

if (process.argv.includes('--list')) {
  console.log(
    `${GATE}：catalog ${domainOf.size} 码 / 基线 ${pages.length} 页（页面 perm ${pagePerms.size}，按钮字面量 ${declared.size}，-view 兜底前缀 ${viewPrefixes.size}）`,
  )
  for (const item of problems) console.log(`  ${item}`)
  process.exit(problems.length > 0 ? 1 : 0)
}

report(
  GATE,
  problems,
  domainOf.size,
  `catalog ${domainOf.size} 码 ↔ 基线 ${pages.length} 页双向对齐（按钮字面量 ${declared.size}，-view 兜底前缀 ${viewPrefixes.size}）`,
)
