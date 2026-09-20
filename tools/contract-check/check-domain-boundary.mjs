// check-domain-boundary（08 B2-5 / 01 §3.2）：域隔离机器强制。
//
// 为什么不是 Biome noRestrictedImports：Biome 的 gitignore 式 patterns 匹配的是 import 字符串本身，
// 而本仓跨域引用写作 `'../../story/api/story.api'`——不含 `features/` 段，glob 无从判断对端是不是别的域
// （实测：该形态 Biome 放行）。本门禁把 specifier **解析成真实路径**后判定，才是「域与域只准 index.ts」的正解。
//
// 规则（解析后的真实目标路径）：
//   R1 跨域引 features/<域>/{pages,components,forms,api,model}/… → 违规（域内实现不是公开面）
//   R2 跨域引 features/<域> 的 barrel（index.ts）→ 合规
//   R3 shared/** 反向依赖 features/** 或 mocks/** → 违规（零域底座不得倒挂）
//   R4 非测试文件依赖 mocks/** → 违规（mock 是测试基建）
//   R5 路由装配豁免：app/** 可引 features/<域>/pages/**（路由表按设计懒加载全部页面）
// 豁免：测试文件（*.test.* / *.spec.* / __tests__）、mocks/** 自身、行内 `// domain-boundary-ok`。
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { TS_EXTS, ROOT, assertScanFloor, frontendSrcRoots, report, walkFiles } from './scan-roots.mjs'

const GATE = 'check-domain-boundary'
const WEB_SRC = join(ROOT, 'frontend', 'web', 'src')
const INTERNAL_DIRS = new Set(['pages', 'components', 'forms', 'api', 'model'])
const IMPORT_RE = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g

const isTestFile = (rel) => /\.(test|spec)\.[jt]sx?$/.test(rel) || rel.includes('/__tests__/')

/** 解析 specifier → 仓库内真实文件路径；解析不出（包名/别名）返回 null。 */
function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/** 目标路径在 features/<域>/… 下的位置信息；不在则返回 null。 */
function domainSlice(absPath) {
  const rel = relative(WEB_SRC, absPath).replaceAll('\\', '/')
  const parts = rel.split('/')
  if (parts[0] !== 'features' || parts.length < 3) return null
  return { rel, domain: parts[1], sub: parts[2], isBarrel: parts.length === 3 && parts[2] === 'index.ts' }
}

/** 目标路径是否位于 shared/ 或 mocks/ 之下。 */
function topSlice(absPath) {
  const parts = relative(WEB_SRC, absPath).replaceAll('\\', '/').split('/')
  return parts[0] === 'shared' || parts[0] === 'mocks' ? parts[0] : null
}

const problems = []
let scanned = 0
const SRC_PREFIX = 'frontend/web/src/'
for (const dir of frontendSrcRoots()) {
  for (const { full, rel } of walkFiles(dir, { exts: TS_EXTS })) {
    if (!rel.startsWith(SRC_PREFIX)) continue // packages/* 不参与域边界（它们不引 web 域）
    const inSrc = rel.slice(SRC_PREFIX.length) // 例：features/doc/api/doc.api.ts
    const sourceTop = inSrc.split('/')[0] // features | shared | app | mocks | …
    if (sourceTop !== 'features' && sourceTop !== 'shared' && sourceTop !== 'app') continue
    if (isTestFile(rel)) continue
    scanned += 1

    const source = sourceTop === 'features' ? inSrc.split('/')[1] : null
    const src = readFileSync(full, 'utf8')
    const lineOf = (index) => src.slice(0, index).split('\n').length

    for (const match of src.matchAll(IMPORT_RE)) {
      const specifier = match[1]
      const line = lineOf(match.index)
      const allLines = src.split('\n')
      const exempt = [allLines[line - 1], allLines[line - 2]].some((text) => text?.includes('domain-boundary-ok'))
      if (exempt) continue
      const target = resolveSpecifier(full, specifier)
      if (target === null) continue

      const targetTop = topSlice(target)
      const targetDomain = domainSlice(target)

      // R3 shared 倒挂（shared → shared 是域内同层，放行）
      if (sourceTop === 'shared' && (targetTop === 'mocks' || targetDomain !== null)) {
        problems.push(`${rel}:${line}  shared/ 反向依赖 ${targetTop ?? 'features'}/：${specifier}`)
        continue
      }
      // R4 非测试文件引 mocks
      if (targetTop === 'mocks') {
        problems.push(`${rel}:${line}  业务代码依赖 mocks/：${specifier}`)
        continue
      }
      if (targetDomain === null) continue
      // R5 路由装配豁免
      if (sourceTop === 'app' && targetDomain.sub === 'pages') continue
      // R1 跨域内部件（barrel 即 index.ts，不在内部目录名下）
      if (targetDomain.domain !== source && INTERNAL_DIRS.has(targetDomain.sub)) {
        problems.push(
          `${rel}:${line}  跨域深引 features/${targetDomain.domain}/${targetDomain.sub}/：${specifier}（只准对方 index.ts）`,
        )
      }
    }
  }
}
assertScanFloor(GATE, scanned, 200)

report(GATE, problems, scanned, 'R1 跨域深引 / R3 shared 倒挂 / R4 引 mocks；行内 // domain-boundary-ok')
