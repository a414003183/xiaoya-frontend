import { ok } from '@zentao/api-client'
import {
  activateBug,
  activateTestRun,
  assignBug,
  assignTestRunCase,
  batchCreateBugs,
  batchCreateTestCases,
  batchOperateBugs,
  batchOperateTestCases,
  blockTestRun,
  closeBug,
  closeTestRun,
  confirmBug,
  createBug,
  createExecutionReport,
  createLibrary,
  createLibraryCase,
  createSuite,
  createTestCase,
  createTestRun,
  deleteBug,
  deleteLibrary,
  deleteReport,
  deleteSuite,
  deleteTestCase,
  deleteTestRun,
  getBug,
  getDict,
  getLibrary,
  getReport,
  getSuite,
  getTestCase,
  getTestRun,
  importTestCasesFromLibrary,
  linkSuiteCases,
  linkTestRunCases,
  listBugActivities,
  listBugs,
  listExecutionReports,
  listLibraries,
  listLibraryCases,
  listSuites,
  listTestCaseActivities,
  listTestCases,
  listTestRunActivities,
  listTestRunCases,
  listTestRuns,
  recordTestRunResult,
  resolveBug,
  reviewTestCase,
  startTestRun,
  unlinkSuiteCases,
  unlinkTestRunCases,
  updateBug,
  updateLibrary,
  updateReport,
  updateSuite,
  updateTestCase,
  updateTestRun,
} from '@zentao/api-client/generated'
import type { ActivityView } from '@zentao/api-client/generated/model/activityView'
import type { BugView } from '@zentao/api-client/generated/model/bugView'
import type { ListBugsParams } from '@zentao/api-client/generated/model/listBugsParams'
import type { ListExecutionReportsParams } from '@zentao/api-client/generated/model/listExecutionReportsParams'
import type { ListLibrariesParams } from '@zentao/api-client/generated/model/listLibrariesParams'
import type { ListLibraryCasesParams } from '@zentao/api-client/generated/model/listLibraryCasesParams'
import type { ListSuitesParams } from '@zentao/api-client/generated/model/listSuitesParams'
import type { ListTestCasesParams } from '@zentao/api-client/generated/model/listTestCasesParams'
import type { ListTestRunCasesParams } from '@zentao/api-client/generated/model/listTestRunCasesParams'
import type { ListTestRunsParams } from '@zentao/api-client/generated/model/listTestRunsParams'
import type { ReportView } from '@zentao/api-client/generated/model/reportView'
import type { ResultView } from '@zentao/api-client/generated/model/resultView'
import type { SuiteView } from '@zentao/api-client/generated/model/suiteView'
import type { TestCaseView } from '@zentao/api-client/generated/model/testCaseView'
import type { TestRunView } from '@zentao/api-client/generated/model/testRunView'
import { buildListParams, type ListDsl } from '../../../shared/list-dsl'
import { type DomainMeta, fetchMeta } from '../../../shared/meta'
import { fetchBranches, fetchCategories, fetchPlans } from '../../product'

/** quality 域数据入口（01 §3.2：域内唯一数据入口，orval 封装 + qk 工厂）。全域 = Bug/TestCase/Suite/Library/TestRun/Result/Report（quality §5）。 */

export type { ActivityView, BugView, ReportView, ResultView, SuiteView, TestCaseView, TestRunView }

export type ActivityPage = { items: ActivityView[]; hasMore: boolean }
export type ListResult<T> = { items: T[]; total: number }
export type BatchResultItem = { id: number; ok: boolean; error?: string | null }
export type BatchCreateResultItem = { index: number; ok: boolean; id?: number | null; error?: string | null }
export type AccountOption = { account: string; realName: string }

// ── Bug（quality §5 前 12 端点） ──

export async function fetchBugs(productId: number, dsl: ListDsl<ListBugsParams> = {}): Promise<ListResult<BugView>> {
  return ok(await listBugs(productId, buildListParams<ListBugsParams>(dsl))).data
}

export async function fetchBug(bugId: number): Promise<BugView> {
  return ok(await getBug(bugId)).data
}

export async function submitBug(productId: number, body: Record<string, unknown>): Promise<BugView> {
  return ok(await createBug(productId, body as never)).data
}

export async function patchBug(bugId: number, body: Record<string, unknown>): Promise<BugView> {
  return ok(await updateBug(bugId, body as never)).data
}

/** 软删 Bug（叶子对象，删后详情 40401；§5）。 */
export async function deleteBugAction(bugId: number): Promise<null> {
  return ok(await deleteBug(bugId)).data
}

export async function submitBatchCreateBugs(
  productId: number,
  items: Record<string, unknown>[],
): Promise<{ results: BatchCreateResultItem[] }> {
  return ok(await batchCreateBugs(productId, { items: items as never })).data
}

export async function submitBatchBugs(body: {
  ids: number[]
  action: string
  params?: Record<string, unknown>
}): Promise<{ results: BatchResultItem[] }> {
  return ok(await batchOperateBugs(body as never)).data
}

// Bug 五动作 + 动态流（§4.1）

export async function confirmBugAction(
  bugId: number,
  body: { assignee?: string | null; comment?: string | null },
): Promise<BugView> {
  return ok(await confirmBug(bugId, body)).data
}

export async function resolveBugAction(
  bugId: number,
  body: {
    resolution: string
    resolvedBuild?: string | null
    duplicateOfId?: number | null
    assignee?: string | null
    comment?: string | null
  },
): Promise<BugView> {
  return ok(await resolveBug(bugId, body as never)).data
}

export async function activateBugAction(
  bugId: number,
  body: { openedBuilds: string; assignee?: string | null; comment?: string | null },
): Promise<BugView> {
  return ok(await activateBug(bugId, body)).data
}

export async function closeBugAction(bugId: number, comment?: string): Promise<BugView> {
  return ok(await closeBug(bugId, { comment: comment ?? null })).data
}

export async function assignBugAction(
  bugId: number,
  body: { assignee: string; comment?: string | null },
): Promise<BugView> {
  return ok(await assignBug(bugId, body)).data
}

export async function fetchBugActivities(bugId: number, beforeId?: number): Promise<ActivityPage> {
  const params = beforeId === undefined ? { limit: 50 } : { limit: 50, beforeId }
  return ok(await listBugActivities(bugId, params)).data
}

export const fetchBugMeta = (): Promise<DomainMeta> => fetchMeta('bug')

// ── TestCase（quality §5 中 11 端点） ──

export async function fetchTestCases(
  productId: number,
  dsl: ListDsl<ListTestCasesParams> = {},
): Promise<ListResult<TestCaseView>> {
  return ok(await listTestCases(productId, buildListParams<ListTestCasesParams>(dsl))).data
}

export async function fetchTestCase(caseId: number): Promise<TestCaseView> {
  return ok(await getTestCase(caseId)).data
}

export async function submitTestCase(productId: number, body: Record<string, unknown>): Promise<TestCaseView> {
  return ok(await createTestCase(productId, body as never)).data
}

export async function patchTestCase(caseId: number, body: Record<string, unknown>): Promise<TestCaseView> {
  return ok(await updateTestCase(caseId, body as never)).data
}

/** 软删用例（历史执行结果行保留；§5）。 */
export async function deleteTestCaseAction(caseId: number): Promise<null> {
  return ok(await deleteTestCase(caseId)).data
}

export async function submitBatchCreateTestCases(
  productId: number,
  items: Record<string, unknown>[],
): Promise<{ results: BatchCreateResultItem[] }> {
  return ok(await batchCreateTestCases(productId, { items: items as never })).data
}

export async function submitBatchTestCases(body: {
  ids: number[]
  action: string
  params?: Record<string, unknown>
}): Promise<{ results: BatchResultItem[] }> {
  return ok(await batchOperateTestCases(body as never)).data
}

export async function reviewTestCaseAction(
  caseId: number,
  body: { result: 'pass' | 'clarify'; comment?: string | null },
): Promise<TestCaseView> {
  return ok(await reviewTestCase(caseId, body)).data
}

export async function fetchTestCaseActivities(caseId: number, beforeId?: number): Promise<ActivityPage> {
  const params = beforeId === undefined ? { limit: 50 } : { limit: 50, beforeId }
  return ok(await listTestCaseActivities(caseId, params)).data
}

export async function importCasesFromLibrary(
  productId: number,
  body: { libraryId: number; caseIds: number[] },
): Promise<{ importedCount: number }> {
  return ok(await importTestCasesFromLibrary(productId, body)).data
}

export async function fetchLibraryCases(
  libraryId: number,
  dsl: ListDsl<ListLibraryCasesParams> = {},
): Promise<ListResult<TestCaseView>> {
  return ok(await listLibraryCases(libraryId, buildListParams<ListLibraryCasesParams>(dsl))).data
}

export async function submitLibraryCase(libraryId: number, body: Record<string, unknown>): Promise<TestCaseView> {
  return ok(await createLibraryCase(libraryId, body as never)).data
}

export const fetchTestCaseMeta = (): Promise<DomainMeta> => fetchMeta('testCase')

// ── Suite（quality §5：/suites 面排除 type=library） ──

export async function fetchSuites(
  productId: number,
  dsl: ListDsl<ListSuitesParams> = {},
): Promise<ListResult<SuiteView>> {
  return ok(await listSuites(productId, buildListParams<ListSuitesParams>(dsl))).data
}

export async function fetchSuite(suiteId: number): Promise<SuiteView> {
  return ok(await getSuite(suiteId)).data
}

export async function submitSuite(productId: number, body: Record<string, unknown>): Promise<SuiteView> {
  return ok(await createSuite(productId, body as never)).data
}

export async function patchSuite(suiteId: number, body: Record<string, unknown>): Promise<SuiteView> {
  return ok(await updateSuite(suiteId, body as never)).data
}

export async function linkSuiteCasesAction(suiteId: number, caseIds: number[]): Promise<SuiteView> {
  return ok(await linkSuiteCases(suiteId, { caseIds })).data
}

export async function unlinkSuiteCasesAction(suiteId: number, caseIds: number[]): Promise<SuiteView> {
  return ok(await unlinkSuiteCases(suiteId, { caseIds })).data
}

/** 软删套件（suite_case 关联行连带失效；§5）。 */
export async function deleteSuiteAction(suiteId: number): Promise<null> {
  return ok(await deleteSuite(suiteId)).data
}

export const fetchSuiteMeta = (): Promise<DomainMeta> => fetchMeta('suite')

// ── Library（同表 type=library/productId=0 的另一端点面，§3.3） ──

export async function fetchLibraries(dsl: ListDsl<ListLibrariesParams> = {}): Promise<ListResult<SuiteView>> {
  return ok(await listLibraries(buildListParams<ListLibrariesParams>(dsl))).data
}

export async function fetchLibrary(libraryId: number): Promise<SuiteView> {
  return ok(await getLibrary(libraryId)).data
}

export async function submitLibrary(body: { name: string; description?: string | null }): Promise<SuiteView> {
  return ok(await createLibrary(body)).data
}

export async function patchLibrary(libraryId: number, body: Record<string, unknown>): Promise<SuiteView> {
  return ok(await updateLibrary(libraryId, body as never)).data
}

/** 软删用例库（守卫：库内存在未删用例 → 42203；§5）。 */
export async function deleteLibraryAction(libraryId: number): Promise<null> {
  return ok(await deleteLibrary(libraryId)).data
}

export const fetchLibraryMeta = (): Promise<DomainMeta> => fetchMeta('library')

// ── TestRun（质量 §3.4/§4.3） ──

/** 无表单动作（§4.3：start 无请求体，block/activate 只收 comment）。 */
export type TestRunAction = 'start' | 'block' | 'activate'

export async function fetchTestRuns(
  productId: number,
  dsl: ListDsl<ListTestRunsParams> = {},
): Promise<ListResult<TestRunView>> {
  return ok(await listTestRuns(productId, buildListParams<ListTestRunsParams>(dsl))).data
}

export async function fetchTestRun(testRunId: number): Promise<TestRunView> {
  return ok(await getTestRun(testRunId)).data
}

export async function submitTestRun(productId: number, body: Record<string, unknown>): Promise<TestRunView> {
  return ok(await createTestRun(productId, body as never)).data
}

export async function patchTestRun(testRunId: number, body: Record<string, unknown>): Promise<TestRunView> {
  return ok(await updateTestRun(testRunId, body as never)).data
}

export async function runTestRunAction(
  testRunId: number,
  action: TestRunAction,
  comment?: string | null,
): Promise<TestRunView> {
  if (action === 'start') {
    return ok(await startTestRun(testRunId)).data
  }
  const body = { comment: comment ?? null }
  return action === 'block'
    ? ok(await blockTestRun(testRunId, body)).data
    : ok(await activateTestRun(testRunId, body)).data
}

export async function closeTestRunAction(
  testRunId: number,
  body: { realFinishedAt: string; comment?: string | null },
): Promise<TestRunView> {
  return ok(await closeTestRun(testRunId, body)).data
}

/** 软删测试单（test_run_case 行连带失效；已回填的 reportId 不清；§5）。 */
export async function deleteTestRunAction(testRunId: number): Promise<null> {
  return ok(await deleteTestRun(testRunId)).data
}

export async function fetchTestRunCases(
  testRunId: number,
  dsl: ListDsl<ListTestRunCasesParams> = {},
): Promise<ListResult<ResultView>> {
  return ok(await listTestRunCases(testRunId, buildListParams<ListTestRunCasesParams>(dsl))).data
}

export async function linkTestRunCasesAction(
  testRunId: number,
  body: { caseIds: number[]; assignee?: string | null },
): Promise<ListResult<ResultView>> {
  return ok(await linkTestRunCases(testRunId, body)).data
}

export async function unlinkTestRunCasesAction(testRunId: number, caseIds: number[]): Promise<ListResult<ResultView>> {
  return ok(await unlinkTestRunCases(testRunId, { caseIds })).data
}

export async function recordRunResult(
  testRunId: number,
  caseId: number,
  body: { result: string; comment?: string | null },
): Promise<ResultView> {
  return ok(await recordTestRunResult(testRunId, caseId, body as never)).data
}

export async function assignRunCase(testRunId: number, caseId: number, assignee: string): Promise<ResultView> {
  return ok(await assignTestRunCase(testRunId, caseId, { assignee })).data
}

export async function fetchTestRunActivities(testRunId: number, beforeId?: number): Promise<ActivityPage> {
  const params = beforeId === undefined ? { limit: 50 } : { limit: 50, beforeId }
  return ok(await listTestRunActivities(testRunId, params)).data
}

export const fetchTestRunMeta = (): Promise<DomainMeta> => fetchMeta('testRun')

// ── Report（质量 §3.6：executionId 创建后不可改） ──

export async function fetchExecutionReports(
  executionId: number,
  dsl: ListDsl<ListExecutionReportsParams> = {},
): Promise<ListResult<ReportView>> {
  return ok(await listExecutionReports(executionId, buildListParams<ListExecutionReportsParams>(dsl))).data
}

export async function fetchReport(reportId: number): Promise<ReportView> {
  return ok(await getReport(reportId)).data
}

export async function submitReport(executionId: number, body: Record<string, unknown>): Promise<ReportView> {
  return ok(await createExecutionReport(executionId, body as never)).data
}

export async function patchReport(reportId: number, body: Record<string, unknown>): Promise<ReportView> {
  return ok(await updateReport(reportId, body as never)).data
}

/** 软删报告（关联测试单的 reportId 清空回写；§5）。 */
export async function deleteReportAction(reportId: number): Promise<null> {
  return ok(await deleteReport(reportId)).data
}

export const fetchReportMeta = (): Promise<DomainMeta> => fetchMeta('report')

// ── 表单选项（跨域只读：分支/分类/计划经 product 域出口，账号经 dicts） ──

export { fetchBranches, fetchPlans }

export async function fetchBugCategories(productId: number): Promise<ListResult<{ id: number; name: string }>> {
  return fetchCategories(productId, 'bug')
}

export async function fetchCaseCategories(productId: number): Promise<ListResult<{ id: number; name: string }>> {
  return fetchCategories(productId, 'case')
}

/** os/browser 字典项（quality §3.1：meta 只声明 source="bug-os"/"bug-browser"，值域在 /dicts）。 */
export async function fetchBugDict(name: 'bug-os' | 'bug-browser'): Promise<{ value: string; i18n: string }[]> {
  const data = ok(await getDict(name)).data
  return data.items.map((item) => ({ value: String(item.value ?? ''), i18n: String(item.i18n ?? '') }))
}

export async function fetchAccountOptions(): Promise<AccountOption[]> {
  const data = ok(await getDict('accounts')).data
  return data.items.map((item) => ({
    account: String(item.account ?? ''),
    realName: String(item.realName ?? item.account ?? ''),
  }))
}

// ── CSV 导出资源路径（03 §3 format=csv；不含 API 基址，由 shared/use-csv-export 补基址） ──

export const bugsCsvPath = (productId: number): string => `/products/${productId}/bugs`
export const testCasesCsvPath = (productId: number): string => `/products/${productId}/test-cases`

// ── query key 工厂（02 §4） ──

/** 写后失效根：与 qk 的首段同源，动作处理器统一按根失效（task 域同范式）。 */
export const QUALITY_QUERY_ROOTS = [
  'listBugs',
  'getBug',
  'listTestCases',
  'getTestCase',
  'listSuites',
  'getSuite',
  'listLibraries',
  'getLibrary',
  'listLibraryCases',
  'listTestRuns',
  'getTestRun',
  'listTestRunCases',
  'listExecutionReports',
  'getReport',
] as const

export const qk = {
  quality: {
    bugList: (productId: number, params: unknown) => ['listBugs', productId, params] as const,
    bug: (bugId: number) => ['getBug', bugId] as const,
    bugActivities: (bugId: number) => ['listBugActivities', bugId] as const,
    bugMeta: () => ['meta', 'bug'] as const,
    caseList: (productId: number, params: unknown) => ['listTestCases', productId, params] as const,
    testCase: (caseId: number) => ['getTestCase', caseId] as const,
    caseActivities: (caseId: number) => ['listTestCaseActivities', caseId] as const,
    caseMeta: () => ['meta', 'testCase'] as const,
    suiteList: (productId: number, params: unknown) => ['listSuites', productId, params] as const,
    suite: (suiteId: number) => ['getSuite', suiteId] as const,
    suiteMeta: () => ['meta', 'suite'] as const,
    libraryList: (params: unknown) => ['listLibraries', params] as const,
    library: (libraryId: number) => ['getLibrary', libraryId] as const,
    libraryCases: (libraryId: number, params: unknown) => ['listLibraryCases', libraryId, params] as const,
    libraryMeta: () => ['meta', 'library'] as const,
    testRunList: (productId: number, params: unknown) => ['listTestRuns', productId, params] as const,
    testRun: (testRunId: number) => ['getTestRun', testRunId] as const,
    testRunCases: (testRunId: number, params: unknown) => ['listTestRunCases', testRunId, params] as const,
    testRunActivities: (testRunId: number) => ['listTestRunActivities', testRunId] as const,
    testRunMeta: () => ['meta', 'testRun'] as const,
    reportList: (executionId: number, params: unknown) => ['listExecutionReports', executionId, params] as const,
    report: (reportId: number) => ['getReport', reportId] as const,
    reportMeta: () => ['meta', 'report'] as const,
  },
} as const
