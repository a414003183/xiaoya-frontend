// check-soft-delete-version（T54 · AUDIT BE-01）：软删/恢复必须与 update 走同一套乐观锁协议。
//
// 规则：后端 Java 里凡经 Row API 写 `deleted_at` 的语句（`Db.updateByCondition` / `Db.update` / `Db.updateBySql`），
//   必须用 `SoftDeletes.apply(...)`（内部 `lock_version = lock_version + 1`）——直接写会绕过版本列，
//   并发的旧版本 update 仍能匹配并把整行（含 deleted_at=NULL）写回：数据静默复活且不报 409。
// 判据按**语句**取（实参括号配对），故跨行写法同样命中；`// soft-delete-ok：<理由>` 行内豁免
//   （现仅 V8 的 stakeholder / team_member：这两张关联表没有 lock_version 列，无版本可推，见 T54 卡遗留）。
// 免锁路径（path/views/sort 等派生列自增）天然不含 deleted_at，不受本门禁约束。
//
// 已知上限（ponytail）：只认字面量在语句内的写法——`Row` 先建好、再传给 `Db.update*` 的间接写法不覆盖；
//   升级路径 = 扫出 `Row.of("deleted_at"` 的全部出现位置并要求所在方法内出现 SoftDeletes.apply。
//
// 用法：`node tools/contract-check/check-soft-delete-version.mjs [--selftest]`
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const GATE = 'check-soft-delete-version'
const root = join(import.meta.dirname, '..', '..')
const backendSrc = join(root, 'backend', 'src', 'main', 'java')

/** 写路径入口（实参里出现 deleted_at 即须走 SoftDeletes.apply）。 */
const WRITE_CALL = /\bDb\s*\.\s*(updateByCondition|update|updateBySql)\s*\(/g
const EXEMPT = 'soft-delete-ok'

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (entry.endsWith('.java')) yield full
  }
}

/** 从 open 处的 '(' 起做括号配对，返回实参文本（跳过字符串字面量内的括号）。 */
function argsAt(text, openIndex) {
  let depth = 0
  let quote = null
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i]
    if (quote !== null) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return text.slice(openIndex + 1, i)
    }
  }
  return text.slice(openIndex + 1)
}

/** 纯函数：一段源码 → { hits, exempted }（`soft-delete-ok` 豁免：可写在本行、语句内，或语句紧邻的上一行）。 */
export function scanSource(text) {
  const hits = []
  let exempted = 0
  const lines = text.split('\n')
  for (const match of text.matchAll(WRITE_CALL)) {
    const openIndex = match.index + match[0].length - 1
    const args = argsAt(text, openIndex)
    if (!args.includes('deleted_at')) continue
    const lineNo = text.slice(0, match.index).split('\n').length
    const lineText = lines[lineNo - 1] ?? ''
    const statementEnd = openIndex + args.length + 1
    const prevLineStart = lineNo >= 2 ? text.indexOf(lines[lineNo - 2]) : 0
    const region = text.slice(Math.max(0, prevLineStart), statementEnd)
    if (region.includes(EXEMPT)) {
      exempted += 1
      continue
    }
    hits.push({ line: lineNo, label: `${match[1]} 直写 deleted_at（必须 SoftDeletes.apply）`, text: lineText.trim().slice(0, 120) })
  }
  return { hits, exempted }
}

function selftest() {
  const samples = [
    ['Db.updateByCondition("doc", Row.of("deleted_at", at), where);', true],
    ['Db.updateByCondition("stakeholder",\n    Row.of("deleted_at", now).set("updated_by", actor),\n    where);', true],
    ['Db.update("file", Row.of("deleted_at", now), where);', true],
    ['Db.updateBySql("UPDATE file SET deleted_at = ?", args);', true],
    ['SoftDeletes.apply("doc", Row.of("deleted_at", at).setRaw("x", "y"), where);', false],
    ['Db.updateByCondition("doc", Row.of("views", views), new QueryColumn("id").eq(id));', false],
    ['Db.updateByCondition("plan", Row.of("parent_id", 0), new QueryColumn("id").eq(id));', false],
    ['mapper.selectListByCondition(DELETED_AT.isNull());', false],
    ['// soft-delete-ok：V8 表无 lock_version\nDb.updateByCondition("team_member",\n    Row.of("deleted_at", now),\n    where);', false],
    ['Db.updateByCondition("story", Row.of("plan_id", planId), where); // deleted_at 只是注释', false],
  ]
  const failures = []
  for (const [source, expected] of samples) {
    const fired = scanSource(source).hits.length > 0
    if (fired !== expected) {
      failures.push(`样本「${source.split('\n')[0]}」${expected ? '应报红' : '应放行'}，实际 ${fired ? '报红' : '放行'}`)
    }
  }
  const two = scanSource('Db.updateByCondition("doc", Row.of("deleted_at", a), w);\nDb.update("doc", Row.of("deleted_at", b), w);')
  if (two.hits.length !== 2) failures.push(`两条语句应各报一次，实际 ${two.hits.length}`)
  const crossing = scanSource('Db.updateByCondition("doc",\n  Row.of("deleted_at", at),\n  where);')
  if (crossing.hits.length !== 1 || crossing.hits[0].line !== 1) failures.push('跨行语句应报在语句起始行')
  const exemptOnly = scanSource('// soft-delete-ok：理由\nDb.update("team_member", Row.of("deleted_at", now), w);')
  if (exemptOnly.exempted !== 1 || exemptOnly.hits.length !== 0) failures.push('豁免统计应只数被豁免的语句（不含门禁自身文案）')
  if (failures.length > 0) {
    console.error(`${GATE} --selftest：${failures.length} 处自检失败`)
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }
  console.log(`${GATE} --selftest：${samples.length + 2} 项自检全过（好样本干净、坏样本必红）`)
}

if (process.argv.includes('--selftest')) {
  selftest()
  process.exit(0)
}

const problems = []
let scanned = 0
let exempted = 0
for (const file of walk(backendSrc)) {
  scanned += 1
  const rel = relative(root, file).replaceAll(sep, '/')
  const result = scanSource(readFileSync(file, 'utf8'))
  exempted += result.exempted
  for (const hit of result.hits) {
    problems.push(`${rel}:${hit.line}  ${hit.label}  →  ${hit.text}`)
  }
}

if (scanned < 200) {
  console.error(`${GATE}：扫描面异常（只扫到 ${scanned} 个 Java 文件，应 >200）——路径或过滤写错了？`)
  process.exit(1)
}
if (problems.length > 0) {
  console.error(`${GATE}：${problems.length} 处违规（扫描 ${scanned} 文件）`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log(`${GATE}：0 违规（软删一律经 SoftDeletes.apply；扫描 ${scanned} 文件，豁免 ${exempted} 处）`)
