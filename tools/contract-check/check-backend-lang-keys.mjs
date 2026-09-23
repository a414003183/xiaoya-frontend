// check-backend-lang-keys（T23）：后端 `ApiException.keyed(..., "键")` 用的键必须在语言包里存在。
//
// 为什么需要：语言包缺键时 `LangPackMessageSource` 与 `MessageResolver` 一律**回落键名本身**
// （「迁移期间不因漏配文案而炸」），于是漏配的键会以 `role.guard.builtinDelete` 这样的字符串
// 出现在错误信封与审计原因里——前端按 code 本地化，界面上看不出来，没有门禁就永远没人发现。
// 实测踩过：T25 把权限组改名角色时漏搬 `role.guard.builtinDelete`。
//
// 口径：扫 backend/src/main/java 的 .java，取 `ApiException.keyed(...)` / `ApiException.notFound(...)`
// 里**形如键**的字符串字面量（含点、非空白、非中文），校验 zh-CN / en 两份语言包都有。
// 参数位的键（如 `notFound("entity.account")` 的实参）一并算——`MessageResolver#localizedArgs`
// 会把它当键去查，缺了同样回落原文。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { BACKEND_SRC, ROOT, assertScanFloor, report, walkFiles } from './scan-roots.mjs'

const GATE = 'check-backend-lang-keys'
const localesDir = join(ROOT, 'frontend', 'packages', 'i18n', 'src', 'locales')

/** 取字面量的函数名：直接给键的工厂。 */
const KEYED_CALL = /ApiException\.(keyed|notFound)\s*\(/g
/** 形如键：至少一段点分、无空白/引号/中文（拦掉裸文案与 id）。 */
const LOOKS_LIKE_KEY = /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$/
/** 键的前缀白名单：后端键一律按域起头（实体/域/横切面），挡住 `com.foo` 这类偶然命中的非键。 */
const ALLOWED_ROOTS = new Set([
  'account', 'accountRole', 'activity', 'api', 'bug', 'build', 'category', 'comment', 'csv', 'department',
  'dict', 'doc', 'entity', 'error', 'execution', 'filters', 'file', 'group', 'library', 'menu', 'my', 'notification',
  'personnel', 'plan', 'platform', 'priv', 'product', 'program', 'project', 'release', 'report', 'requirement',
  'role', 'search', 'session', 'setting', 'stage', 'story', 'suite', 'task', 'team', 'testCase', 'testRun',
  'todo', 'workflow', 'workspace',
])

const flatten = (node, prefix = '') =>
  Object.entries(node ?? {}).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )

const bundles = new Map(
  ['zh-CN', 'en'].map((lang) => [
    lang,
    new Set(flatten(parse(readFileSync(join(localesDir, `${lang}.json`), 'utf8')))),
  ]),
)

/** 调用点里所有字符串字面量（含参数位的键）。 */
function stringLiteralsOf(callText) {
  return [...callText.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1])
}

const problems = []
const seen = new Map()
let scanned = 0
for (const { full, rel } of walkFiles(BACKEND_SRC, { exts: new Set(['.java']) })) {
  scanned += 1
  const src = readFileSync(full, 'utf8')
  for (const match of src.matchAll(KEYED_CALL)) {
    // 括号配对取整个实参表（keyed 的键可能在第二或第三位）
    let depth = 0
    let end = match.index + match[0].length - 1
    for (; end < src.length; end += 1) {
      if (src[end] === '(') depth += 1
      else if (src[end] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    const line = src.slice(0, match.index).split('\n').length
    for (const literal of stringLiteralsOf(src.slice(match.index, end + 1))) {
      if (!LOOKS_LIKE_KEY.test(literal)) continue
      const root = literal.split('.')[0]
      if (!ALLOWED_ROOTS.has(root)) continue
      for (const [lang, keys] of bundles) {
        if (keys.has(literal)) continue
        const key = `${literal}（${lang} 缺）`
        if (seen.has(key)) continue
        seen.set(key, true)
        problems.push(`${rel}:${line} 语言包缺键：${literal}（${lang}）`)
      }
    }
  }
}
assertScanFloor(GATE, scanned, 400)

report(GATE, problems, scanned, '后端 keyed/notFound 的键都在语言包里')
