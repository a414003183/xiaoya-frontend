// check-lang-catalog（platform 卡 §3.12）：后端语言目录副本 ↔ 前端语言包真源逐字节一致。
//
// 为什么需要这道门禁：服务端要知道每一个翻译键，才能校验上传的 Excel（未知键 → 42201）、
// 才能生成导出（全量键 + 当前生效文案）。真源仍在前端 `frontend/packages/i18n/src/locales/`，
// 后端 `backend/src/main/resources/lang/` 只是副本（LangCatalog 启动时读 classpath:lang/*.json）——
// 副本一旦漂移，导入校验会拒掉界面真实存在的键、导出会漏键，且没有任何其它门禁看得见。
// `--fix` 用真源覆写副本（同步语言包后忘了拷副本时先跑它）。
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, report } from './scan-roots.mjs'

const GATE = 'check-lang-catalog'
const LOCALES = join(ROOT, 'frontend', 'packages', 'i18n', 'src', 'locales')
const CATALOG = join(ROOT, 'backend', 'src', 'main', 'resources', 'lang')
/** 语言包 ↔ 后端副本的成对清单；新增语言 = 语言包 + 后端 LangCatalog 两处同步后在此加一行。 */
const BUNDLES = ['zh-CN.json', 'en.json']
const fix = process.argv.includes('--fix')

const problems = []
for (const name of BUNDLES) {
  const source = readFileSync(join(LOCALES, name), 'utf8')
  let copy = null
  try {
    copy = readFileSync(join(CATALOG, name), 'utf8')
  } catch {
    // 缺文件按不一致处理（--fix 可补）
  }
  if (copy === source) continue
  if (fix) {
    writeFileSync(join(CATALOG, name), source)
    continue
  }
  problems.push(
    copy === null
      ? `后端语言目录缺副本：backend/src/main/resources/lang/${name}（--fix 可从语言包补齐）`
      : `后端语言目录副本与前端语言包真源不一致：lang/${name}（改语言包后跑 node tools/contract-check/check-lang-catalog.mjs --fix）`,
  )
}

report(GATE, problems, BUNDLES.length, `后端语言目录副本 = 前端语言包真源（${BUNDLES.join(' / ')}${fix ? '，--fix 已同步' : ''}）`)
