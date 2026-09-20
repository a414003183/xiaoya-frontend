import type { TestCaseView } from '@zentao/api-client/generated/model/testCaseView'
import type { StatusTone } from '@zentao/design-system'
import type { MetaAction } from '../../shared/meta'

/** quality 域纯逻辑（01 §3.2 model.ts）：Bug/用例状态与动作派生、resolve 联动守卫、步骤子表约束。 */

/** 步骤行形状（从 TestCaseView 提取，不落旧名标识符）。 */
export type StepInput = TestCaseView['steps'][number]

// ── Bug（quality §3.1/§4.1） ──

export const BUG_SEVERITIES = [1, 2, 3, 4] as const

const BUG_TONE: Record<string, StatusTone> = {
  active: 'error',
  resolved: 'pending',
  closed: 'closed',
}

export function bugTone(status: string): StatusTone {
  return BUG_TONE[status] ?? 'neutral'
}

/** 严重程度文案 key（quality §3.1：severity i18n = bug.severity.*）。 */
export function severityKey(severity: number | undefined): string {
  const value = severity ?? 3
  return `bug.severity.${(BUG_SEVERITIES as readonly number[]).includes(value) ? value : 3}`
}

/** resolve 联动守卫（quality §4.1）：=duplicate 需 duplicateOfId，=fixed 需 resolvedBuild。 */
export function requiresDuplicateOf(resolution: string): boolean {
  return resolution === 'duplicate'
}

export function requiresResolvedBuild(resolution: string): boolean {
  return resolution === 'fixed'
}

/** activate 的 assignee 缺省语义：省略回派原解决人（quality §4.1）。 */
export function activateAssigneeFallback(resolvedBy: string | null | undefined): string | null {
  return resolvedBy ?? null
}

// ── TestCase（quality §3.2/§4.2） ──

/** 标记态：PATCH status 唯一例外只许这三态互转（03 §1）。 */
export const TEST_CASE_MARKER_STATUSES = ['normal', 'blocked', 'investigate'] as const
export const TEST_CASE_RESULTS = ['pass', 'fail', 'blocked', 'n/a'] as const

const CASE_TONE: Record<string, StatusTone> = {
  wait: 'pending',
  normal: 'active',
  blocked: 'warning',
  investigate: 'neutral',
}

export function testCaseTone(status: string): StatusTone {
  return CASE_TONE[status] ?? 'neutral'
}

/** PATCH status 直改仅限标记态互转（03 §1 唯一例外）；wait 进出只经 review。 */
export function canPatchStatus(status: string | undefined): boolean {
  return status !== undefined && (TEST_CASE_MARKER_STATUSES as readonly string[]).includes(status)
}

/** 评审弹窗可用性：meta actions 里存在 review 且当前状态被允许。 */
export function reviewAllowed(actions: readonly MetaAction[] | undefined, status: string | undefined): boolean {
  return actionsForAction(actions, 'review', status)
}

function actionsForAction(
  actions: readonly MetaAction[] | undefined,
  action: string,
  status: string | undefined,
): boolean {
  return (actions ?? []).some(
    (metaAction) =>
      metaAction.action === action &&
      (!metaAction.allowedStatus ||
        metaAction.allowedStatus.length === 0 ||
        (status !== undefined && metaAction.allowedStatus.includes(status))),
  )
}

// ── 步骤子表（quality §3.2：≤100 条、description/expects 逐条 ≤2000 字） ──

export const MAX_STEPS = 100
export const STEP_TEXT_MAX = 2000

export type StepError = { index: number; field: 'description' | 'expects'; message: string }

/** 逐行校验：空步骤行不算错（提交前应先 dropEmptySteps），超长/缺描述记行号。 */
export function validateSteps(steps: readonly StepInput[]): StepError[] {
  const errors: StepError[] = []
  steps.forEach((step, index) => {
    if (!step.description || step.description.trim().length === 0) {
      errors.push({ index, field: 'description', message: 'steps.descriptionRequired' })
    } else if (step.description.length > STEP_TEXT_MAX) {
      errors.push({ index, field: 'description', message: 'steps.textTooLong' })
    }
    if ((step.expects ?? '').length > STEP_TEXT_MAX) {
      errors.push({ index, field: 'expects', message: 'steps.textTooLong' })
    }
  })
  return errors
}

/** 提交前整形：丢空行、sort 按 1..n 单调递增（quality §3.2 sort 行号）。 */
export function normalizeSteps(steps: readonly StepInput[]): StepInput[] {
  return steps
    .filter((step) => (step.description ?? '').trim().length > 0 || (step.expects ?? '').trim().length > 0)
    .map((step, index) => ({
      sort: index + 1,
      description: step.description,
      expects: step.expects ?? null,
    }))
}

/** 详情页动作按钮 key（<domain>.action.<action>）；kebab 转 camel（02 §4）。 */
export function actionI18nKey(domain: 'bug' | 'testCase' | 'testRun' | 'suite' | 'library' | 'report', action: string) {
  return `${domain}.action.${action.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())}`
}

// ── Suite / Library（quality §3.3） ──

/** /suites 面可写类型：type=library 只经 /libraries 读写（§3.3）。 */
export const SUITE_TYPES = ['public', 'private'] as const

const SUITE_TONE: Record<string, StatusTone> = {
  public: 'active',
  private: 'pending',
  library: 'neutral',
}

export function suiteTone(type: string): StatusTone {
  return SUITE_TONE[type] ?? 'neutral'
}

// ── TestRun（quality §3.4/§4.3） ──

/** 执行结果四态与 testCase.lastRunResult 同词表（§3.5：result ∈ pass|fail|blocked|n/a）。 */
export const TEST_RUN_RESULTS = TEST_CASE_RESULTS

const TEST_RUN_TONE: Record<string, StatusTone> = {
  wait: 'pending',
  doing: 'active',
  done: 'closed',
  blocked: 'error',
}

export function testRunTone(status: string): StatusTone {
  return TEST_RUN_TONE[status] ?? 'neutral'
}

const RESULT_TONE: Record<string, StatusTone> = {
  pass: 'active',
  fail: 'error',
  blocked: 'warning',
  'n/a': 'neutral',
}

export function runResultTone(result: string | null | undefined): StatusTone {
  return result ? (RESULT_TONE[result] ?? 'neutral') : 'neutral'
}

export type ResultSummary = { pass: number; fail: number; blocked: number; 'n/a': number; none: number }

/** 测试单执行统计由 runs 现算（§6：详情页统计无独立端点）。 */
export function summarizeResults(items: readonly { result?: string | null }[]): ResultSummary {
  const summary: ResultSummary = { pass: 0, fail: 0, blocked: 0, 'n/a': 0, none: 0 }
  for (const item of items) {
    const key = item.result ?? 'none'
    if (key === 'pass' || key === 'fail' || key === 'blocked' || key === 'n/a') {
      summary[key] += 1
    } else {
      summary.none += 1
    }
  }
  return summary
}

/** 关单日期守卫（§4.3，口径同后端 TestRun.requireClosable）：realFinishedAt 必填、≥ beginDate、≤ endDate 次日。 */
export function closeDateError(
  beginDate: string | undefined,
  endDate: string | undefined,
  realFinishedAt: string | null,
): string | null {
  if (!realFinishedAt) {
    return 'required'
  }
  const day = realFinishedAt.slice(0, 10)
  if (beginDate && day < beginDate) {
    return 'beforeBegin'
  }
  if (endDate) {
    const nextDay = new Date(`${endDate}T00:00:00Z`)
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    if (day > nextDay.toISOString().slice(0, 10)) {
      return 'afterNextDay'
    }
  }
  return null
}

// ── Report（quality §3.6） ──

/** 创建后不可改字段（§3.6：PATCH 不接受，服务端 40001）。 */
export const REPORT_IMMUTABLE_FIELDS = ['executionId', 'projectId', 'productId'] as const
