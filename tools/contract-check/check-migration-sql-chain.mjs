// check-migration-sql-chain（T65 / T53 遗留）：**SQL 迁移链必须自洽**——SQL 迁移不得引用
// 「Java 迁移建的表/列」。不变量的来历（T53 实测）：旧库导入 CLI（tools/migration）的 Flyway 只跑
// `--schema-dir` 里的 SQL（Java 迁移在那边无法编译执行，见 `Main#markJavaSeedMigrated`），于是
// `CREATE INDEX … ON user_role`（user_role 由 V33 Java 迁移建）会让旧库导入在那一版直接断链
// （`Table "user_role" not found`）；后端 `mvn test` 与前端 CI 全绿都不报，只有 tools/migration
// 的迁移单测会红。要给这类表加索引/列，写成 Java 迁移（版本序排在建表那条之后，如 V38）。
//
// 判定方式（静态，不用数据库）：
//   1. 扫全部 Java 迁移（`*__*.java` 且 extends BaseJavaMigration，两处落点都扫：`db.migration` 与
//      `net.zentao.db.migration`），解析出「Java 建的表 + 其列」与「Java ADD COLUMN 加的列」；
//   2. 扫全部 SQL 迁移，逐语句找**表引用位置**（ALTER TABLE / INSERT INTO / UPDATE / DELETE FROM /
//      FROM / JOIN / CREATE INDEX … ON）；命中 Java 建的表 → 红到行。
//      同语句里出现「Java 加的列 + 其所属表」也红（表虽是 SQL 建的，列是 Java 建的，SQL 链同样断）。
//   表名只在引用位置匹配——`team_member.role VARCHAR(30)` 这种同名列定义不许误报。
//
// 规则自检：`node tools/contract-check/check-migration-sql-chain.mjs --selftest`
// （好/坏样本双向自证 + 扫描面下限：SQL 迁移文件/语句数、Java 迁移文件数、Java 建表数各一档）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, assertScanFloor, report, walkFiles } from './scan-roots.mjs'

const GATE = 'check-migration-sql-chain'
const MIGRATION_DIR = join(ROOT, 'backend', 'src', 'main', 'resources', 'db', 'migration')
const BACKEND_SRC = join(ROOT, 'backend', 'src', 'main', 'java')

const MIN_SQL_FILES = 30
const MIN_SQL_STATEMENTS = 100
const MIN_JAVA_FILES = 5
const MIN_JAVA_TABLES = 3

/** 去掉注释与字符串字面量，但**保留换行**（行号必须按原始文本精确）。 */
export function stripNoiseKeepLines(text) {
  return text
    .replaceAll(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replaceAll(/--[^\n]*/g, ' ')
    .replaceAll(/'(?:[^']|'')*'/g, "''")
    .replaceAll(/"""/g, ' ')
}

/** 表引用位置：这些关键字后面的标识符才算「引用了一张表」（`on` 只认 `CREATE INDEX … ON`，见下）。 */
const TABLE_REF = /\b(?:alter\s+table|insert\s+into|update|delete\s+from|from|join)\s+([a-z_][a-z0-9_]*)/gi
const INDEX_ON_REF = /\bcreate\s+(?:unique\s+)?index\b[^;]*?\bon\s+([a-z_][a-z0-9_]*)/gi
/** 限定引用（`<表>.<列>`）：表达式里出现 Java 建的表也算引用。 */
const QUALIFIED_REF = /\b([a-z_][a-z0-9_]*)\s*\./gi
/** DDL 关键字——列定义/表引用里出现它们开头的行不是列名。 */
const NOT_A_NAME = /^(constraint|primary|unique|key|index|check|foreign)$/i

/**
 * 解析 Java 迁移的 DDL 清单。
 * @returns {{tables: Map<string, Set<string>>, columns: Map<string, Set<string>>, files: number}}
 *   tables：Java CREATE TABLE 的表 → 列集合；columns：表 → Java ADD COLUMN 加的列集合。
 */
export function parseJavaDdl(javaSources) {
  const tables = new Map()
  const columns = new Map()
  for (const source of javaSources) {
    const clean = stripNoiseKeepLines(source).replaceAll(/"/g, ' ').replaceAll(/'/g, ' ')
    for (const match of clean.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
      const body = balancedBody(clean, match.index + match[0].length)
      const cols = new Set()
      for (const part of splitTopLevel(body)) {
        const name = part.trim().match(/^([a-z_][a-z0-9_]*)/i)?.[1]?.toLowerCase()
        if (!name || NOT_A_NAME.test(name)) continue
        cols.add(name)
      }
      tables.set(match[1], cols)
    }
    for (const match of clean.matchAll(/\balter\s+table\s+([a-z_][a-z0-9_]*)\s+add\s+(?:column\s+)?([a-z_][a-z0-9_]*)/gi)) {
      if (NOT_A_NAME.test(match[2])) continue
      if (!columns.has(match[1])) columns.set(match[1], new Set())
      columns.get(match[1]).add(match[2].toLowerCase())
    }
  }
  return { tables, columns, files: javaSources.length }
}

/** 从开括号后一位开始取配对括号内的文本（嵌套括号不提前收尾，如 `UNIQUE (name)`）。 */
function balancedBody(text, from) {
  let depth = 1
  for (let i = from; i < text.length; i++) {
    if (text[i] === '(') depth++
    if (text[i] === ')') {
      depth--
      if (depth === 0) return text.slice(from, i)
    }
  }
  return text.slice(from)
}

/** 按顶层逗号切列定义（括号深度 >0 时不切）。 */
function splitTopLevel(body) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of body) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current)
  return parts
}

/**
 * 扫一条（已去噪）SQL 文本：命中 Java 建的对象 → `{line, text, problem}` 列表。
 * @param {string} sql 去噪后、保留换行的 SQL
 * @param {{tables: Map<string, Set<string>>, columns: Map<string, Set<string>>}} inventory
 */
export function scanSql(sql, inventory) {
  const problems = []
  const lineOf = (index) => sql.slice(0, index).split('\n').length
  const sourceLines = sql.split('\n')
  const emit = (index, problem) => {
    const line = lineOf(index)
    problems.push({ line, text: (sourceLines[line - 1] ?? '').trim(), problem })
  }
  const flagged = new Set()
  const flagTable = (match, nameIndex, table) => {
    if (!inventory.tables.has(table) || flagged.has(`${nameIndex}:${table}`)) return
    flagged.add(`${nameIndex}:${table}`)
    emit(nameIndex,
      `引用了 Java 迁移建的表 \`${table}\`（旧库导入 CLI 只跑 SQL，这一版会断链）——改写成 Java 迁移并排在建表版本之后`)
  }
  for (const match of sql.matchAll(TABLE_REF)) {
    flagTable(match, match.index + match[0].length - match[1].length, match[1].toLowerCase())
  }
  for (const match of sql.matchAll(INDEX_ON_REF)) {
    flagTable(match, match.index + match[0].length - match[1].length, match[1].toLowerCase())
  }
  for (const match of sql.matchAll(QUALIFIED_REF)) {
    if (!inventory.tables.has(match[1].toLowerCase())) continue
    flagTable(match, match.index, match[1].toLowerCase())
  }
  for (const [table, added] of inventory.columns) {
    if (added.size === 0) continue
    for (const statement of splitStatements(sql)) {
      if (!new RegExp(`\\b${table}\\b`, 'i').test(statement.text)) continue
      for (const column of added) {
        const hit = new RegExp(`\\b${column}\\b`, 'i').exec(statement.text)
        if (hit) emit(statement.index + hit.index,
          `引用了 Java 迁移加的列 \`${table}.${column}\`（SQL 链里这一列不存在）——改写成 Java 迁移`)
      }
    }
  }
  return problems
}

/** 按分号切语句，保留每条语句在原文本里的偏移。 */
function splitStatements(sql) {
  const out = []
  let start = 0
  for (const match of sql.matchAll(/;/g)) {
    out.push({ text: sql.slice(start, match.index), index: start })
    start = match.index + 1
  }
  if (sql.slice(start).trim()) out.push({ text: sql.slice(start), index: start })
  return out
}

/** 真实扫描：SQL 迁移 × Java 迁移 DDL 清单。 */
function collect() {
  const sqlFiles = [...walkFiles(MIGRATION_DIR, { exts: new Set(['.sql']) })]
  const javaFiles = [...walkFiles(BACKEND_SRC, { exts: new Set(['.java']) })]
    .filter(({ full }) => /[/\\]db[/\\]migration[/\\]V\d+__[A-Za-z0-9_]+\.java$/.test(full)
      && readFileSync(full, 'utf8').includes('BaseJavaMigration'))
  assertScanFloor(GATE, sqlFiles.length, MIN_SQL_FILES)
  assertScanFloor(GATE, javaFiles.length, MIN_JAVA_FILES)
  const inventory = parseJavaDdl(javaFiles.map(({ full }) => readFileSync(full, 'utf8')))
  if (inventory.tables.size < MIN_JAVA_TABLES) {
    console.error(`${GATE}：扫描面异常（Java 迁移仅解析出 ${inventory.tables.size} 张建表 < 下限 ${MIN_JAVA_TABLES}），门禁失效`)
    process.exit(1)
  }
  const problems = []
  let statements = 0
  for (const { full, rel } of sqlFiles) {
    const sql = stripNoiseKeepLines(readFileSync(full, 'utf8'))
    statements += (sql.match(/;/g) ?? []).length
    for (const { line, text, problem } of scanSql(sql, inventory)) {
      problems.push(`${rel} 第 ${line} 行 \`${text}\` —— ${problem}`)
    }
  }
  if (statements < MIN_SQL_STATEMENTS) {
    console.error(`${GATE}：扫描面异常（仅 ${statements} 语句 < 下限 ${MIN_SQL_STATEMENTS}），门禁失效`)
    process.exit(1)
  }
  return {
    files: sqlFiles.length,
    statements,
    javaFiles: javaFiles.length,
    javaTables: [...inventory.tables.keys()].sort().join('、'),
    problems,
  }
}

/** 规则自检：坏样本必须精确红、好样本一条都不许红（含「role 是列名」这类同名陷阱）。 */
function selftest() {
  const inventory = {
    tables: new Map([['role', new Set(['id', 'name'])], ['user_role', new Set(['account_id', 'role_id'])],
      ['role_priv', new Set(['role_id', 'priv_code'])]]),
    columns: new Map([['session', new Set(['token_hash'])]]),
  }
  const samples = [
    ['CREATE INDEX idx_user_role_role ON user_role (role_id);', true],
    ['ALTER TABLE user_role ADD COLUMN foo INT NULL;', true],
    ['INSERT INTO role_priv (role_id, priv_code) VALUES (1, 2);', true],
    ['UPDATE user_role SET role_id = 1 WHERE id = 2;', true],
    ['DELETE FROM role WHERE id = 1;', true],
    ['SELECT * FROM role JOIN user_role ON user_role.role_id = role.id;', true],
    ['CREATE INDEX i ON session (token_hash);', true],
    // 合法样本：现状写法与同名陷阱，一条都不许红
    ['CREATE INDEX idx_file_object ON file (object_type, object_id);', false],
    ['ALTER TABLE team_member MODIFY COLUMN hours DECIMAL(12,2) NOT NULL DEFAULT 0;', false],
    ['CREATE TABLE team_member (id BIGINT, role VARCHAR(30) NULL);', false],
    ['INSERT INTO account (account, role) VALUES (\'a\', \'m\');', false],
    ['SELECT id FROM account WHERE role IS NOT NULL;', false],
    ['CREATE INDEX i ON session (account);', false],
    ['-- 注释里提到 user_role 与 role 都不算\nSELECT 1;', false],
    ["INSERT INTO t (a) VALUES ('user_role');", false],
  ]
  const failures = []
  for (const [sql, shouldFlag] of samples) {
    const hit = scanSql(stripNoiseKeepLines(sql), inventory)
    if (shouldFlag && hit.length === 0) failures.push(`应红未红：${sql.replaceAll('\n', ' ')}`)
    if (!shouldFlag && hit.length > 0) {
      failures.push(`误报 ${hit.length} 处（${hit.map((p) => p.problem).join('；')}）：${sql.replaceAll('\n', ' ')}`)
    }
  }
  // DDL 解析自证：Java 建表清单必须能从源码里解析出来（含 text block），列定义里的约束行不算列
  const ddl = parseJavaDdl(['"""\nCREATE TABLE demo (\n  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(32) NOT NULL,\n  CONSTRAINT uq_demo_name UNIQUE (name)\n)\n""";'])
  if (!ddl.tables.has('demo') || !ddl.tables.get('demo').has('name') || ddl.tables.get('demo').has('uq_demo_name')) {
    failures.push(`Java DDL 解析不对：${JSON.stringify([...(ddl.tables.get('demo') ?? [])])}`)
  }
  if (failures.length > 0) {
    console.error(`${GATE} --selftest：${failures.length} 项失败`)
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }
  console.log(`${GATE} --selftest：通过（${samples.length} 个样本 + Java DDL 解析自证）`)
}

if (process.argv.includes('--selftest')) {
  selftest()
} else {
  const { files, statements, javaFiles, javaTables, problems } = collect()
  report(GATE, problems, files,
    `迁移 ${files} 文件 / ${statements} 语句链自洽（Java 迁移 ${javaFiles} 文件建 ${javaTables}，SQL 链 0 引用）`)
}
