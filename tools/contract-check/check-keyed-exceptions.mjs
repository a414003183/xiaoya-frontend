// check-keyed-exceptions（T63 · 错误体系红线 / AUDIT BE-09、BE-13 附带）：业务异常只许 keyed(...) 形态。
//
// 规则：backend/src/main/java 里
//   R1 `ApiException.<工厂>(...)` 的工厂只许白名单四个：keyed / validation / notFound / lockConflict()（无参，keyed 委托）。
//      其余一律红——裸字符串工厂（动态文案）不可机判、不可按语言解析（T63 已删，本门禁防回流）。
//   R2 `new ApiException(` 只许出现在 platform/error/ApiException.java（私有构造 + keyed 工厂的唯一出口）。
//   豁免：无需豁免口——需要动态文案请走 `ApiException.keyed(code, key, args)`（键由 check-backend-lang-keys 看护）。
//
// 已知上限（ponytail）：文本级判据——键名/构造形式对，不校验键真的存在（那是 check-backend-lang-keys 的事）；
//   注释里的样例不计（扫描前按行剥 `//` 与 `/* */`）。升级路径 = 接 JavaParser 看调用图。
//
// 用法：`node tools/contract-check/check-keyed-exceptions.mjs [--selftest]`
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const GATE = 'check-keyed-exceptions'
const root = join(import.meta.dirname, '..', '..')
const backendSrc = join(root, 'backend', 'src', 'main', 'java')

/** 允许的工厂（都最终委托 keyed）；lockConflict 仅无参形态（无参版本就是 keyed 锁冲突通用句）。 */
const ALLOWED_FACTORIES = new Set(['keyed', 'validation', 'notFound', 'lockConflict'])
const CALL = /\bApiException\s*\.\s*(\w+)\s*\(/g
const CONSTRUCT = /\bnew\s+ApiException\s*\(/g
const FACTORY_HOME = join('platform', 'error', 'ApiException.java')
/** 扫描面下限：防止 glob 失效后「0 违规」假绿。 */
const MIN_FILES = 500
const MIN_CALLS = 300

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (entry.endsWith('.java')) yield full
  }
}

/** 剥行注释/块注释（保留换行与列位，行号不失真）；字符串字面量里的 `//` 不剥（样例不会出现在字面量里）。 */
export function stripComments(text) {
  let out = ''
  let inBlock = false
  for (const line of text.split('\n')) {
    let result = ''
    let inString = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (inBlock) {
        if (ch === '*' && line[i + 1] === '/') {
          inBlock = false
          i += 1
        }
        continue
      }
      if (inString) {
        result += ch
        if (ch === '\\') {
          result += line[i + 1] ?? ''
          i += 1
        } else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        inString = true
        result += ch
      } else if (ch === '/' && line[i + 1] === '/') break
      else if (ch === '/' && line[i + 1] === '*') {
        inBlock = true
        i += 1
      } else result += ch
    }
    out += result + '\n'
  }
  return out
}

/** 从 open 处的 '(' 起做括号配对，返回实参文本。 */
function argsAt(text, openIndex) {
  let depth = 0
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return text.slice(openIndex + 1, i)
    }
  }
  return text.slice(openIndex + 1)
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

/** 纯函数：一段源码 → 违规行 [{ line, text, reason }]。isFactoryHome=true 时允许 `new ApiException(`。 */
export function scanSource(text, isFactoryHome = false) {
  const code = stripComments(text)
  const lines = text.split('\n')
  const hits = []
  for (const match of code.matchAll(CALL)) {
    const name = match[1]
    const ok = ALLOWED_FACTORIES.has(name)
      && (name !== 'lockConflict' || argsAt(code, match.index + match[0].length - 1).trim() === '')
    if (!ok) {
      hits.push({ line: lineOf(code, match.index), text: lines[lineOf(code, match.index) - 1]?.trim(), reason: `非 keyed 形态的异常工厂：ApiException.${name}(...)` })
    }
  }
  if (!isFactoryHome) {
    for (const match of code.matchAll(CONSTRUCT)) {
      hits.push({ line: lineOf(code, match.index), text: lines[lineOf(code, match.index) - 1]?.trim(), reason: 'ApiException 只许在 platform/error/ApiException.java 内构造' })
    }
  }
  return hits
}

function selftest() {
  const samples = [
    ['throw ApiException.keyed(ErrorCode.BAD_REQUEST, "error.param.missing");', 0],
    ['throw ApiException.validation(Map.of("name", "required"));', 0],
    ['return ApiException.notFound("entity.plan");', 0],
    ['throw ApiException.lockConflict();', 0],
    ['if (e instanceof ApiException failure) { throw failure; }', 0],
    ['throw ApiException.badRequest("rows[].id required");', 1],
    ['throw ApiException.lockConflict("lockVersion required");', 1],
    ['throw ApiException.lockConflict(\n    e.getMessage());', 1],
    ['throw ApiException.rateLimited("slow down");', 1],
    ['// throw ApiException.badRequest("注释里的样例不计");', 0],
  ]
  let failed = 0
  for (const [src, expected] of samples) {
    const hits = scanSource(src)
    const label = src.split('\n')[0]
    if (hits.length !== expected) {
      failed += 1
      console.error(`[selftest] 预期 ${expected} 处违规、实际 ${hits.length}：${label}`)
    }
  }
  const home = scanSource('private ApiException(ErrorCode c, String m, String k, Object[] a, Map f) { return new ApiException(c, m, k, a, f); }', true)
  if (home.length !== 0) {
    failed += 1
    console.error('[selftest] 工厂之家（ApiException.java）内的构造不应报红')
  }
  const away = scanSource('throw new ApiException(ErrorCode.BAD_REQUEST, "x", null, null, Map.of());', false)
  if (away.length !== 1) {
    failed += 1
    console.error('[selftest] 工厂之家之外的 new ApiException 必须报红')
  }
  const total = samples.length + 2
  if (failed > 0) {
    console.error(`[${GATE}] selftest 失败 ${failed}/${total}`)
    process.exit(1)
  }
  console.log(`[${GATE}] selftest 通过 ${total}/${total}`)
}

function main() {
  const files = [...walk(backendSrc)]
  let calls = 0
  const violations = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    calls += [...stripComments(text).matchAll(CALL)].length
    for (const hit of scanSource(text, file.endsWith(FACTORY_HOME.replace(/\\/g, '/')) || file.replace(/\\/g, '/').endsWith('platform/error/ApiException.java'))) {
      violations.push({ file, ...hit })
    }
  }
  if (files.length < MIN_FILES || calls < MIN_CALLS) {
    console.error(`[${GATE}] 扫描面不足（文件 ${files.length} < ${MIN_FILES} 或调用 ${calls} < ${MIN_CALLS}）——扫描失效不是 0 违规`)
    process.exit(1)
  }
  if (violations.length > 0) {
    console.error(`[${GATE}] 发现 ${violations.length} 处非 keyed 形态的 ApiException：`)
    for (const hit of violations) {
      console.error(`  ${hit.file.replace(/\\/g, '/').replace(root.replace(/\\/g, '/') + '/', '')}:${hit.line}  ${hit.reason}  ${hit.text ?? ''}`)
    }
    process.exit(1)
  }
  console.log(`[${GATE}] 0 违规（${files.length} 文件 / ${calls} 处 ApiException 引用）`)
}

if (process.argv.includes('--selftest')) selftest()
else main()
