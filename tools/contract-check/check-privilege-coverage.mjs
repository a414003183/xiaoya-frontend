// check-privilege-coverage（06 A7-6）：控制器端点权限覆盖审计。
// 规则：`@RestController` 里每个 `@*Mapping` 方法必须有 `@RequirePrivilege`，否则必须出现在白名单
// `privilege-whitelist.txt`（每行 `<METHOD> <path>  # 理由`）；白名单里已不再「裸」的条目同样报错（防白名单腐化）。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const backendSrc = join(root, 'backend', 'src', 'main', 'java')
const whitelistFile = join(import.meta.dirname, 'privilege-whitelist.txt')

const VERBS = { GetMapping: 'GET', PostMapping: 'POST', PatchMapping: 'PATCH', PutMapping: 'PUT', DeleteMapping: 'DELETE' }

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (entry.endsWith('.java')) yield full
  }
}

const controllers = []
for (const file of walk(backendSrc)) {
  const src = readFileSync(file, 'utf8')
  if (!src.includes('@RestController')) continue
  controllers.push({ file: relative(root, file).replaceAll(sep, '/'), src })
}

const endpoints = []
for (const { file, src } of controllers) {
  const lines = src.split('\n')
  const classPrefix = lines.map((l) => l.match(/@RequestMapping\("([^"]*)"\)/)).find(Boolean)?.[1] ?? ''
  lines.forEach((line, index) => {
    const match = line.match(/@(Get|Post|Patch|Put|Delete)Mapping(?:\(\s*(?:value\s*=\s*)?"([^"]*)"\s*\))?/)
    if (!match) return
    const verb = VERBS[`${match[1]}Mapping`]
    const path = match[2] ?? ''
    // 注解块 = 本行到方法签名（首个不以下一个注解/空行/注释开头的行视为签名起点）
    let block = line
    for (let i = index + 1; i < Math.min(index + 12, lines.length); i++) {
      block += `\n${lines[i]}`
      if (/^\s{2}(public|private|protected)\s/.test(lines[i])) break
    }
    endpoints.push({
      file,
      line: index + 1,
      verb,
      path: `${classPrefix}${path}` || `${classPrefix}`,
      guarded: block.includes('@RequirePrivilege('),
    })
  })
}

const rawWhitelist = readFileSync(whitelistFile, 'utf8')
const whitelist = new Map()
for (const line of rawWhitelist.split('\n')) {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('#')) continue
  const [key] = trimmed.split('#')
  const [verb, path] = key.trim().split(/\s+/)
  if (!verb || !path) throw new Error(`白名单行格式非法：${line}`)
  whitelist.set(`${verb} ${path}`, trimmed.includes('#') ? trimmed.split('#')[1].trim() : '')
}

const problems = []
const guarded = endpoints.filter((e) => e.guarded)
const bare = endpoints.filter((e) => !e.guarded)
for (const endpoint of bare) {
  const key = `${endpoint.verb} ${endpoint.path}`
  if (!whitelist.has(key)) {
    problems.push(`裸端点未登记白名单：${key}（${endpoint.file}:${endpoint.line}）`)
  }
}
const bareKeys = new Set(bare.map((e) => `${e.verb} ${e.path}`))
for (const [key, reason] of whitelist) {
  if (!bareKeys.has(key)) {
    problems.push(`白名单条目已失效（该端点已有 @RequirePrivilege）：${key}${reason ? `（理由：${reason}）` : ''}`)
  }
  if (reason === '') problems.push(`白名单条目缺理由注释：${key}`)
}

if (process.argv.includes('--list')) {
  console.log(`控制器 ${controllers.length} 个 / 端点 ${endpoints.length} 个（有码 ${guarded.length} / 裸 ${bare.length}）`)
  for (const endpoint of bare) console.log(`  ${endpoint.verb} ${endpoint.path}  ${endpoint.file}:${endpoint.line}`)
  process.exit(0)
}

if (problems.length > 0) {
  console.error(`check-privilege-coverage：${problems.length} 处违规（端点 ${endpoints.length}，裸 ${bare.length}）`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log(
  `check-privilege-coverage：0 违规（端点 ${endpoints.length}；带码 ${guarded.length}，白名单放行 ${bare.length} —— 每行带理由）`,
)
