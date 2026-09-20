// P6 T-8 首屏预算门禁（01 §5 / phase-6 T-8）：读 frontend/web/dist 产物算 gzip 尺寸。
// ① 首屏 JS = dist/index.html 的 entry script + 全部 modulepreload 之和 ≤ 300KB gz
// ② 单域 chunk = dist/assets/domain-*.js（vite codeSplitting 按域分组）每个 ≤ 120KB gz
// 超标非零退出。用法：node tools/perf/bundle-budget.mjs（先 pnpm --filter web build）。
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = join(import.meta.dirname, '..', '..', 'frontend', 'web', 'dist')
const ENTRY_BUDGET_KB = 300
const DOMAIN_CHUNK_BUDGET_KB = 120

const gz = (bytes) => gzipSync(bytes, { level: 9 }).length

let indexHtml
try {
  indexHtml = readFileSync(join(DIST, 'index.html'), 'utf8')
} catch {
  console.error(`缺少 ${join(DIST, 'index.html')}——先执行 pnpm --filter web build`)
  process.exit(1)
}

// 首屏集合：<script type=module src> + <link rel=modulepreload href>
const initialRefs = [...indexHtml.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((m) => m.group?.[1] ?? m[1])
const entryTotal = initialRefs.reduce((sum, ref) => sum + gz(readFileSync(join(DIST, ref.replace(/^\//, '')))), 0)

const domainChunks = readdirSync(join(DIST, 'assets'))
  .filter((f) => /^domain-.*\.js$/.test(f))
  .map((f) => ({ name: f, gz: gz(readFileSync(join(DIST, 'assets', f))) }))
  .sort((a, b) => b.gz - a.gz)

const failures = []
const kb = (n) => `${(n / 1024).toFixed(1)}KB gz`
console.log(`首屏 JS（${initialRefs.length} 个文件）：${kb(entryTotal)} / 预算 ${ENTRY_BUDGET_KB}KB gz`)
if (entryTotal > ENTRY_BUDGET_KB * 1024) failures.push(`首屏 ${kb(entryTotal)} 超预算 ${ENTRY_BUDGET_KB}KB gz`)

if (domainChunks.length === 0) failures.push('未发现任何 domain-*.js chunk——vite codeSplitting 按域分组未生效')
for (const c of domainChunks) console.log(`  域 chunk ${c.name}: ${kb(c.gz)}`)
const overDomain = domainChunks.filter((c) => c.gz > DOMAIN_CHUNK_BUDGET_KB * 1024)
for (const c of overDomain) failures.push(`域 chunk ${c.name} ${kb(c.gz)} 超预算 ${DOMAIN_CHUNK_BUDGET_KB}KB gz`)

if (failures.length > 0) {
  console.error(`\nbundle 预算未达标：`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('\nbundle 预算达标 ✓')
