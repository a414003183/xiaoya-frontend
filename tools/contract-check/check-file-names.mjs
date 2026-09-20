// check-file-names（06 A7-7）：前端文件命名机器强制——kebab-case + 角色后缀（02-naming.md §4）。
// 规则：① 文件名段一律 kebab-case（小写字母/数字/连字符）；② pages/ 下必须 `.page.tsx`；
// ③ api/ 下必须 `.api.ts`；④ hooks 前缀 `use-`；⑤ 豁免 `index.ts`、`__tests__/**`、`*.test.*`、`*.spec.*`。
import { readdirSync, statSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const featuresRoot = join(root, 'frontend', 'web', 'src', 'features')
const EXT = new Set(['.ts', '.tsx'])
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/

const problems = []
let scanned = 0

const dirRoleRule = (segments) => {
  if (segments.includes('pages')) return { suffix: '.page.tsx', why: 'pages/ 下必须 `<name>.page.tsx`（02 §4）' }
  if (segments.includes('api')) return { suffix: '.api.ts', why: 'api/ 下必须 `<domain>.api.ts`（02 §4）' }
  if (segments.includes('hooks')) return { prefix: 'use-', why: 'hooks/ 下必须 `use-<thing>.ts`（02 §4）' }
  return undefined
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (entry === '__tests__' || entry === 'node_modules') continue
    const stat = statSync(full)
    if (stat.isDirectory()) {
      yield* walk(full)
    } else if (EXT.has(extname(entry))) {
      yield full
    }
  }
}

for (const file of walk(featuresRoot)) {
  const name = file.split(sep).pop()
  if (name === 'index.ts' || /\.(test|spec)\.(ts|tsx)$/.test(name)) continue
  scanned++
  const segments = relative(featuresRoot, file).split(sep)
  const rel = relative(root, file).replaceAll(sep, '/')
  const role = dirRoleRule(segments)
  if (role?.suffix && !name.endsWith(role.suffix)) {
    problems.push(`${rel}：${role.why}`)
  }
  if (role?.prefix && !name.startsWith(role.prefix)) {
    problems.push(`${rel}：${role.why}`)
  }
  // 名字段（去掉已知后缀后）逐段 kebab-case
  const stem = name.replace(/\.(page|api|test|spec)\.tsx?$/, '').replace(/\.tsx?$/, '')
  for (const part of stem.split('.')) {
    if (!KEBAB.test(part)) problems.push(`${rel}：文件名段「${part}」非 kebab-case（02 §4）`)
  }
}

// 自检：扫描面为空即红（防门禁失效）
const MIN_FILES = 50
if (scanned < MIN_FILES) {
  console.error(`check-file-names：扫描面异常（仅 ${scanned} 文件 < ${MIN_FILES}），门禁失效`)
  process.exit(1)
}

if (problems.length > 0) {
  console.error(`check-file-names：${problems.length} 处违规（扫描 ${scanned} 文件）`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log(`check-file-names：0 违规（kebab-case + 角色后缀，扫描 ${scanned} 文件）`)
