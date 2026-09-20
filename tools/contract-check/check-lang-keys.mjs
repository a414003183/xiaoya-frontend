// check-lang-keys（01 §3.5 / phase-6 T-10）：前端零裸中文 + 语言包键位对齐。
// 1) 前端源码（web/src + packages/*/src，08 B2-1 扩域）的 .ts/.tsx 里出现 CJK 即违规——UI 文案必须走 i18n key；
// 2) zh-CN 与 en 语言包键集合必须一致（缺键即红，禁运行时回落另一语言）；
// 3) en 语言包值禁 CJK（06 A4-4）：切 EN 后界面冒中文的最后一道网。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { TS_EXTS, assertScanFloor, frontendSrcRoots, ROOT, report, walkFiles } from './scan-roots.mjs'

const GATE = 'check-lang-keys'
const localesDir = join(ROOT, 'frontend', 'packages', 'i18n', 'src', 'locales')

/** 豁免段（按 `/` 分段精确匹配，非子串包含）：语言包/生成物/测试/mock/E2E/测试夹具。 */
const SKIP_SEGMENTS = new Set(['generated', 'locales', 'mocks', 'e2e', 'test', '__tests__'])
const skipFile = (rel) => /\.(test|spec)\.[jt]sx?$/.test(rel)
const CJK = /[\u4e00-\u9fff]/

/**
 * 剥注释（保留行结构，行号不变）。旧实现按 indexOf('//') 截断，
 * 会把 `'https://…' + '中文'` 这类行整段丢掉（假阴性）。此处按引号状态逐字符扫。
 * ponytail: 不识别正则字面量（`/\//` 会被误当行注释起点）——影响面仅限同行的 CJK 判定，
 * 升级路径 = 引入真正的 JS 词法分析（tests/mocks 已豁免，收益不足）。
 */
function stripComments(text) {
  let out = ''
  let quote = null
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]
    if (quote !== null) {
      if (ch === '\\') {
        out += ch + (next ?? '')
        i += 1
        continue
      }
      if (ch === quote) quote = null
      out += ch
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
      out += '\n'
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') out += '\n'
        i += 1
      }
      i += 1
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch
    out += ch
  }
  return out
}

const problems = []
let scanned = 0
for (const dir of frontendSrcRoots()) {
  for (const { full, rel } of walkFiles(dir, { exts: TS_EXTS, skip: skipFile })) {
    if (rel.split('/').some((segment) => SKIP_SEGMENTS.has(segment))) continue
    scanned += 1
    const offenders = stripComments(readFileSync(full, 'utf8'))
      .split('\n')
      .filter((line) => CJK.test(line))
    if (offenders.length > 0) {
      problems.push(`${rel}：裸中文 ${offenders.length} 行（如「${offenders[0].trim().slice(0, 40)}」）`)
    }
  }
}
assertScanFloor(GATE, scanned, 200)

// —— 语言包键位对齐 ——
const flatten = (node, prefix = '') =>
  Object.entries(node ?? {}).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
function collectValues(node, prefix = '', out = []) {
  for (const [key, value] of Object.entries(node ?? {})) {
    if (typeof value === 'object' && value !== null) collectValues(value, `${prefix}${key}.`, out)
    else out.push([`${prefix}${key}`, value])
  }
  return out
}
const zhBundle = parse(readFileSync(join(localesDir, 'zh-CN.json'), 'utf8'))
const enBundle = parse(readFileSync(join(localesDir, 'en.json'), 'utf8'))
const zhKeys = new Set(flatten(zhBundle))
const enKeys = new Set(flatten(enBundle))
for (const key of zhKeys) if (!enKeys.has(key)) problems.push(`语言包缺键：en 缺 ${key}`)
for (const key of enKeys) if (!zhKeys.has(key)) problems.push(`语言包缺键：zh-CN 缺 ${key}`)
for (const [key, value] of collectValues(enBundle)) {
  if (typeof value === 'string' && CJK.test(value)) {
    problems.push(`en 语言包冒中文：${key} = 「${value.slice(0, 40)}」`)
  }
}

report(GATE, problems, scanned, '裸中文 + zh/en 键位对齐 + en 无中文')
