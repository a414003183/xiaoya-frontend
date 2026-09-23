// check-contract-descriptions（T66 · AUDIT DB-08/13/15）：契约描述覆盖率 + required 显式化 + 变更端点 422 声明。
//
// 规则（对 contract/openapi.yaml）：
//   ① 每条 operation 必须有 summary 或 description，且含中文——只暴露 operationId 的端点没法读；
//   ② 每个 schema 属性必须有 description 且含中文（oneOf 成员的顶层属性同样算，它们本就是顶层 schema）；
//   ③ 每个 object schema 必须显式写 required（可为空 = 明确「无必填」；oneOf 包装本身豁免，但它的成员必须写）——
//      required 只标后端真拦的字段（契约说谎比缺注释更糟，见 CONVENTIONS §4）；
//   ④ 每个变更端点（post/put/patch/delete）必须声明 422——统一错误面（T69）：校验失败/守卫拒绝在任何写端点都可能出现（DB-08）。
// 中文判据：文本里出现 CJK（允许中英混排；纯英文/纯符号视为没写）。
//
// 已知上限（ponytail）：② 只查顶层属性，嵌套内联对象的子属性不强制（ErrorEnvelope.error 内层等）；
//   升级路径 = 递归下钻 properties/items。④ 只看有没有声明 422，不校验锚点语义选得对不对（那是 review 的事）。
//
// 用法：`node tools/contract-check/check-contract-descriptions.mjs [--selftest]`
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { ROOT } from './scan-roots.mjs'

const GATE = 'check-contract-descriptions'
const CJK = /[一-鿿]/
const MUTATING = new Set(['post', 'put', 'patch', 'delete'])
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete'])

/** 纯函数：契约文本 → 违规行（供 --selftest 与真实扫描共用）。 */
export function scanContract(text) {
  const problems = []
  const doc = parse(text)
  const lines = text.split(/\r?\n/)

  const blockOf = (head) => {
    const start = lines.findIndex((l) => l === head)
    if (start < 0) return [start, start]
    // 块尾 = 下一个同级或更浅的键（按前缀空格数判定）
    const indent = head.length - head.trimStart().length
    let end = start + 1
    while (end < lines.length) {
      const line = lines[end]
      if (line.trim() !== '' && line.length - line.trimStart().length <= indent) break
      end++
    }
    return [start, end]
  }

  const lineOfSchema = (name) => {
    const [start] = blockOf(`    ${name}:`)
    return (start < 0 ? 0 : start) + 1
  }
  const lineOfProperty = (schema, field) => {
    const [start, end] = blockOf(`    ${schema}:`)
    if (start < 0) return 0
    const idx = lines.findIndex((l, i) => i > start && i < end && new RegExp(`^        ${field}:`).test(l))
    return (idx < 0 ? start : idx) + 1
  }
  const lineOfOperation = (path, method) => {
    const [start, end] = blockOf(`  ${path}:`)
    if (start < 0) return 0
    const idx = lines.findIndex((l, i) => i > start && i < end && l === `    ${method}:`)
    return (idx < 0 ? start : idx) + 1
  }

  // —— ① 操作描述 + ④ 变更端点 422 ——
  let operations = 0
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const [method, op] of Object.entries(item ?? {})) {
      if (!METHODS.has(method)) continue
      operations += 1
      const key = `${method.toUpperCase()} ${path}`
      const summary = op.summary ?? op.description
      if (typeof summary !== 'string' || !CJK.test(summary)) {
        problems.push({ line: lineOfOperation(path, method), label: '操作缺中文描述（summary/description）', text: key })
      }
      if (MUTATING.has(method) && !op.responses?.['422']) {
        problems.push({ line: lineOfOperation(path, method), label: '变更端点缺 422 声明（统一错误面，DB-08）', text: key })
      }
    }
  }

  // —— ② 属性描述 + ③ required 显式 ——
  const schemas = doc.components?.schemas ?? {}
  let properties = 0
  for (const [name, schema] of Object.entries(schemas)) {
    const props = schema?.properties ?? {}
    properties += Object.keys(props).length
    for (const [field, prop] of Object.entries(props)) {
      const desc = prop?.description
      if (typeof desc !== 'string' || !CJK.test(desc)) {
        problems.push({ line: lineOfProperty(name, field), label: '属性缺中文描述（description）', text: `${name}.${field}` })
      }
    }
    const isObject = Object.keys(props).length > 0 || schema?.type === 'object'
    const isOneOfWrapper = Array.isArray(schema?.oneOf) && Object.keys(props).length === 0
    if (isObject && !isOneOfWrapper && !Array.isArray(schema?.required)) {
      problems.push({ line: lineOfSchema(name), label: 'object schema 未显式声明 required（可为空，DB-13）', text: name })
    }
  }
  problems.sort((a, b) => a.line - b.line)
  return { problems, operations, properties, schemas: Object.keys(schemas).length }
}

function selftest() {
  const ok = `
openapi: 3.1.0
paths:
  /things:
    get:
      operationId: listThings
      summary: 东西列表
      responses:
        '200':
          description: 列表
    post:
      operationId: createThing
      summary: 新建东西
      responses:
        '200':
          description: 东西
        '422':
          description: 校验失败
components:
  schemas:
    ThingView:
      type: object
      required: [id]
      properties:
        id:
          type: integer
          description: 主键
    ThingRequest:
      type: object
      required: []
      properties:
        name:
          type: string
          description: 名称
`
  const samples = [
    [ok, 0, '合规契约应 0 违规'],
    [ok.replace('      summary: 新建东西\n', ''), 1, '操作缺描述应报 1'],
    [ok.replace('      summary: 新建东西', '      summary: create thing'), 1, '纯英文摘要应报 1'],
    [ok.replace("        '422':\n          description: 校验失败\n", ''), 1, '变更端点缺 422 应报 1'],
    [ok.replace('    get:\n      operationId: listThings', '    delete:\n      operationId: deleteThing'), 1, 'delete 只缺 422 时报 1（描述仍在）'],
    [ok.replace('          description: 名称\n', ''), 1, '属性缺描述应报 1'],
    [ok.replace('      required: [id]\n', ''), 1, 'object schema 缺 required 应报 1'],
    [ok.replace('      required: []\n', ''), 1, '空 required 也必须显式写，缺了应报 1'],
  ]
  const failures = []
  for (const [text, expected, label] of samples) {
    const { problems } = scanContract(text)
    if (problems.length !== expected) {
      failures.push(`${label}——实际 ${problems.length}：${problems.map((p) => p.text).join(' / ')}`)
    }
  }
  // 行号必须指到出事的那一行（拿缺 422 的样本验）
  const broken = ok.replace("        '422':\n          description: 校验失败\n", '')
  const hit = scanContract(broken).problems[0]
  const expectLine = broken.split('\n').findIndex((l) => l === '    post:') + 1
  if (hit?.line !== expectLine) failures.push(`缺 422 应红到 post 行（${expectLine}），实际第 ${hit?.line} 行`)
  // 属性缺描述的行号
  const broken2 = ok.replace('          description: 名称\n', '')
  const hit2 = scanContract(broken2).problems[0]
  const expectLine2 = broken2.split('\n').findIndex((l) => l === '        name:') + 1
  if (hit2?.line !== expectLine2) failures.push(`属性缺描述应红到 name 行（${expectLine2}），实际第 ${hit2?.line} 行`)
  // oneOf 包装豁免 required，但成员不豁免
  const oneOf = `
components:
  schemas:
    Batch:
      description: 双形态
      oneOf:
        - $ref: '#/components/schemas/BatchCreate'
    BatchCreate:
      type: object
      required: [items]
      properties:
        items:
          type: array
          description: 项
`
  if (scanContract(oneOf).problems.length !== 0) failures.push('oneOf 包装 + 合规成员应 0 违规')
  const oneOfBad = oneOf.replace('      required: [items]\n', '')
  const hit3 = scanContract(oneOfBad).problems[0]
  if (!hit3 || !hit3.text.includes('BatchCreate')) failures.push('oneOf 成员缺 required 应报红 BatchCreate')
  if (failures.length > 0) {
    console.error(`${GATE} --selftest：${failures.length} 处自检失败`)
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }
  console.log(`${GATE} --selftest：${samples.length + 5} 项自检全过（好样本干净、坏样本必红且红到行）`)
}

if (process.argv.includes('--selftest')) {
  selftest()
  process.exit(0)
}

const contractPath = join(ROOT, 'contract', 'openapi.yaml')
const { problems, operations, properties, schemas } = scanContract(readFileSync(contractPath, 'utf8'))
if (operations < 300 || properties < 1000 || schemas < 200) {
  console.error(
    `${GATE}：扫描面异常（操作 ${operations} / 属性 ${properties} / schema ${schemas}），门禁失效——检查 contract/openapi.yaml 是否被截断或换位`,
  )
  process.exit(1)
}
if (problems.length > 0) {
  console.error(`${GATE}：${problems.length} 处违规（操作 ${operations} 条 / 属性 ${properties} 个 / schema ${schemas} 个）`)
  for (const problem of problems) console.error(`  contract/openapi.yaml:${problem.line}  ${problem.label}  →  ${problem.text}`)
  process.exit(1)
}
console.log(
  `${GATE}：0 违规（描述覆盖率 100%——操作 ${operations} 条 / 属性 ${properties} 个全有中文描述；object schema required 全显式；变更端点 422 全声明）`,
)
