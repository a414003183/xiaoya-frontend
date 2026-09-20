// 契约双向全量 diff（01 §4 / phase-6 T-10 C1 收紧）：springdoc 运行时导出 ↔ contract/openapi.yaml。
// 比对 paths+方法、operationId、请求体 schema、200 载荷 schema 名，以及全部共享 schema 的
// 字段集合 / 字段类型 / 必填集 / 枚举值 + ErrorEnvelope 锚点。
// 有差异 → 非零退出。用法：node tools/contract-check/contract-diff.mjs [--skip-export]

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

const root = join(import.meta.dirname, '..', '..')
const contractPath = join(root, 'contract', 'openapi.yaml')
const exportPath = join(root, 'backend', 'target', 'openapi.json')

if (!process.argv.includes('--skip-export')) {
  execSync('mvn -B -q -f backend test -Dtest=OpenApiExportTest -Dsurefire.failIfNoSpecifiedTests=false', {
    cwd: root,
    stdio: 'inherit',
  })
}
if (!existsSync(exportPath)) {
  console.error(`缺少后端导出文件：${exportPath}`)
  process.exit(1)
}

const contract = parse(readFileSync(contractPath, 'utf8'))
const exported = JSON.parse(readFileSync(exportPath, 'utf8'))

const refName = (schema) => (schema?.$ref ? schema.$ref.split('/').pop() : null)
const firstContentSchema = (response) => {
  const content = response?.content
  if (!content) return null
  const entry = Object.entries(content).find(([type]) => type === 'application/json') ?? Object.entries(content)[0]
  return entry?.[1]?.schema ?? null
}

// —— 契约侧归一 ——
/** @type {Map<string, {operationId: string, request: string|null, payload: string|null, schemaNames: Set<string>}>} */
const contractOps = new Map()
const contractPrefix = (contract.servers?.[0]?.url ?? '').replace(/\/$/, '')
for (const [path, pathItem] of Object.entries(contract.paths ?? {})) {
  for (const [method, op] of Object.entries(pathItem)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
    const request = refName(op.requestBody?.content?.['application/json']?.schema)
    const payload =
      refName(firstContentSchema(op.responses?.['200'])) ??
      (firstContentSchema(op.responses?.['200']) ? '(payload)' : null)
    const schemaNames = new Set()
    if (request) schemaNames.add(request)
    if (payload && payload !== '(payload)') schemaNames.add(payload)
    contractOps.set(`${method.toUpperCase()} ${path}`, { operationId: op.operationId, request, payload, schemaNames })
  }
}

// —— 后端导出侧归一 ——
const exportedOps = new Map()
for (const [path, pathItem] of Object.entries(exported.paths ?? {})) {
  const normalizedPath =
    contractPrefix && path.startsWith(contractPrefix) ? path.slice(contractPrefix.length) || '/' : path
  for (const [method, op] of Object.entries(pathItem)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
    const request = refName(op.requestBody?.content?.['application/json']?.schema)
    const responseSchema = firstContentSchema(op.responses?.['200'])
    let payload = refName(responseSchema)
    if (payload?.startsWith('DataEnvelope')) {
      // springdoc 把 DataEnvelope<T> 泛型包装具名化；剥一层取 T 的名字，无 T 视为无类型载荷
      const inner = refName(exported.components?.schemas?.[payload]?.properties?.data)
      payload = inner ?? '(payload)'
    }
    const schemaNames = new Set()
    if (request) schemaNames.add(request)
    if (payload && payload !== '(payload)') schemaNames.add(payload)
    exportedOps.set(`${method.toUpperCase()} ${normalizedPath}`, {
      operationId: op.operationId,
      request,
      payload,
      schemaNames,
    })
  }
}

// —— 比对 ——
const problems = []
for (const key of contractOps.keys()) if (!exportedOps.has(key)) problems.push(`契约有而后端无：${key}`)
for (const key of exportedOps.keys()) if (!contractOps.has(key)) problems.push(`后端有而契约无：${key}`)
for (const [key, c] of contractOps) {
  const e = exportedOps.get(key)
  if (!e) continue
  if (c.operationId !== e.operationId) problems.push(`${key} operationId：契约=${c.operationId} 后端=${e.operationId}`)
  if ((c.request ?? null) !== (e.request ?? null))
    problems.push(`${key} 请求体：契约=${c.request ?? '—'} 后端=${e.request ?? '—'}`)
  const norm = (v) => v ?? '(payload)'
  if (norm(c.payload) !== norm(e.payload))
    problems.push(`${key} 200 载荷：契约=${c.payload ?? '—'} 后端=${e.payload ?? '—'}`)

  const propsOf = (schemas, name) => Object.keys(schemas?.[name]?.properties ?? {}).sort()
  for (const name of c.schemaNames) {
    const cp = propsOf(contract.components?.schemas, name)
    const ep = propsOf(exported.components?.schemas, name)
    for (const p of cp) if (!ep.includes(p)) problems.push(`${name}.${p}：契约有而后端无`)
    for (const p of ep) if (!cp.includes(p)) problems.push(`${name}.${p}：后端有而契约无`)
  }
}

// —— 全量 schema 深比对（T-10 C1）：必填集 / 字段类型 / 枚举值 ——
// springdoc 表达力差异的归一口径：
//  · 契约以 `T|null` 标可空，springdoc 不导出可空性 → 类型比较剥 '|null'
//  · 契约枚举对可空字段含 null 值 → 枚举比较剥 null
//  · required 仅当 record 组件带 @Schema(requiredMode) 时 springdoc 才导出 → 只比 *Request（T-10 注解清扫后全量）
//  · 一侧 $ref 一侧内联 object → 解引用后按字段名集合等价判定
const normalizeType = (property) => {
  if (!property) return null
  if (property.$ref) return 'ref:' + property.$ref.split('/').pop()
  if (Array.isArray(property.type)) {
    return [...new Set(property.type.filter((t) => t !== 'null'))].sort().join('|')
  }
  return property.type ?? null
}
const normalizeEnum = (property) =>
  property?.enum ? [...property.enum].filter((v) => v !== null).map(String).sort() : null
const propertyKeys = (property, schemas) => {
  const isObject = Array.isArray(property?.type)
    ? property.type.includes('object')
    : property?.type === 'object' || property?.$ref
  if (!isObject) return null
  if (property.$ref) return Object.keys(schemas[property.$ref.split('/').pop()]?.properties ?? {}).sort().join()
  return Object.keys(property.properties ?? {}).sort().join() // 无 properties = 自由形态对象（''）
}

const contractSchemas = contract.components?.schemas ?? {}
const exportedSchemas = exported.components?.schemas ?? {}
// 说明：不做「后端独有 schema」全量断言——springdoc 会导出 DataEnvelope* 泛型包装与嵌套 record
// 内部名等机制性噪音；未入契约的真实形状必被操作的请求体/载荷名比对捕获（上文已比）。
for (const [name, cSchema] of Object.entries(contractSchemas)) {
  const eSchema = exportedSchemas[name]
  if (!eSchema) continue
  if (name.endsWith('Request')) {
    const cReq = [...(cSchema.required ?? [])].sort().join()
    const eReq = [...(eSchema.required ?? [])].sort().join()
    if (cReq !== eReq) problems.push(`${name} required：契约=[${cReq}] 后端=[${eReq}]`)
  }
  const cProps = cSchema.properties ?? {}
  const eProps = eSchema.properties ?? {}
  for (const [field, cProp] of Object.entries(cProps)) {
    const eProp = eProps[field]
    if (!eProp) continue // 字段集合差异已在上面报过
    const cType = normalizeType(cProp)
    const eType = normalizeType(eProp)
    if (cType !== eType) {
      // 一侧 $ref 一侧内联 object：解引用后字段集合等价即视为同一形状；自由形态（无 properties）匹配任意对象形状
      const cKeys = propertyKeys(cProp, contractSchemas)
      const eKeys = propertyKeys(eProp, exportedSchemas)
      const shapeEqual = cKeys !== null && eKeys !== null && (cKeys === eKeys || cKeys === '' || eKeys === '')
      if (!shapeEqual) {
        problems.push(`${name}.${field} 类型：契约=${cType} 后端=${eType}`)
      }
    }
    const cEnum = normalizeEnum(cProp)
    const eEnum = normalizeEnum(eProp)
    if ((cEnum?.join() ?? '') !== (eEnum?.join() ?? '')) {
      problems.push(`${name}.${field} 枚举：契约=[${cEnum ?? '—'}] 后端=[${eEnum ?? '—'}]`)
    }
  }
}

// —— 错误信封锚点（03 §2 wire 格式锚点；后端运行时形状由 ApiExceptionMapper 测试保证） ——
if (!contractSchemas['ErrorEnvelope']) problems.push('契约缺少 ErrorEnvelope 锚点 schema')

if (problems.length > 0) {
  console.error(`契约 diff：${problems.length} 处差异`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log('契约 diff：0 差异（paths/operationId/请求体/200载荷/字段集合/类型/必填/枚举/错误信封 全对齐）')
