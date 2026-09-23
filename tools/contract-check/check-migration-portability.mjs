// check-migration-portability（T52 / AUDIT DB-01）：迁移 SQL 必须是**双方言合法**。
//
// 为什么需要这条门禁：迁移目录服务于两个引擎，而 CI 只覆盖其中一个——
//   生产/迁移工具 → MySQL 8（`tools/migration` 的 Testcontainers IT，仅 `-Pit` 时跑，CI 默认不跑：OPS-01）
//   全部测试     → H2(MODE=MySQL)（每个 @SpringBootTest 都真跑 Flyway 全链）
// 于是「H2 独有的语法」能一路绿到上线才炸：V32 的 `ALTER COLUMN … SET NOT NULL / SET NULL`
// 就是这样让生产迁移链断在 V32（MySQL 8 报 ERROR 1064）的。
// 本门禁守 MySQL 方向（静态规则）；H2 方向不用守——`mvn test` 每次都真跑。
//
// 只有一边合法的写法一律禁；命中时按提示改写成双方言都认的写法。
// 规则自检：`node tools/contract-check/check-migration-portability.mjs --selftest`
// （每条规则必须在样本上点亮、且不得在迁移目录现状上误报——防门禁退化成空转）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, assertScanFloor, report, walkFiles } from './scan-roots.mjs'

const GATE = 'check-migration-portability'
const MIGRATION_DIR = join(ROOT, 'backend', 'src', 'main', 'resources', 'db', 'migration')

/**
 * H2 认、MySQL 8 不认的写法（MySQL 侧提示一律给可直接替换的语句）。
 * @type {{pattern: RegExp, hint: string}[]}
 */
export const RULES = [
  {
    pattern: /\balter\s+column\s+[^\s;]+\s+set\s+(?:not\s+null|null)\b/i,
    hint: 'MySQL 报 1064 → `ALTER TABLE <表> MODIFY COLUMN <列> <类型> NOT NULL|NULL`（类型必须重述）',
  },
  {
    pattern: /\balter\s+column\s+[^\s;]+\s+drop\s+not\s+null\b/i,
    hint: 'MySQL 报 1064 → `ALTER TABLE <表> MODIFY COLUMN <列> <类型> NULL`',
  },
  {
    pattern: /\bdrop\s+constraint\b/i,
    hint: 'MySQL 8.0.19 起才认 `DROP CONSTRAINT` → 唯一索引用 `DROP INDEX <名>`、外键用 `DROP FOREIGN KEY <名>`',
  },
  {
    pattern: /\bcreate\s+(?:unique\s+)?index\s+if\s+not\s+exists\b/i,
    hint: 'MySQL 无 `CREATE INDEX IF NOT EXISTS` → 迁移只跑一次，直接 `CREATE INDEX`（真需幂等先 `DROP INDEX`）',
  },
  {
    pattern: /\bdrop\s+index\s+if\s+exists\b/i,
    hint: 'MySQL 无 `DROP INDEX IF EXISTS` → 查 information_schema 自行分支，或直接 `DROP INDEX`',
  },
  {
    pattern: /\bdrop\s+column\s+if\s+exists\b/i,
    hint: 'MySQL 无 `DROP COLUMN IF EXISTS` → 直接 `DROP COLUMN`（迁移只跑一次）',
  },
  {
    pattern: /\btruncate\s+table\b[^;]*\b(?:restart|continue)\s+identity\b/i,
    hint: 'MySQL 报 1064 → 自增归零用 `ALTER TABLE <表> AUTO_INCREMENT = 1`',
  },
  {
    pattern: /\bcreate\s+sequence\b|\bnext\s+value\s+for\b/i,
    hint: 'MySQL 8 无序列 → 用 `AUTO_INCREMENT` 或应用侧取号',
  },
  {
    pattern: /\bmerge\s+into\b/i,
    hint: 'MySQL 无 MERGE → 用 `INSERT … ON DUPLICATE KEY UPDATE`',
  },
  {
    pattern: /\bcomment\s+on\b/i,
    hint: 'MySQL 无 `COMMENT ON` → 列/表注释写成内联 `COMMENT \'…\'`',
  },
  {
    pattern: /\b(?:varchar2|nvarchar2?|number\s*\(|clob|nclob|blob\s+subtype|long\s+raw)\b/i,
    hint: 'Oracle/DB2 类型，MySQL 不认 → 用 `VARCHAR` / `DECIMAL(p,s)` / `TEXT` / `BLOB`',
  },
  {
    pattern: /\bgenerated\s+always\s+as\s+identity\b|\bidentity\s*\(/i,
    hint: 'MySQL 无 IDENTITY → 用 `BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY`',
  },
  {
    pattern: /\breturning\b/i,
    hint: 'MySQL 无 `RETURNING` → 插入后另发 `SELECT LAST_INSERT_ID()`',
  },
]

/** 去掉行注释、块注释与字符串字面量：规则只针对可执行 SQL，叙述性文字里的关键字不算违规。 */
export function stripNoise(sql) {
  return sql
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/--[^\n]*/g, ' ')
    .replaceAll(/'(?:[^']|'')*'/g, "''")
}

/** 对一段（已去噪的）SQL 跑全部规则，返回 `{line, hint}`。行号按原始文本计。 */
function scan(sql) {
  const cleaned = stripNoise(sql)
  const problems = []
  for (const rule of RULES) {
    const global = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g')
    for (const match of cleaned.matchAll(global)) {
      const line = cleaned.slice(0, match.index).split('\n').length
      const text = sql.split('\n')[line - 1]?.trim() ?? ''
      problems.push(`第 ${line} 行 \`${text}\` —— ${rule.hint}`)
    }
  }
  return problems
}

function collect() {
  const files = [...walkFiles(MIGRATION_DIR, { exts: new Set(['.sql']) })]
  assertScanFloor(GATE, files.length, 30)
  const problems = []
  let statements = 0
  for (const { full, rel } of files) {
    const sql = readFileSync(full, 'utf8')
    statements += (stripNoise(sql).match(/;/g) ?? []).length
    for (const problem of scan(sql)) problems.push(`${rel} ${problem}`)
  }
  return { files: files.length, statements, problems }
}

/** 规则自检：每条规则在样本上必须点亮，且整表不得在合法样本上误报。 */
function selftest() {
  const samples = [
    ['ALTER TABLE menu ALTER COLUMN node_key SET NOT NULL;', 0],
    ['ALTER TABLE menu ALTER COLUMN parent_key SET NULL;', 0],
    ['ALTER TABLE menu ALTER COLUMN parent_key DROP NOT NULL;', 1],
    ['ALTER TABLE menu DROP CONSTRAINT uq_menu_path;', 2],
    ['CREATE UNIQUE INDEX IF NOT EXISTS i ON t (c);', 3],
    ['DROP INDEX IF EXISTS i;', 4],
    ['ALTER TABLE t DROP COLUMN IF EXISTS c;', 5],
    ['TRUNCATE TABLE t RESTART IDENTITY;', 6],
    ['CREATE SEQUENCE s; SELECT NEXT VALUE FOR s;', 7],
    ['MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN DELETE;', 8],
    ["COMMENT ON TABLE t IS 'x';", 9],
    ['CREATE TABLE t (a VARCHAR2(10), b NUMBER(4,1), c CLOB);', 10],
    ['CREATE TABLE t (id BIGINT GENERATED ALWAYS AS IDENTITY);', 11],
    ['INSERT INTO t (a) VALUES (1) RETURNING id;', 12],
    // 合法样本：迁移目录现状的写法，一条都不许点亮
    ['ALTER TABLE menu MODIFY COLUMN node_key VARCHAR(255) NOT NULL;', -1],
    ['ALTER TABLE menu MODIFY COLUMN parent_key VARCHAR(120) NULL;', -1],
    ['ALTER TABLE menu DROP INDEX uq_menu_path;', -1],
    ['ALTER TABLE menu ADD CONSTRAINT uq_menu_node_key UNIQUE (node_key);', -1],
    ['CREATE TABLE t (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(64) NOT NULL DEFAULT \'\');', -1],
    ['CREATE INDEX idx_file_object ON file (object_type, object_id);', -1],
    ['-- 注释里提到 ALTER COLUMN x SET NOT NULL 不算违规\nSELECT 1;', -1],
    ["INSERT INTO t (a) VALUES ('DROP CONSTRAINT x');", -1],
  ]
  const failures = []
  samples.forEach(([sql, expected], index) => {
    const cleaned = stripNoise(sql)
    const ids = RULES.map((_, id) => id).filter((id) => new RegExp(RULES[id].pattern).test(cleaned))
    const sample = sql.replaceAll('\n', ' ')
    if (expected === -1) {
      if (ids.length > 0) failures.push(`样本 ${index} 应放行却点亮规则 [${ids}]：${sample}`)
      return
    }
    if (!ids.includes(expected)) failures.push(`样本 ${index} 应点亮规则 ${expected}，实际 [${ids}]：${sample}`)
    else if (!scan(sql).some((problem) => problem.includes(RULES[expected].hint.slice(0, 12)))) {
      failures.push(`样本 ${index} 点亮了规则 ${expected} 但未产出该规则的提示文案：${sample}`)
    }
  })
  if (failures.length > 0) {
    console.error(`${GATE} --selftest：${failures.length} 项失败`)
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }
  console.log(`${GATE} --selftest：通过（${RULES.length} 条规则 × ${samples.length} 个样本）`)
}

if (process.argv.includes('--selftest')) {
  selftest()
} else {
  const { files, statements, problems } = collect()
  if (process.argv.includes('--list')) {
    console.log(`${GATE}：迁移 ${files.length} 文件 / ${statements} 语句，${RULES.length} 条方言规则`)
    for (const problem of problems) console.log(`  ${problem}`)
    process.exit(problems.length > 0 ? 1 : 0)
  }
  report(GATE, problems, files, `迁移 ${files} 文件 / ${statements} 语句双方言合法（MySQL 8 + H2 MODE=MySQL）`)
}
