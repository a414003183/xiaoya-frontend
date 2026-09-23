// check-filter-fields（06 A6-2）：过滤字段名单三方机器对齐——契约声明 ↔ 后端白名单 ↔ 前端实发。
//
// 三方数据源：
//   契约  contract/openapi.yaml —— 每个操作声明的 filters[x] 查询参数（唯一真源）；
//   后端  FieldRegistry.allowing(第一参数 = filterable) 注册块，经「控制器 @Operation(operationId) 方法 → 调用链」
//         解析归属；另有两条手写白名单同算：@RequestParam(name = "filters[x]") 与 "filters[x]" 字面量；
//   前端  buildListParams 调用链（api 层封装函数 → 页面/组件调用点）的 filters 字面量键，以及直发的 'filters[x]' 键
//         （含 CSV 导出按显式路径归属）。
//
// 违规（任一方向有孤儿即红）：
//   R1 后端可收但契约未声明（注册表粒度：注册表被多端点共用，含跨域 api 委托，字段在该注册表服务的任一契约端点声明过即算已声明）
//   R2 契约声明但后端收不了（端点粒度：请求要么 40001 要么被静默忽略）
//   R3 前端实发但契约未声明
//   R4 前端实发但后端收不了
//   R5 带 filters 的契约操作解析不出后端白名单（解析器覆盖自检，防门禁静默失效——不是豁免，是红灯）
// 豁免：行内 `filter-fields-ok`（整块注册表级）；SERVER_INJECTED（/my/* 的 role 列，服务端注入，见下）；
//       KNOWN_GAPS（已登记遗留，每条都在每次运行输出里回显）。
// 覆盖边界（已知上限）：只管 filters 字段集对齐，不管 sort/q/page 的取值合法性；后端白名单取静态注册表，
// 不证明 SQL 列真实存在（由后端子域测试看护）。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parse } from 'yaml'

const root = join(import.meta.dirname, '..', '..')
const DEBUG = process.argv.includes('--debug')

/** 服务端注入字段（workspace 卡 §3.4：/my/* 的 role → filters[<roleField>]=@me，经 Filters.withFilter）。
 *  注册表必须收下这些列，但客户端不发、契约暴露的是 role 参数——故不算「注册表孤儿」。 */
const SERVER_INJECTED = new Set(['finishedBy', 'closedBy', 'resolvedBy', 'reviewers'])

const problems = []

// ─────────────────────────── 一、契约 ───────────────────────────

/** opId → { path, method, fields: Set<string> }（仅含声明了 filters 的操作） */
const operations = new Map()
{
  const doc = parse(readFileSync(join(root, 'contract', 'openapi.yaml'), 'utf8'))
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (typeof op !== 'object' || op === null || typeof op.operationId !== 'string') continue
      const fields = new Set(
        (op.parameters ?? [])
          .map((p) => (typeof p.name === 'string' ? p.name : ''))
          .filter((name) => name.startsWith('filters[') && name.endsWith(']'))
          .map((name) => name.slice('filters['.length, -1)),
      )
      if (fields.size > 0) operations.set(op.operationId, { path, method, fields })
    }
  }
}

// ─────────────────────────── 二、后端 ───────────────────────────

function* walk(dir, skip = () => false) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (skip(full)) continue
    if (statSync(full).isDirectory()) yield* walk(full, skip)
    else yield full
  }
}

/** 配对定位（Java/TS 通用）：返回与 openIndex 处开符配对的闭符下标，失败 -1。 */
function matchPair(text, openIndex, open = '(', close = ')') {
  let depth = 0
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === open) depth++
    else if (text[i] === close) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

const JAVA_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'record', 'class', 'interface', 'enum'])
const FIELD_DECL = /private\s+(?:static\s+)?final\s+([\w<>,.\[\]\s]+?)\s+(\w+)\s*[;=]/g
const REGISTRY_DECL = /(\w+)\s*=\s*FieldRegistry\.allowing\(\s*(?:java\.util\.)?Set\.of\(([^)]*)\)/g

/** Java 类索引：简单类名 → 字段表 / 方法体 / 注册块。（同名类取后扫到的，本仓无跨包同名 QueryService。） */
const javaClasses = new Map()
const javaImpls = new Map()
const controllerMethods = new Map() // opId → { cls, name, signature, body }
{
  const src = join(root, 'backend', 'src', 'main', 'java')
  for (const file of walk(src)) {
    if (!file.endsWith('.java')) continue
    const text = readFileSync(file, 'utf8')
    const cls = text.match(/(?:class|record|enum)\s+(\w+)/)?.[1]
    if (!cls) continue

    const fields = new Map()
    for (const m of text.matchAll(FIELD_DECL)) fields.set(m[2], m[1].trim().split('.').pop())
    const registries = new Map()
    for (const m of text.matchAll(REGISTRY_DECL)) {
      const filterable = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])
      if (filterable.length > 0) registries.set(m[1], filterable)
    }
    const methods = new Map()
    for (const m of text.matchAll(/(\w+)\s*\(/g)) {
      const name = m[1]
      if (JAVA_KEYWORDS.has(name) || text[m.index - 1] === '.') continue
      const close = matchPair(text, m.index + m[0].length - 1)
      if (close === -1) continue
      let i = close + 1
      while (/\s/.test(text[i])) i++
      if (!text.startsWith('{', i)) continue // throws 子句/调用点：无方法体，跳过
      methods.set(name, { body: text.slice(i, matchPair(text, i, '{', '}') + 1), index: m.index, bodyIndex: i })
    }
    for (const m of text.matchAll(/implements\s+([\w.,\s]+?){/g)) {
      for (const iface of m[1].split(',')) javaImpls.set(iface.trim(), cls)
    }
    javaClasses.set(cls, { text, fields, registries, methods })

    for (const m of text.matchAll(/@Operation\(operationId\s*=\s*"(\w+)"\)/g)) {
      const entry = [...methods.entries()]
        .filter(([, candidate]) => candidate.index > m.index)
        .sort((a, b) => a[1].index - b[1].index)[0]
      if (!entry) continue
      const [name, method] = entry
      controllerMethods.set(m[1], {
        cls,
        name,
        signature: text.slice(m.index, method.bodyIndex),
        body: method.body,
      })
    }
  }
}

/** 方法体内出现的 "filters[x]" 字面量（手写白名单：PersonnelQueryService 等）。 */
function literalsIn(body) {
  return [...body.matchAll(/"(filters\[[^\]]+\])"/g)].map((m) => m[1].slice('filters['.length, -1))
}

/** 沿调用链找 Filters.parse(params, REGISTRY)；未命中注册表则回退到链上收集的 "filters[x]" 字面量。 */
function walkChain(owner, methodName, hints, seen, acc) {
  const info = javaClasses.get(owner)
  const method = info?.methods.get(methodName)
  if (!info || !method) return { hit: null, walked: false }
  const key = `${owner}.${methodName}`
  if (seen.has(key)) return { hit: null, walked: true }
  seen.add(key)

  for (const literal of literalsIn(method.body)) acc.literals.add(literal)
  for (const m of method.body.matchAll(/Filters\.parse\(\s*[\w.]+\s*,\s*(\w+)\s*\)/g)) {
    if (info.registries.has(m[1])) {
      return { hit: { cls: owner, varName: m[1], fields: info.registries.get(m[1]) }, walked: true }
    }
    const hint = hints.find((h) => h.varName === m[1]) ?? hints[0] // 注册表经方法参数传入（DocQueryService.page → query）
    if (hint) return { hit: hint, walked: true }
  }

  for (const call of method.body.matchAll(/(?:(\w+)\.)?(\w+)\s*\(/g)) {
    const [, receiver, called] = call
    let targets = []
    if (receiver) {
      const receiverType = info.fields.get(receiver)
      if (!receiverType) continue
      targets = [javaImpls.get(receiverType), receiverType].filter((t) => t && javaClasses.has(t))
    } else if (info.methods.has(called)) {
      targets = [owner]
    }
    const callHints = [...info.registries.keys()]
      .filter((name) => new RegExp(`\\b${name}\\b`).test(method.body.slice(call.index, call.index + 300)))
      .map((name) => ({ cls: owner, varName: name, fields: info.registries.get(name) }))
    for (const target of targets) {
      const result = walkChain(target, called, callHints.length > 0 ? callHints : hints, seen, acc)
      if (result.hit) return result
    }
  }
  return { hit: null, walked: true }
}

/** opId → { found, fields: Set, registry: string|null, via: string } */
const backend = new Map()
for (const opId of operations.keys()) {
  const controller = controllerMethods.get(opId)
  if (!controller) {
    backend.set(opId, { found: false, fields: new Set(), registry: null, via: '控制器方法未找到' })
    continue
  }
  const requestParams = [...controller.signature.matchAll(/@RequestParam\([^)]*name\s*=\s*"(filters\[[^\]]+\])"/g)].map(
    (m) => m[1].slice('filters['.length, -1),
  )
  if (requestParams.length > 0) {
    backend.set(opId, { found: true, fields: new Set(requestParams), registry: null, via: `${controller.cls}#${controller.name} @RequestParam` })
    continue
  }
  const acc = { literals: new Set() }
  const result = walkChain(controller.cls, controller.name, [], new Set(), acc)
  if (result.hit) {
    backend.set(opId, {
      found: true,
      fields: new Set(result.hit.fields),
      registry: `${result.hit.cls}.${result.hit.varName}`,
      via: `${controller.cls}#${controller.name}`,
    })
  } else {
    backend.set(opId, {
      found: result.walked,
      fields: new Set(acc.literals),
      registry: null,
      via: `${controller.cls}#${controller.name}`,
    })
  }
}

// ─────────────────────────── 三、前端 ───────────────────────────

const webSrc = join(root, 'frontend', 'web', 'src')
const FRONT_SKIP = ['/mocks/', '/generated/', '/e2e/', '__tests__', '.test.', '.spec.']
const skipFront = (file) => FRONT_SKIP.some((part) => file.replaceAll(sep, '/').includes(part))

/** 函数体起始 `{` 下标（跨过返回类型——`Promise<{…}>` 这类泛型实参里的花括号不算；失败 -1）。 */
function tsBodyStart(text, from) {
  let angle = 0
  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (ch === '<') angle++
    else if (ch === '>') angle = Math.max(0, angle - 1)
    else if (ch === '{') {
      if (angle === 0) return i
      i = matchPair(text, i, '{', '}') // 返回类型里的对象字面量类型：整块跳过
    } else if (ch === ';') return -1
  }
  return -1
}

/** TS 函数索引（含 api 层封装与 filters 辅助函数）：函数名 → 体。 */
const tsFunctions = new Map()
for (const file of walk(webSrc, skipFront)) {
  if (!/\.(tsx?|mts)$/.test(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g)) {
    const close = matchPair(text, m.index + m[0].length - 1)
    if (close === -1) continue
    const start = tsBodyStart(text, close + 1)
    if (start === -1) continue
    tsFunctions.set(m[1], (tsFunctions.get(m[1]) ?? '') + text.slice(start, matchPair(text, start, '{', '}') + 1))
  }
}

/** api 层封装函数 → 契约操作（函数体里调用生成的同名单函数）。 */
const wrapperOps = new Map()
for (const file of walk(join(webSrc, 'features'), skipFront)) {
  if (!/[/\\]api[/\\][\w.-]+\.api\.ts$/.test(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g)) {
    const close = matchPair(text, m.index + m[0].length - 1)
    if (close === -1) continue
    const start = tsBodyStart(text, close + 1)
    if (start === -1) continue
    const body = text.slice(start, matchPair(text, start, '{', '}') + 1)
    const called = [...new Set([...body.matchAll(/\b(\w+)\s*\(/g)].map((x) => x[1]).filter((name) => operations.has(name)))]
    const paramsType = body.match(/\b(List\w+Params)\b/)?.[1]
    const preferred = paramsType
      ? called.find((name) => `${name[0].toUpperCase()}${name.slice(1)}Params` === paramsType)
      : undefined
    if (preferred) wrapperOps.set(m[1], preferred)
    else if (called.length === 1) wrapperOps.set(m[1], called[0])
  }
}

/** 对象字面量 slice 的属性键（只认属性位的标识符：`key:` 与简写 `key`；值里的标识符不算）。 */
function objectKeys(slice) {
  const keys = new Set()
  let depth = 0
  let expectKey = false
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i]
    if (ch === '{' || ch === '(' || ch === '[') {
      depth++
      expectKey = depth === 1
      continue
    }
    if (ch === '}' || ch === ')' || ch === ']') {
      depth--
      if (depth === 0) break
      expectKey = false
      continue
    }
    if (ch === ',') {
      expectKey = depth === 1
      continue
    }
    if (depth === 1 && expectKey && /[A-Za-z_$]/.test(ch)) {
      let j = i
      while (j < slice.length && /[\w$]/.test(slice[j])) j++
      const ident = slice.slice(i, j)
      let k = j
      while (k < slice.length && /\s/.test(slice[k])) k++
      if (slice[k] === ':' || slice[k] === ',' || slice[k] === '}') keys.add(ident)
      i = j - 1
      expectKey = false
    }
  }
  return keys
}

/** `filters:` 冒号处的值表达式文本：到同级逗号/闭括号为止（三元分支、展开对象都在其中）。 */
function filterValueSlice(text, colonIndex) {
  let depth = 0
  for (let i = colonIndex + 1; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(' || ch === '{' || ch === '[') depth++
    else if (ch === ')' || ch === '}' || ch === ']') {
      if (depth === 0) return text.slice(colonIndex + 1, i)
      depth--
    } else if (ch === ',' && depth === 0) return text.slice(colonIndex + 1, i)
  }
  return text.slice(colonIndex + 1)
}

/** 一段调用实参里所有 filters 键：'filters[x]' 字面量 + `filters: {…}` 字面量 + filters 辅助函数返回值。 */
function filterKeysIn(args) {
  const keys = new Set()
  for (const m of args.matchAll(/['"`]filters\[([^\]]+)\]['"`]/g)) keys.add(m[1])
  for (const m of args.matchAll(/\bfilters\s*:/g)) {
    const value = filterValueSlice(args, m.index + m[0].length - 1)
    for (const literal of value.matchAll(/\{/g)) {
      const end = matchPair(value, literal.index, '{', '}')
      if (end !== -1) for (const key of objectKeys(value.slice(literal.index, end + 1))) keys.add(key)
    }
    const helper = value.match(/^\s*(\w+)\s*\(/)
    if (helper && tsFunctions.has(helper[1])) {
      const body = tsFunctions.get(helper[1])
      for (const ret of body.matchAll(/return\s*\{/g)) {
        const end = matchPair(body, ret.index + ret[0].length - 1, '{', '}')
        if (end !== -1) for (const key of objectKeys(body.slice(ret.index + ret[0].length - 1, end + 1))) keys.add(key)
      }
    }
  }
  return keys
}

/** CSV 导出按显式路径归属：/api/v1/products/${id}/bugs → 契约 /products/{productId}/bugs。 */
function opIdOfPath(literal) {
  const segments = literal.replace(/^\/api\/v1/, '').split('/').slice(1)
    .map((segment) => (segment.includes('${') ? '{}' : segment))
  for (const [opId, op] of operations) {
    const candidate = op.path.split('/').slice(1).map((segment) => (segment.includes('{') ? '{}' : segment))
    if (candidate.length === segments.length && candidate.every((segment, i) => segment === segments[i] || segment === '{}')) {
      return opId
    }
  }
  return undefined
}

/** opId → 前端实发字段集（收集点：api 层封装体内的直发键 + 页面/组件调用点 + CSV 导出）。 */
const frontend = new Map()
function addFrontendKeys(opId, keys) {
  const set = frontend.get(opId) ?? new Set()
  for (const key of keys) set.add(key)
  frontend.set(opId, set)
}
for (const file of walk(webSrc, skipFront)) {
  if (!/\.(tsx?|mts)$/.test(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/\b(\w+)\s*\(/g)) {
    const opId = operations.has(m[1]) ? m[1] : wrapperOps.get(m[1])
    if (!opId) continue
    const before = text.slice(Math.max(0, m.index - 30), m.index)
    if (/(?:function|const|let|var)\s+$/.test(before)) continue // 定义点非调用点
    const open = m.index + m[0].length - 1
    const close = matchPair(text, open)
    if (close === -1) continue
    addFrontendKeys(opId, filterKeysIn(text.slice(open + 1, close)))
  }
  for (const m of text.matchAll(/\bexportCsv\s*\(/g)) {
    const open = m.index + m[0].length - 1
    const close = matchPair(text, open)
    if (close === -1) continue
    const args = text.slice(open + 1, close)
    const path = args.match(/^\s*(['"`])([^'"`]+)\1/)
    const opId = path ? opIdOfPath(path[2]) : undefined
    if (opId) addFrontendKeys(opId, filterKeysIn(args.slice(path[0].length)))
  }
}

// ─────────────────────────── 四、三方 diff ───────────────────────────

/** 注册表 → 该注册表服务的契约端点声明并集（注册表被多端点共用，后端侧按注册表粒度比）。 */
const contractByRegistry = new Map()
for (const [opId, op] of operations) {
  const registry = backend.get(opId)?.registry ?? `op:${opId}`
  const union = contractByRegistry.get(registry) ?? new Set()
  for (const field of op.fields) union.add(field)
  contractByRegistry.set(registry, union)
}

/**
 * 已登记遗留（契约与领域卡声明、后端未实现；本卡不改业务逻辑）——豁免但每次运行都回显，防静默腐烂：
 *   listFiles filters[extension]：platform 卡 §5 filterable 含 extension，FileQueryService 只接 objectType/objectId；
 *   listGroups filters[id]：org 卡 §5 组列表 filterable 含 id，GroupQueryService.list 未接任何 DSL（page/limit/sort/q 同样缺）。
 * 实现任一即删对应行，门禁自动恢复红灯。
 */
const KNOWN_GAPS = new Set(['listFiles:filters[extension]'])

let gapHits = 0
for (const [opId, op] of operations) {
  const back = backend.get(opId)
  const front = frontend.get(opId) ?? new Set()
  const registry = back.registry ?? `op:${opId}`

  if (!back.found) {
    problems.push(`R5 后端白名单解析失败：${opId}（${back.via}）——解析器覆盖度自检，勿静默放行`)
    continue
  }
  for (const field of op.fields) {
    if (KNOWN_GAPS.has(`${opId}:filters[${field}]`)) {
      gapHits++
      continue
    }
    if (back.fields.has(field)) continue
    problems.push(
      back.fields.size === 0
        ? `R2 契约声明但后端未接 filters（静默忽略）：${opId} ${op.method.toUpperCase()} ${op.path} filters[${field}]`
        : `R2 契约声明但后端收不了（40001）：${opId} filters[${field}]（后端白名单 ${registry === `op:${opId}` ? '无' : registry}）`,
    )
  }
  for (const field of front) {
    if (!op.fields.has(field)) problems.push(`R3 前端实发但契约未声明：${opId} filters[${field}]`)
    if (!back.fields.has(field)) problems.push(`R4 前端实发但后端收不了：${opId} filters[${field}]`)
  }
}

/** R1 注册表粒度：注册表可收字段在该注册表服务的任一契约端点都没声明 → 孤儿。 */
const exemptRegistries = new Set()
for (const [cls, info] of javaClasses) {
  if (!info.text.includes('filter-fields-ok')) continue
  for (const varName of info.registries.keys()) exemptRegistries.add(`${cls}.${varName}`)
}
const byRegistry = new Map()
for (const [opId, back] of backend) {
  if (!back.registry) continue
  const entry = byRegistry.get(back.registry) ?? { fields: back.fields, ops: [] }
  entry.ops.push(opId)
  byRegistry.set(back.registry, entry)
}
for (const [registry, entry] of byRegistry) {
  if (exemptRegistries.has(registry)) continue
  const declared = contractByRegistry.get(registry) ?? new Set()
  for (const field of entry.fields) {
    if (declared.has(field) || SERVER_INJECTED.has(field)) continue
    problems.push(`R1 后端注册表可收但契约全无声明：${registry} filters[${field}]（服务端点 ${entry.ops.join(', ')}）`)
  }
}

if (DEBUG) {
  for (const [opId, op] of operations) {
    const back = backend.get(opId)
    const front = frontend.get(opId) ?? new Set()
    console.log(
      `${opId}\n  契约 [${[...op.fields]}]${back.registry ? `\n  后端 ${back.registry}` : ''} [${[...back.fields]}]` +
        `\n  前端 [${[...front]}]  via ${back.via}`,
    )
  }
}

if (problems.length > 0) {
  console.error(`check-filter-fields：${problems.length} 处违规（契约 ${operations.size} 操作）`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
if (gapHits < KNOWN_GAPS.size) {
  console.error(`check-filter-fields：已登记遗留已修复，请删除 KNOWN_GAPS 豁免（命中 ${gapHits}/${KNOWN_GAPS.size}）`)
  process.exit(1)
}
const registryCount = new Set([...backend.values()].map((b) => b.registry).filter(Boolean)).size
console.log(
  `check-filter-fields：0 违规（契约 ${operations.size} 操作 · 后端 ${registryCount} 注册表 · 三方对齐；` +
    `已登记遗留 ${gapHits} 条：${[...KNOWN_GAPS].join(' / ')}）`,
)
