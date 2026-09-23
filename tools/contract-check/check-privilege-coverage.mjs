// check-privilege-coverage（06 A7-6；T50 扩为三态）：控制器端点权限覆盖审计。
//
// 规则（T50 起）：`@RestController` 里每个 `@*Mapping` 方法必须三选一——
//   1. `@RequirePrivilege("code")`  → 运行时查码（无码 40301）
//   2. `@Anonymous("理由")`         → 运行时真匿名（不被拦截器解析会话）；**理由必须非空**（它同时是书面登记）
//   3. 出现在白名单 `privilege-whitelist.txt`（每行 `<METHOD> <path>  # 理由`）→ 运行时"默认要求已认证会话"
// 三者互斥：带码或标匿名的端点若仍在白名单里 = 条目腐化，报错；同端点带码 + 匿名 = 登记冲突，报错。
//
// 注：注解按本仓惯例写在映射行**之后**（`@GetMapping("/x")` 下一行起）。写在映射行之前会被判成裸端点——
// 报错而不是静默放行，把注解挪到映射行下面即可。
//
// 用法：`node tools/contract-check/check-privilege-coverage.mjs [--list] [--selftest]`
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

/** 控制器源码 → 端点清单（`@RestController` 之外的文件忽略；行号为映射行）。 */
function scanEndpoints(sources) {
  const endpoints = []
  for (const { file, src } of sources) {
    if (!src.includes('@RestController')) continue
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
      const reason = block.match(/@Anonymous\(\s*(?:value\s*=\s*)?"([^"]*)"\s*\)/)
      endpoints.push({
        file,
        line: index + 1,
        verb,
        path: `${classPrefix}${path}` || `${classPrefix}`,
        guarded: block.includes('@RequirePrivilege('),
        anonymous: reason !== null,
        reason: reason?.[1] ?? '',
      })
    })
  }
  return endpoints
}

/** 白名单文本 → Map<`METHOD path`, 理由>。 */
function parseWhitelist(rawWhitelist) {
  const whitelist = new Map()
  for (const line of rawWhitelist.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const [key] = trimmed.split('#')
    const [verb, path] = key.trim().split(/\s+/)
    if (!verb || !path) throw new Error(`白名单行格式非法：${line}`)
    whitelist.set(`${verb} ${path}`, trimmed.includes('#') ? trimmed.split('#')[1].trim() : '')
  }
  return whitelist
}

/** 三态判定：返回 { endpoints, problems }（纯函数，喂给 --selftest）。 */
function analyze(sources, whitelist) {
  const endpoints = scanEndpoints(sources)
  const problems = []
  for (const endpoint of endpoints) {
    const key = `${endpoint.verb} ${endpoint.path}`
    if (endpoint.guarded && endpoint.anonymous) {
      problems.push(`同时标了 @RequirePrivilege 与 @Anonymous（运行时按码判定，但不许两处登记）：${key}（${endpoint.file}:${endpoint.line}）`)
    }
    if (endpoint.anonymous && !endpoint.guarded && endpoint.reason.trim() === '') {
      problems.push(`@Anonymous 缺理由（理由即匿名登记，不许空）：${key}（${endpoint.file}:${endpoint.line}）`)
    }
  }
  const bare = endpoints.filter((e) => !e.guarded && !e.anonymous)
  for (const endpoint of bare) {
    const key = `${endpoint.verb} ${endpoint.path}`
    if (!whitelist.has(key)) {
      problems.push(`裸端点未登记白名单（也没标 @Anonymous）：${key}（${endpoint.file}:${endpoint.line}）`)
    }
  }
  const bareKeys = new Set(bare.map((e) => `${e.verb} ${e.path}`))
  for (const [key, reason] of whitelist) {
    if (!bareKeys.has(key)) {
      problems.push(`白名单条目已失效（该端点已有 @RequirePrivilege 或 @Anonymous）：${key}${reason ? `（理由：${reason}）` : ''}`)
    }
    if (reason === '') problems.push(`白名单条目缺理由注释：${key}`)
  }
  return { endpoints, problems, guarded: endpoints.filter((e) => e.guarded).length, anonymous: endpoints.filter((e) => e.anonymous).length, bare: bare.length }
}

// ── 自检：坏样本必须报红、好样本必须干净（规则双向有效） ──
function selftest() {
  const controller = (body) => [{ file: 'C.java', src: `package p;\n@RestController\n@RequestMapping("/api/v1")\nclass C {\n${body}\n}\n` }]
  const get = (annotations, path = '/x') => `  @GetMapping("${path}")\n${annotations}  public String x() { return "x"; }`
  const cases = [
    ['带码端点', controller(get('  @RequirePrivilege("a-view")\n')), '', 0],
    ['匿名端点带理由', controller(get('  @Anonymous("登录前无会话")\n')), '', 0],
    ['裸端点已登记白名单', controller(get('')), 'GET /api/v1/x  # 本人自证', 0],
    ['裸端点未登记', controller(get('')), '', 1],
    ['@Anonymous 空理由', controller(get('  @Anonymous("")\n')), '', 1],
    ['@Anonymous 纯空白理由', controller(get('  @Anonymous("   ")\n')), '', 1],
    ['匿名端点仍在白名单（条目腐化）', controller(get('  @Anonymous("登录")\n')), 'GET /api/v1/x  # 登录', 1],
    ['带码端点仍在白名单（条目腐化）', controller(get('  @RequirePrivilege("a-view")\n')), 'GET /api/v1/x  # 旧理由', 1],
    ['带码 + 匿名（登记冲突）', controller(get('  @RequirePrivilege("a-view")\n  @Anonymous("x")\n')), '', 1],
    ['白名单缺理由', controller(get('')), 'GET /api/v1/x', 1],
    ['value= 形态的匿名理由也认', controller(get('  @Anonymous(value = "登录")\n')), '', 0],
  ]
  const failures = []
  for (const [name, sources, whitelistText, expected] of cases) {
    const { problems, endpoints } = analyze(sources, parseWhitelist(whitelistText))
    if (endpoints.length !== 1) failures.push(`${name}：端点识别数 ${endpoints.length}（应 1）`)
    if (problems.length !== expected) failures.push(`${name}：问题数 ${problems.length}（应 ${expected}）→ ${problems.join(' / ')}`)
  }
  // 类级前缀拼接
  const prefixed = analyze(controller(get('', '/y')), new Map()).endpoints[0]?.path
  if (prefixed !== '/api/v1/y') failures.push(`类级前缀拼接错误：${prefixed}`)
  if (failures.length > 0) {
    console.error(`check-privilege-coverage --selftest：${failures.length} 处自检失败`)
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }
  console.log(`check-privilege-coverage --selftest：${cases.length + 1} 项自检全过（好样本干净、坏样本必红）`)
}

if (process.argv.includes('--selftest')) {
  selftest()
  process.exit(0)
}

const sources = []
for (const file of walk(backendSrc)) {
  sources.push({ file: relative(root, file).replaceAll(sep, '/'), src: readFileSync(file, 'utf8') })
}
const { endpoints, problems, guarded, anonymous, bare } = analyze(sources, parseWhitelist(readFileSync(whitelistFile, 'utf8')))

if (process.argv.includes('--list')) {
  console.log(`控制器端点 ${endpoints.length} 个（有码 ${guarded} / 匿名 ${anonymous} / 裸 ${bare}）`)
  for (const endpoint of endpoints.filter((e) => !e.guarded && !e.anonymous)) {
    console.log(`  裸 ${endpoint.verb} ${endpoint.path}  ${endpoint.file}:${endpoint.line}`)
  }
  for (const endpoint of endpoints.filter((e) => e.anonymous && !e.guarded)) {
    console.log(`  匿名 ${endpoint.verb} ${endpoint.path}  ${endpoint.file}:${endpoint.line}  ${endpoint.reason}`)
  }
  process.exit(0)
}

if (problems.length > 0) {
  console.error(`check-privilege-coverage：${problems.length} 处违规（端点 ${endpoints.length}）`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log(
  `check-privilege-coverage：0 违规（端点 ${endpoints.length}；带码 ${guarded}，匿名 ${anonymous}（每处带理由），白名单放行 ${bare}（每行带理由））`,
)
