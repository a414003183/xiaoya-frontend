#!/usr/bin/env node
// check-todo-fixme（T94 · CONVENTIONS §10 补充纪律）：禁止 TODO/FIXME 合入。
//
// 纪律：问题一律登记 STATE.md「已知注意点」或开任务卡，不留 TODO/FIXME 现场——
// 注释里的「以后再说」没有跟踪人、没有到期日，等于永远不会做。
//
// 判据：注释起点（`//`、`/*`、` * `、`<!--`、`#`）**直接**跟 TODO/FIXME（允许 `:`/`(`/空白）才报红；
// 标识符（`TODO_BATCH_MAX`）、正文里提到的「TODO 列表」这类非注释起点写法不报（避免误伤）。
// 大小写敏感（约定大写标记）。
//
// 扫描面：产品源码（backend/src 的 Java + frontend/*/src 的 TS/TSX）；tools/ 自身不在扫描面
// （本门禁的正则与文档会自指）——ponytail 上限，升级路径 = tools 单独一个运行器身份再纳入。
//
// 用法：`node tools/contract-check/check-todo-fixme.mjs [--selftest]`
import { readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { BACKEND_SRC, assertScanFloor, frontendSrcRoots, report, walkFiles } from './scan-roots.mjs'

const GATE = 'check-todo-fixme'
const MARKER = /(?:\/\/|\/\*+|\*+|<!--|#)\s*(?:TODO|FIXME)\b/

/** 纯函数：一段源码 → 违规行（供 --selftest 与真实扫描共用）。 */
export function scanSource(text) {
  const hits = []
  text.split('\n').forEach((line, index) => {
    if (MARKER.test(line)) {
      hits.push({ line: index + 1, text: line.trim() })
    }
  })
  return hits
}

function selftest() {
  const samples = [
    ['// TODO: 下个版本再做', true],
    ['/* FIXME 临时绕过 */', true],
    [' * TODO 待补测试', true],
    ['<!-- TODO 前端占位 -->', true],
    ['# FIXME shell 里也要管', true],
    ['//FIXME: 无空格紧跟', true],
    ['const TODO_BATCH_MAX_ROWS = 50', false],
    ['// 变更记录写在 TODO 列表文档里', false],
    ['const total = a * b', false],
    ['expect(fixme).toBe(1)', false],
    ['// 修复了 todo 模块的分页（小写不报）', false],
  ]
  const failures = []
  for (const [source, expected] of samples) {
    const fired = scanSource(source).length > 0
    if (fired !== expected) {
      failures.push(`样本「${source}」${expected ? '应报红' : '应放行'}，实际 ${fired ? '报红' : '放行'}`)
    }
  }
  const two = scanSource('// TODO a\n// FIXME b')
  if (two.length !== 2) failures.push(`两行两标记应各报一次，实际 ${two.length}`)
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
const scan = (root, exts) => {
  for (const { full, rel } of walkFiles(root, { exts })) {
    scanned += 1
    for (const hit of scanSource(readFileSync(full, 'utf8'))) {
      problems.push(`${rel}:${hit.line}  TODO/FIXME 注释（登记 STATE.md 或开卡，不留在代码里）  →  ${hit.text}`)
    }
  }
}
scan(BACKEND_SRC, new Set(['.java']))
for (const root of frontendSrcRoots()) {
  scan(root, new Set(['.ts', '.tsx']))
}
// scan-roots 的豁免段（generated/locales/mocks/e2e/test/__tests__）对 walkFiles 同样生效的只有 skipNames；
// 测试与生成物一并扫描——测试里的 TODO 一样没人做（这里不豁免，扫描面因此更宽）

assertScanFloor(GATE, scanned, 800)
report(GATE, problems, scanned, '产品源码零 TODO/FIXME 注释')
