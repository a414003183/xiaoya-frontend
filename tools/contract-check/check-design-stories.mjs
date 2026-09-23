#!/usr/bin/env node
// check-design-stories（T94 · CONVENTIONS §10「组件故事」行）：design-system 每个组件文件必须有 sibling story。
//
// 判据：`frontend/packages/design-system/src/components/*.tsx`（组件文件）必须有同名 `*.stories.tsx`
// （CSF 形态：`export default { component: … }` + 至少一个 story 导出）；例外显式登记
// 文件头 `// story-exempt：<理由>`（无 story 的工具/再导出面），不许静默缺。
// 豁免：`*.test.tsx` / `*.stories.tsx` 自身；`.ts`（hook / 再导出面 / 令牌）不是组件文件。
//
// story 的**可编译**由 `pnpm --filter @zentao/design-system typecheck`（tsc）看护；
// storybook 运行器/构建器暂未接入（取舍见 docs/plan/governance/quality-gate.md §Storybook）。
//
// 已知上限（ponytail）：按**文件**判 sibling，不解析一文件多组件是否每个都有同名 story 导出
// （list-card.tsx 的 ListCard/ListCardHeader 约定写在同一 story 文件里）；
// 升级路径 = 接 storybook test-runner 后逐 story 渲染验收。
//
// 用法：`node tools/contract-check/check-design-stories.mjs [--selftest]`
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, report } from './scan-roots.mjs'

const GATE = 'check-design-stories'
const COMPONENTS_DIR = join(ROOT, 'frontend', 'packages', 'design-system', 'src', 'components')
const EXEMPT = 'story-exempt'

/** 纯函数：组件文件名是否要求有 story（供 --selftest 与真实扫描共用）。 */
export function needsStory(fileName) {
  return fileName.endsWith('.tsx') && !/\.(test|stories)\.tsx$/.test(fileName)
}

/** 纯函数：源码里是否显式豁免（文件头标记，带理由）。 */
export function isExempt(text) {
  return text.split('\n').some((line) => line.includes(EXEMPT))
}

/** 纯函数：story 源码是否是「有 default 导出 + 至少一个 story」的 CSF 形态。 */
export function isUsableStory(text) {
  return /export\s+default\b/.test(text) && /export\s+const\s+\w+/.test(text)
}

function selftest() {
  const failures = []
  const check = (ok, why) => {
    if (!ok) failures.push(why)
  }
  check(needsStory('list-card.tsx'), '组件文件应要求 story')
  check(!needsStory('list-card.test.tsx'), '测试文件不判')
  check(!needsStory('list-card.stories.tsx'), 'story 自身不判')
  check(!needsStory('use-feedback.ts'), 'hook（.ts）不判')
  check(isExempt('// story-exempt：纯类型文件'), '豁免标记应识别')
  check(!isExempt('// 需要补 story'), '普通注释不豁免')
  check(isUsableStory("export default { component: X }\nexport const A = {}"), 'CSF 形态应识别')
  check(!isUsableStory('export const A = {}'), '缺 default 导出不算可用 story')
  check(!isUsableStory('export default { component: X }'), '缺 story 导出不算可用 story')
  if (failures.length > 0) {
    console.error(`${GATE} --selftest：${failures.length} 处自检失败`)
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }
  console.log(`${GATE} --selftest：9 项自检全过`)
}

if (process.argv.includes('--selftest')) {
  selftest()
  process.exit(0)
}

const problems = []
let scanned = 0
for (const name of readdirSync(COMPONENTS_DIR)) {
  if (!needsStory(name)) continue
  scanned += 1
  const source = readFileSync(join(COMPONENTS_DIR, name), 'utf8')
  const storyPath = join(COMPONENTS_DIR, name.replace(/\.tsx$/, '.stories.tsx'))
  if (isExempt(source)) continue
  if (!existsSync(storyPath)) {
    problems.push(`components/${name}  缺 sibling story（${name.replace(/\.tsx$/, '.stories.tsx')}）——新组件必须带故事`)
    continue
  }
  const story = readFileSync(storyPath, 'utf8')
  if (!isUsableStory(story)) {
    problems.push(`components/${name.replace(/\.tsx$/, '.stories.tsx')}  不是可用 CSF（要 export default + 至少一个 story 导出）`)
  }
}

report(GATE, problems, scanned, 'design-system 组件 story 全覆盖')
