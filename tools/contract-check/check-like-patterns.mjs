// check-like-patterns（T56 · AUDIT BE-06）：LIKE 通配符只能由 `platform/filters/LikePatterns` 产出。
//
// 规则：后端 Java 里
//   ① 不许调用 `QueryColumn#like(`（MyBatis-Flex 的 like 会自动再包一层 `%` 且**不转义**）——
//      用户输入走 `likeRaw(LikePatterns.contains(q))`，前缀走 `likeLeft(prefix)`，JSON 数组元素走 `likeRaw(LikePatterns.jsonElement(v))`；
//   ② 不许裸拼通配符（`"%" +` / `+ "%"`）——不转义时 `_` 是「任意单字符」、`%` 是「任意串」：
//      搜 `a_b` 会命中 `axb`，搜 `%` 会命中全表（BE-06 的原始症状）。
// 判据按**行**取；唯一豁免文件是 `platform/filters/LikePatterns.java`（它就是出题口，通配符在这里诞生），
// 其它合法例外用行内标记 `// like-patterns-ok：<理由>`。
//
// 已知上限（ponytail）：只认字面写法——模式由变量拼好再传入 `likeRaw` 的间接写法不覆盖；
//   升级路径 = 追到 `likeRaw(` 的实参符号，要求其定义处出现 LikePatterns。
//
// 用法：`node tools/contract-check/check-like-patterns.mjs [--selftest]`
import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { BACKEND_SRC, assertScanFloor, report, walkFiles } from './scan-roots.mjs'

const GATE = 'check-like-patterns'
const EXEMPT = 'like-patterns-ok'
/** 出题口本体：通配符只允许在这里拼。 */
const HELPER = 'filters/LikePatterns.java'

const UNESCAPED_LIKE = /\.\s*like\s*\(/
const BARE_WILDCARD = /"%" *\+|\+ *"%"/g

/** 纯函数：一段源码 → 违规行（供 --selftest 与真实扫描共用）。豁免标记可写在行内或其紧邻上一行。 */
export function scanSource(text) {
  const hits = []
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    if (line.includes(EXEMPT) || (lines[index - 1] ?? '').includes(EXEMPT)) return
    if (UNESCAPED_LIKE.test(line)) {
      hits.push({ line: index + 1, label: 'like( 不转义且自包一层 %（用 likeRaw + LikePatterns / likeLeft）', text: line.trim() })
    }
    BARE_WILDCARD.lastIndex = 0
    if (BARE_WILDCARD.test(line)) {
      hits.push({ line: index + 1, label: '裸拼 LIKE 通配符（_ 与 % 未转义）', text: line.trim() })
    }
  })
  return hits
}

function selftest() {
  const samples = [
    ['new QueryColumn("name").like(like);', true],
    ['var pattern = "%" + q + "%";', true],
    ['new QueryColumn("path").likeLeft(pathPrefix);', false],
    ['new QueryColumn("name").likeRaw(LikePatterns.contains(q));', false],
    ['new QueryColumn("editors").likeRaw(LikePatterns.jsonElement(account));', false],
    ['String.format("%s/%s", owner, repo);', false],
    ['// like-patterns-ok：doc path 由服务端生成，无用户输入\nnew QueryColumn("path").like(path + "%");', false],
  ]
  const failures = []
  for (const [source, expected] of samples) {
    const fired = scanSource(source).length > 0
    if (fired !== expected) {
      failures.push(`样本「${source.split('\n').pop()}」${expected ? '应报红' : '应放行'}，实际 ${fired ? '报红' : '放行'}`)
    }
  }
  // 出题口本体按**文件**豁免（它的通配符拼接是故意的），样本身不得顺带豁免别人
  if (!HELPER.endsWith('LikePatterns.java')) failures.push('豁免文件的写法变了？')
  const two = scanSource('var a = "%" + q + "%";\nvar b = new QueryColumn("x").like(v);')
  if (two.length !== 2) failures.push(`两行两处应各报一次，实际 ${two.length}`)
  if (failures.length > 0) {
    console.error(`${GATE} --selftest：${failures.length} 处自检失败`)
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }
  console.log(`${GATE} --selftest：${samples.length + 3} 项自检全过（好样本干净、坏样本必红）`)
}

if (process.argv.includes('--selftest')) {
  selftest()
  process.exit(0)
}

const problems = []
let scanned = 0
for (const { full, rel } of walkFiles(BACKEND_SRC, { exts: new Set(['.java']) })) {
  scanned += 1
  if (rel.replaceAll(sep, '/').endsWith(HELPER)) continue
  for (const hit of scanSource(readFileSync(full, 'utf8'))) {
    problems.push(`${relative(BACKEND_SRC, full).replaceAll(sep, '/')}:${hit.line}  ${hit.label}  →  ${hit.text}`)
  }
}

assertScanFloor(GATE, scanned, 400)
report(GATE, problems, scanned, 'LIKE 模式一律经 LikePatterns（转义 + 通配符单源）')
