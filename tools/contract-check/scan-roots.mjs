// 门禁共享扫描面（08 B2-2）：源码类门禁（check-lang-keys / check-raw-styles / banned-words）
// 同根同豁免，各自带「扫描文件数下限」自检——扫描面塌陷（路径改名、目录被删、glob 失效）时
// 旧脚本会「扫到 0 个文件 = 0 违规」静默变绿，这是假绿来源之一。
//
// 路径一律按 `/` 分段比较：Windows 下 `join()` 拼出的豁免片段（如 `src\generated`）
// 永不命中已被反斜杠转义过的比对串，旧写法在 Windows 上等于没豁免。
import { readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

export const ROOT = join(import.meta.dirname, '..', '..')
export const WEB_SRC = join(ROOT, 'frontend', 'web', 'src')
export const PACKAGES = join(ROOT, 'frontend', 'packages')
export const BACKEND_SRC = join(ROOT, 'backend', 'src', 'main', 'java')

/** 依赖/产物目录：任何门禁都不进。 */
export const BUILD_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  'target',
  '.turbo',
  'test-results',
  'playwright-report',
])

export const TS_EXTS = new Set(['.ts', '.tsx'])

/** Windows 反斜杠 → `/`，供分段比较与输出。 */
export const normalize = (path) => path.replaceAll('\\', '/')

/** 相对仓库根的归一化路径（门禁报错一律用它，跨平台输出一致）。 */
export const relOf = (path) => normalize(relative(ROOT, path))

/** 前端源码扫描面：web/src + 各包 src（只到各包 src，不扫包根配置与产物）。 */
export function frontendSrcRoots() {
  const roots = [WEB_SRC]
  for (const entry of readdirSync(PACKAGES, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || BUILD_DIRS.has(entry.name)) continue
    roots.push(join(PACKAGES, entry.name, 'src'))
  }
  return roots
}

/**
 * 递归产出 `{ full, rel }`（rel 相对仓库根，/ 归一）。
 * 目录不存在即跳过（各包 src 不保证存在）。
 * @param {string} dir
 * @param {{exts?: Set<string>, skipNames?: Set<string>, skip?: (rel: string) => boolean}} [opts]
 */
export function* walkFiles(dir, { exts, skipNames = new Set(), skip } = {}) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || BUILD_DIRS.has(entry.name) || skipNames.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkFiles(full, { exts, skipNames, skip })
      continue
    }
    if (exts && !exts.has(extname(entry.name))) continue
    const rel = relOf(full)
    if (skip?.(rel)) continue
    yield { full, rel }
  }
}

/** 扫描面下限自检：命中文件数低于下限即判门禁失效（不是豁免，是红灯）。 */
export function assertScanFloor(gate, scanned, floor) {
  if (scanned >= floor) return
  console.error(`${gate}：扫描面异常（仅 ${scanned} 文件 < 下限 ${floor}），门禁失效——检查扫描根与豁免规则`)
  process.exit(1)
}

/** 打印统一结尾。 */
export function report(gate, problems, scanned, summary) {
  if (problems.length > 0) {
    console.error(`${gate}：${problems.length} 处违规（扫描 ${scanned} 文件）`)
    for (const problem of problems) console.error(`  ${problem}`)
    process.exit(1)
  }
  console.log(`${gate}：0 违规（${summary}，扫描 ${scanned} 文件）`)
}
