// check-audit-append-only（T53 · AUDIT SEC-05）：审计表只追加。
//
// 规则：`backend/src/main/java` 里**不得**出现对 audit_log 的改/删（以及绕开 AuditRecorder 的裸 INSERT）——
//   1. 裸 SQL：`UPDATE audit_log` / `DELETE FROM audit_log` / `INSERT INTO audit_log`；
//   2. MyBatis-Flex Row API：`Db.update("audit_log"…)` / `Db.delete("audit_log"…)`；
//   3. audit 包内对 mapper 的改删调用：`mapper.update*` / `mapper.delete*` / `.updateByCondition(` …
// 为什么要有这条门禁：生产的 DB 授权规约是"应用账号对 audit_log 只授 INSERT/SELECT"（README §部署），
// 于是任何一条 UPDATE/DELETE 代码路径上线后**必然 500**——在代码侧挡住比在生产发现便宜。
// 迁移目录不在扫描面内：DDL（`ALTER TABLE audit_log ADD COLUMN`）与行级改删是两回事。
//
// 用法：`node tools/contract-check/check-audit-append-only.mjs [--selftest]`
// 行内豁免：`// audit-append-only-ok：<理由>`（确有必要的保留策略/归档脚本，理由写清）
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const GATE = 'check-audit-append-only'
const root = join(import.meta.dirname, '..', '..')
const backendSrc = join(root, 'backend', 'src', 'main', 'java')

/** 规则：[正则, 说明]；只在 audit 包内生效的单独一组。 */
const RULES = [
  [/\bUPDATE\s+audit_log\b/i, '裸 SQL 改审计行（audit_log 只追加）'],
  [/\bDELETE\s+FROM\s+audit_log\b/i, '裸 SQL 删审计行（audit_log 只追加）'],
  [/\bINSERT\s+INTO\s+audit_log\b/i, '裸 SQL 写审计行（唯一写入口是 AuditRecorder#record）'],
  [/\bDb\s*\.\s*(update|delete)\s*\(\s*"audit_log"/i, 'Row API 改/删审计行（audit_log 只追加）'],
  [/\bDb\s*\.\s*insert\s*\(\s*"audit_log"/i, 'Row API 写审计行（唯一写入口是 AuditRecorder#record）'],
]

const AUDIT_PACKAGE_RULES = [
  [/\bmapper\s*\.\s*(update|delete)\w*\s*\(/i, 'audit 包里对 mapper 的改/删调用'],
  [/\.\s*(updateByCondition|updateById|deleteByCondition|deleteById)\s*\(/, 'audit 包里对审计表的改/删调用'],
]

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (entry.endsWith('.java')) yield full
  }
}

/** 纯函数：一段源码 → 违规行（行内 `audit-append-only-ok` 豁免）。 */
export function scanSource(text, { auditPackage = false } = {}) {
  const hits = []
  const rules = auditPackage ? [...RULES, ...AUDIT_PACKAGE_RULES] : RULES
  text.split('\n').forEach((line, index) => {
    if (line.includes('audit-append-only-ok')) return
    for (const [pattern, label] of rules) {
      if (pattern.test(line)) {
        hits.push({ line: index + 1, label, text: line.trim().slice(0, 120) })
        break
      }
    }
  })
  return hits
}

function selftest() {
  const samples = [
    ['db.update("audit_log", row)', true, false],
    ['DELETE FROM audit_log WHERE created_at < ?', true, false],
    ['UPDATE audit_log SET ip = ? WHERE id = ?', true, false],
    ['INSERT INTO audit_log (account) VALUES (?)', true, false],
    ['db.delete("audit_log", "id", 1L)', true, false],
    ['// UPDATE audit_log ... // audit-append-only-ok：归档脚本，见 ops/retention.md', false, false],
    ['mapper.insert(po)', false, true],
    ['mapper.updateByCondition(condition)', true, true],
    ['mapper.deleteById(1L)', true, true],
    ['SELECT account FROM audit_log WHERE action = ?', false, false],
    ['mapper.selectListByQuery(query.limit(offset, limit))', false, true],
  ]
  const failures = []
  for (const [source, expected, auditPackage] of samples) {
    const hits = scanSource(source, { auditPackage })
    const fired = hits.length > 0
    if (fired !== expected) {
      failures.push(`样本「${source}」${expected ? '应报红' : '应放行'}，实际 ${fired ? '报红' : '放行'}（auditPackage=${auditPackage}）`)
    }
  }
  if (scanSource('UPDATE audit_log SET x = 1', {}).length !== 1) failures.push('规则应只报一次（命中即停）')
  if (failures.length > 0) {
    console.error(`${GATE} --selftest：${failures.length} 处自检失败`)
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }
  console.log(`${GATE} --selftest：${samples.length + 1} 项自检全过（好样本干净、坏样本必红）`)
}

if (process.argv.includes('--selftest')) {
  selftest()
  process.exit(0)
}

const problems = []
let scanned = 0
for (const file of walk(backendSrc)) {
  scanned += 1
  const rel = relative(root, file).replaceAll(sep, '/')
  const auditPackage = rel.includes('/platform/audit/')
  for (const hit of scanSource(readFileSync(file, 'utf8'), { auditPackage })) {
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
console.log(`${GATE}：0 违规（审计表只追加；扫描 ${scanned} 文件）`)
