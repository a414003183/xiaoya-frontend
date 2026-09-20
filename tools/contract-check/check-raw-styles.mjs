// 裸样式门禁（06 A2-2 / D-A3）：禁硬编码颜色回流。问题 2/12 的机器护栏。
// 扫前端源码（web/src + 各包 src，见 scan-roots）：①十六进制颜色字面量
// ②bg-white|bg-black|text-white|text-black ③Tailwind 调色板色系类（含 -50 淡底）④内联 style 的 color: '…'。
// 豁免：design-system/tokens（令牌定义处）、generated、mocks、测试文件。
// 行内豁免：该行尾注 `// raw-styles-ok`（同 banned-words-ok 先例）。
import { readFileSync } from 'node:fs'
import { TS_EXTS, assertScanFloor, frontendSrcRoots, report, walkFiles } from './scan-roots.mjs'

const GATE = 'check-raw-styles'

/** 豁免段（按 `/` 分段精确匹配）：令牌定义处 / 生成物 / mock 种子 / 测试与 E2E 夹具。 */
const SKIP_SEGMENTS = new Set(['tokens', 'generated', 'mocks', 'e2e', '__tests__'])
const skipFile = (rel) => /\.(test|spec)\.[jt]sx?$/.test(rel)

const HEX = /#[0-9a-fA-F]{3,8}\b/
const TAILWIND_MONO = /\b(?:bg-white|bg-black|text-white|text-black)\b/
// 调色板色系（06 A2-2 扩围）：含 -50 淡底——`bg-green-50` 这类"亮色专用底"在暗色下不可读，
// 必须走语义令牌（design-system/style.css 的 @theme）。中性色与彩色同规则。
const PALETTE = 'neutral|gray|grey|slate|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const TAILWIND_PALETTE = new RegExp(`\\b[\\w-]*-(?:${PALETTE})-\\d{2,3}\\b`)
const INLINE_COLOR = /color:\s*['"`][^'"`]+['"`]/

const RULES = [
  [HEX, '十六进制颜色字面量'],
  [TAILWIND_MONO, 'bg/text-white|black 裸色类'],
  [TAILWIND_PALETTE, '调色板色系 Tailwind 类（走语义令牌）'],
  [INLINE_COLOR, "内联 color: '…'"],
]

const violations = []
let scanned = 0
for (const dir of frontendSrcRoots()) {
  for (const { full, rel } of walkFiles(dir, { exts: TS_EXTS, skip: skipFile })) {
    if (rel.split('/').some((segment) => SKIP_SEGMENTS.has(segment))) continue
    scanned += 1
    readFileSync(full, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (line.includes('raw-styles-ok')) return
        for (const [regex, rule] of RULES) {
          if (!regex.test(line)) continue
          violations.push(`${rel}:${index + 1}  [${rule}] ${line.trim().slice(0, 120)}`)
          return
        }
      })
  }
}
assertScanFloor(GATE, scanned, 200)
report(GATE, violations, scanned, '豁免：tokens/generated/mocks/测试；行内 // raw-styles-ok')
