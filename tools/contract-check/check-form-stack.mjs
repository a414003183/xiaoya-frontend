// check-form-stack（T70 · AUDIT FE-04）：表单栈只许 RHF + zod 一条轨，禁止 antd 校验栈回流。
//
// 规则：前端源码（web/src + 各包 src）里
//   ① 不许 `Form.useForm`（antd 校验栈入口——它的 rules 没有 schema 类型保护）；
//   ② 不许 JSX `rules=`（antd 规则数组）。
// 提交表单一律 `react-hook-form` + zod（范式见 `web/src/features/org/forms/account-create-modal.tsx`），
// 422 字段错误走唯一入口 `shared/form-fields.tsx#applyServerFields`。
// 合法例外用行内标记 `// form-stack-ok：<理由>`（可写在违规行或其紧邻上一行），
// 现有豁免：`packages/design-system/src/components/filter-form.tsx`（列表筛选标准件 CONVENTIONS §3.2，
// 只用 antd form 实例做重置，无 rules 校验）。
//
// 已知上限（ponytail）：只认字面写法——`rules` 经变量转手传入 Form.Item 的间接写法不覆盖；
//   升级路径 = 在 scanSource 里补「属性名为 rules 的展开入参」识别。
//
// 用法：`node tools/contract-check/check-form-stack.mjs [--selftest]`
import { readFileSync } from 'node:fs'
import { sep } from 'node:path'
import { assertScanFloor, frontendSrcRoots, report, walkFiles } from './scan-roots.mjs'

const GATE = 'check-form-stack'
const EXEMPT = 'form-stack-ok'

const ANTD_FORM_USE = /Form\.useForm\b/
const ANTD_RULES_ATTR = /\brules\s*=/

/** 纯函数：一段源码 → 违规行（供 --selftest 与真实扫描共用）。豁免标记可写在行内或其紧邻上一行。 */
export function scanSource(text) {
  const hits = []
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    if (line.includes(EXEMPT) || (lines[index - 1] ?? '').includes(EXEMPT)) return
    if (ANTD_FORM_USE.test(line)) {
      hits.push({ line: index + 1, label: 'Form.useForm（antd 校验栈；表单一律 RHF+zod）', text: line.trim() })
    }
    if (ANTD_RULES_ATTR.test(line)) {
      hits.push({ line: index + 1, label: 'rules=（antd 规则数组；校验进 zod schema）', text: line.trim() })
    }
  })
  return hits
}

function selftest() {
  const failures = []
  /** [样本源码, 期望违规数, 说明] */
  const samples = [
    ["const { control, handleSubmit } = useForm({ resolver: zodResolver(schema) })", 0, 'RHF 用法干净'],
    ['<TextField control={control} name="title" label={t(\'x\')} />', 0, '共享字段件干净'],
    ['const [form] = Form.useForm()', 1, 'Form.useForm 必红'],
    ['const [form] = Form.useForm<MenuForm>()', 1, '带泛型的 Form.useForm 必红'],
    ['<Form.Item name="title" rules={[{ required: true }]}>', 1, 'rules= 必红'],
    ['<Form.Item name="a" rules={cond ? [required] : []}>', 1, '条件 rules= 必红'],
    ['const [form] = Form.useForm() // form-stack-ok：列表筛选标准件', 0, '行内豁免生效'],
    ['// form-stack-ok：理由\nconst [form] = Form.useForm()', 0, '上一行豁免生效'],
  ]
  for (const [source, expected, label] of samples) {
    const hits = scanSource(source)
    if (hits.length !== expected) failures.push(`${label}：期望 ${expected} 处，实际 ${hits.length} 处`)
  }
  const two = scanSource('const [form] = Form.useForm()\n<Form.Item name="a" rules={[{ required: true }]}>')
  if (two.length !== 2) failures.push(`两行两处应各报一次，实际 ${two.length}`)
  if (scanSource('rulesData = 1').length !== 0) failures.push('rulesData 变量名不应误报')
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
for (const root of frontendSrcRoots()) {
  for (const { full, rel } of walkFiles(root, { exts: new Set(['.ts', '.tsx']) })) {
    scanned += 1
    for (const hit of scanSource(readFileSync(full, 'utf8'))) {
      problems.push(`${rel.replaceAll(sep, '/')}:${hit.line}  ${hit.label}  →  ${hit.text}`)
    }
  }
}

assertScanFloor(GATE, scanned, 300)
report(GATE, problems, scanned, '表单栈单轨：RHF+zod，antd rules/Form.useForm 零回流')
