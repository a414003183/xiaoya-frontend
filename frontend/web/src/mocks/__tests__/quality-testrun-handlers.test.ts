import { ApiError } from '@zentao/api-client'
import type { TestRunView } from '@zentao/api-client/generated/model/testRunView'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import {
  assignRunCase,
  closeTestRunAction,
  fetchExecutionReports,
  fetchReport,
  fetchTestRun,
  fetchTestRunCases,
  fetchTestRuns,
  linkTestRunCasesAction,
  patchReport,
  patchTestRun,
  recordRunResult,
  runTestRunAction,
  submitReport,
  submitTestRun,
  unlinkTestRunCasesAction,
} from '../../features/quality/api/quality.api'
import { db, resetMockData } from '../db'
import { handlers } from '../handlers'

/**
 * TestRun / Report handler 契约测试（T-9/T-10）：四态五动作守卫、record-result 幂等 upsert 与 lastRun 同步、
 * 关单日期守卫、Report 回填 reportId 与不可改字段，逐条对齐 quality §4.3/§5/§3.6。
 */
const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1 // admin：超管组，全权限码
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

async function expectApiError(promise: Promise<unknown>, code: number): Promise<void> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).code).toBe(code)
}

async function createRun(): Promise<TestRunView> {
  return submitTestRun(1, {
    executionId: 5,
    name: '迭代一回归',
    priority: 2,
    type: 'integrate',
    beginDate: '2026-09-10',
    endDate: '2026-09-20',
    owner: 'dev1',
  })
}

describe('TestRun 生命周期（quality §4.3）', () => {
  test('创建 → start 落 realBeganAt → 重复 start 42202 → close 缺 realFinishedAt/越界 42201 → close → activate', async () => {
    const created = await createRun()
    expect(created.status).toBe('wait')
    expect(created.projectId).toBe(3) // 由执行 parentId 冗余
    expect(created.lockVersion).toBe(0)

    const started = await runTestRunAction(created.id, 'start')
    expect(started.status).toBe('doing')
    expect(started.realBeganAt).toBeTruthy()
    await expectApiError(runTestRunAction(created.id, 'start'), 42202)

    await expectApiError(closeTestRunAction(created.id, { realFinishedAt: '' }), 42201)
    await expectApiError(closeTestRunAction(created.id, { realFinishedAt: '2026-09-09T00:00:00Z' }), 42201)
    // 上界 = endDate(09-20) 次日 09-21；09-22 越界（口径同后端 TestRun.requireClosable）
    await expectApiError(closeTestRunAction(created.id, { realFinishedAt: '2026-09-22T00:00:00Z' }), 42201)

    const closed = await closeTestRunAction(created.id, {
      realFinishedAt: '2026-09-21T00:00:00Z',
      comment: '本轮完成',
    })
    expect(closed.status).toBe('done')
    expect(closed.realFinishedAt).toBe('2026-09-21T00:00:00Z')

    await expectApiError(runTestRunAction(created.id, 'block'), 42202)
    const activated = await runTestRunAction(created.id, 'activate')
    expect(activated.status).toBe('doing')
  })

  test('block 仅 wait|doing、activate 仅 blocked|done；PATCH 白名单 + lockVersion 40901', async () => {
    const created = await createRun()
    const blocked = await runTestRunAction(created.id, 'block', '等构建')
    expect(blocked.status).toBe('blocked')
    await expectApiError(runTestRunAction(created.id, 'block'), 42202)

    await expectApiError(patchTestRun(created.id, { name: '改名', lockVersion: 99 }), 40901)
    const patched = await patchTestRun(created.id, {
      name: '迭代一回归（改）',
      endDate: '2026-09-25',
      lockVersion: blocked.lockVersion,
    })
    expect(patched.name).toBe('迭代一回归（改）')
    expect(patched.endDate).toBe('2026-09-25')
    await expectApiError(patchTestRun(created.id, { status: 'done', lockVersion: patched.lockVersion }), 40001)
    await expectApiError(patchTestRun(created.id, { beginDate: '2026-10-01', lockVersion: patched.lockVersion }), 42201)
  })

  test('不可见产品下的测试单：列表/详情 40302（§7）', async () => {
    db.products.push({
      id: 900,
      name: '私有产品',
      type: 'normal',
      status: 'normal',
      po: 'admin',
      acl: 'private',
      whitelist: [],
      sort: 9,
      createdBy: 'admin',
      createdAt: '2026-09-01T00:00:00Z',
      lockVersion: 0,
    })
    const view = await createRun()
    db.testRuns.push({ ...view, id: 9100, productId: 900 })
    db.currentAccountId = 2 // dev1：补 testrun-view 后仅剩数据权限拦截
    db.groups.find((group) => group.id === 2)?.privCodes.push('testrun-view', 'testrun-create')
    await expectApiError(fetchTestRuns(900, {}), 40302)
    await expectApiError(fetchTestRun(9100), 40302)
  })
})

describe('Result 幂等 upsert（quality §3.5/§4.3）', () => {
  test('重复登记覆写同行不新增，并同步用例 lastRun 三字段', async () => {
    const created = await createRun()
    await linkTestRunCasesAction(created.id, { caseIds: [1, 2], assignee: 'dev1' })
    expect((await fetchTestRunCases(created.id, {})).total).toBe(2)

    await runTestRunAction(created.id, 'start')
    const first = await recordRunResult(created.id, 1, { result: 'fail', comment: '登录失败' })
    expect(first.caseTitle).toBe('Login success main flow')
    expect(first.runner).toBe('admin')

    const second = await recordRunResult(created.id, 1, { result: 'pass' })
    expect(second.id).toBe(first.id) // 同行覆写
    expect((await fetchTestRunCases(created.id, {})).total).toBe(2)

    const testCase = db.testCases.find((item) => item.id === 1)
    expect(testCase?.lastRunResult).toBe('pass')
    expect(testCase?.lastRunner).toBe('admin')
    expect(testCase?.lastRunAt).toBeTruthy()

    // 已关联行可改派；未关联行 40401
    expect((await assignRunCase(created.id, 1, 'dev1')).assignee).toBe('dev1')
    await expectApiError(assignRunCase(created.id, 3, 'dev1'), 40401)
    expect((await fetchTestRunCases(created.id, { filters: { assignee: '@me' } })).total).toBe(0)
  })

  test('非 doing 登记 → 42202；非法 result → 42201；解除关联后清单缩短', async () => {
    const created = await createRun()
    await linkTestRunCasesAction(created.id, { caseIds: [1] })
    await expectApiError(recordRunResult(created.id, 1, { result: 'pass' }), 42202)

    await runTestRunAction(created.id, 'start')
    await expectApiError(recordRunResult(created.id, 1, { result: 'unknown' }), 42201)

    await unlinkTestRunCasesAction(created.id, [1])
    expect((await fetchTestRunCases(created.id, {})).total).toBe(0)
  })
})

describe('Report（quality §3.6/§5）', () => {
  test('创建回填 TestRun.reportId；executionId 不可改 40001；lockVersion 40901', async () => {
    const first = await createRun()
    const second = await createRun()
    const report = await submitReport(5, {
      title: '迭代一测试报告',
      testRunIds: [first.id],
      beginDate: '2026-09-10',
      endDate: '2026-09-20',
      owner: 'dev1',
      content: '# 结论\n本轮通过',
    })
    expect(report.productId).toBe(1) // 冗余口径 = 首个关联测试单的产品
    expect(db.testRuns.find((item) => item.id === first.id)?.reportId).toBe(report.id)
    expect(db.testRuns.find((item) => item.id === second.id)?.reportId ?? null).toBeNull()
    expect((await fetchReport(report.id)).title).toBe('迭代一测试报告')

    await expectApiError(submitReport(5, { title: '越执行关联', testRunIds: [9999] }), 42201)
    await expectApiError(patchReport(report.id, { executionId: 6, lockVersion: report.lockVersion }), 40001)
    await expectApiError(patchReport(report.id, { title: '改', lockVersion: 99 }), 40901)

    const patched = await patchReport(report.id, {
      title: '迭代一测试报告（定稿）',
      testRunIds: [first.id, second.id],
      lockVersion: report.lockVersion,
    })
    expect(patched.title).toBe('迭代一测试报告（定稿）')
    expect(db.testRuns.find((item) => item.id === second.id)?.reportId).toBe(report.id)
    expect((await fetchExecutionReports(5, {})).total).toBe(1)
  })
})
