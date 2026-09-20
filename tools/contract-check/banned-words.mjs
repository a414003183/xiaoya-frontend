// 禁用词扫描（02-naming.md §6，CI 门禁）：扫描 frontend/ backend/，命中即非零退出。
// 豁免：tools/migration/**（读旧库必须出现旧名）、docs/、构建产物目录。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, assertScanFloor, report, walkFiles } from './scan-roots.mjs'

const GATE = '禁用词扫描'
const SCAN_ROOTS = [join(ROOT, 'frontend'), join(ROOT, 'backend')]
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.css', '.html', '.java'])

/** 豁免：生成物、worker 产物、发布内嵌的前端产物（build-release.sh 拷入，含三方库压缩码）。 */
const SKIP_SEGMENTS = new Set(['generated', 'migration'])
const skipFile = (rel) => rel.endsWith('/mockServiceWorker.js') || rel.includes('/src/main/resources/static/')

// 00 §3.2/§5 砍掉模块标识符补扫（phase-6 T-10）：只取无歧义词；
// 常用词（store/space/ci/host/score/convert 等同名词）不入列防误伤
const CUT_MODULE_PATTERNS = [
  [/\b(gitlab|gitea|gogs|sonarqube|zanode|zahost|xuanxuan|demandpool|auditplan|taskteam|roadmap|duckdb|dataview|jenkins)\b/i, '砍掉模块标识符（00 §3.2）'],
  [/zentao\.net/, '官方服务域名（00 §3.2）'],
  [/\bsvn\b/i, 'svn（DevOps 已砍，00 §3.2）'],
  [/\bpivot\b/i, 'pivot（BI 设计器已砍，00 §3.2）'],
]

// 02 §6 禁用词表；\b 按 02 标注应用
const PATTERNS = [
  ...CUT_MODULE_PATTERNS,
  [/\bassignedTo\b/, 'assignedTo'],
  [/\bassigned_to\b/, 'assigned_to'],
  [/\bpri\b/, 'pri'],
  [/\bopenedBy\b/, 'openedBy'],
  [/\bopenedDate\b/, 'openedDate'],
  [/\blastEditedBy\b/, 'lastEditedBy'],
  [/\blastEditedDate\b/, 'lastEditedDate'],
  [/\bbrowseType\b/, 'browseType'],
  [/\brecTotal\b/, 'recTotal'],
  [/\brecPerPage\b/, 'recPerPage'],
  [/\bpageID\b/, 'pageID'],
  [/\borderBy\b/, 'orderBy（请求参数用 sort）'],
  [/zt_/, 'zt_ 前缀'],
  [/\bproductplan\b/i, 'productplan → plan'],
  [/\btesttask\b/i, 'testtask → testRun'],
  [/\bcaselib\b/i, 'caselib → library'],
  [/\btestsuite\b/i, 'testsuite → suite'],
  [/\bcasestep\b/i, 'casestep → step'],
  [/\bdept\b/, 'dept → department'],
  [/\bstoryType\b/, 'storyType'],
  [/\bERName\b/, 'ERName'],
  [/\bSRName\b/, 'SRName'],
  [/\bURName\b/, 'URName'],
  [/\bmailto\b/, 'mailto（作字段名）'],
  [/\bmodule\b(?!["'])/, 'module（作字段名，用 categoryId）'],
  [/\bvision\b/, 'vision（多形态已砍）'],
]

const hits = []
let scanned = 0
for (const dir of SCAN_ROOTS) {
  for (const { full, rel } of walkFiles(dir, { exts: EXTS, skip: skipFile })) {
    if (rel.split('/').some((segment) => SKIP_SEGMENTS.has(segment))) continue
    scanned += 1
    const lines = readFileSync(full, 'utf8').split('\n')
    for (const [pattern, label] of PATTERNS) {
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].includes('banned-words-ok')) continue // 行内豁免：合法 API 同名（如 query.orderBy）或反向断言测试
        if (pattern.test(lines[i])) hits.push(`${rel}:${i + 1}  ${label}  →  ${lines[i].trim().slice(0, 120)}`)
      }
    }
  }
}
assertScanFloor(GATE, scanned, 500)

report(GATE, hits, scanned, '02-naming §6 禁用词表 + 砍掉模块标识符')
