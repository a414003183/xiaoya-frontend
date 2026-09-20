import { ApiError } from '@zentao/api-client'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import {
  deleteEffortAction,
  fetchTask,
  fetchTaskEfforts,
  fetchTasks,
  runTaskAction,
  submitEffort,
  submitTask,
} from '../../features/task/api/task.api'
import { db, resetMockData } from '../db'
import { handlers } from '../handlers'

/**
 * task handler 契约测试（T-10/T-11 验收的「MSW 下闭环可走」）：
 * 八动作状态机、父子守卫、工时三件套联动与执行 ACL 必须与 task 卡一致。
 */
const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1 // admin：超管组，全权限
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

describe('任务闭环（task §4）', () => {
  test('创建 → start（本次消耗落 effort）→ finish（增量累计）→ close → activate → assign', async () => {
    const created = await submitTask(5, { title: '闭环任务', priority: 1, estimateHours: 8 })
    expect(created.status).toBe('wait')
    expect(created.consumedHours).toBe(0)

    const started = await runTaskAction(created.id, 'start', { consumedHours: 2 })
    expect(started.status).toBe('doing')
    expect(started.consumedHours).toBe(2)
    expect(started.leftHours).toBe(8) // 缺省 = estimate − 本次消耗前的 consumed（同 backend）
    expect((await fetchTaskEfforts(created.id, {})).total).toBe(1)

    const finished = await runTaskAction(created.id, 'finish', { consumedHours: 4 })
    expect(finished.status).toBe('done')
    expect(finished.consumedHours).toBe(6)
    expect(finished.leftHours).toBe(0)
    expect((await fetchTaskEfforts(created.id, {})).total).toBe(2)

    const closed = await runTaskAction(created.id, 'close', {})
    expect(closed.status).toBe('closed')
    expect(closed.closedReason).toBe('done')

    const activated = await runTaskAction(created.id, 'activate', { leftHours: 3 })
    expect(activated.status).toBe('doing')
    expect(activated.closedReason ?? null).toBeNull()
    expect(activated.leftHours).toBe(3)

    const assigned = await runTaskAction(created.id, 'assign', { assignee: 'dev1' })
    expect(assigned.assignee).toBe('dev1')
    expect(assigned.assignedAt).toBeTruthy()
  })

  test('守卫：父任务 start → 42203；子任务再挂子任务 → 42203；activate 缺 leftHours → 42201', async () => {
    const parent = await submitTask(5, { title: '父任务' })
    const child = await submitTask(5, { title: '子任务', parentId: parent.id })
    expect(child.parentId).toBe(parent.id)
    expect((await fetchTask(parent.id)).isParent).toBe(true)

    await expectApiError(runTaskAction(parent.id, 'start', {}), 42203)
    await expectApiError(submitTask(5, { title: '孙任务', parentId: child.id }), 42203)
    await expectApiError(runTaskAction(child.id, 'activate', {}), 42201)
  })

  test('工时登记 leftHours=0 自动完成，删除该条工时后三件套回算且状态不回退', async () => {
    const task = await submitTask(5, { title: '自动完成任务', estimateHours: 4 })
    await runTaskAction(task.id, 'start', {})

    const effort = await submitEffort(task.id, { consumedHours: 4, leftHours: 0, work: '一次做完' })
    const done = await fetchTask(task.id)
    expect(done.status).toBe('done')
    expect(done.consumedHours).toBe(4)
    expect(done.leftHours).toBe(0)
    expect(done.finishedBy).toBe('admin')

    await deleteEffortAction(effort.id)
    const recalculated = await fetchTask(task.id)
    expect(recalculated.consumedHours).toBe(0)
    expect(recalculated.status).toBe('done')
  })

  test('父任务登记工时 → 42202；closed 任务登记 → 42202', async () => {
    const parent = await submitTask(5, { title: '父任务' })
    await submitTask(5, { title: '子任务', parentId: parent.id })
    await expectApiError(submitEffort(parent.id, { consumedHours: 1 }), 42202)
    await expectApiError(submitEffort(6, { consumedHours: 1 }), 42202)
  })
})

describe('执行 ACL（task §7）', () => {
  test('不可见执行下的任务列表 40302、详情 40302', async () => {
    const executionId = 9001
    db.projects.push({
      id: executionId,
      type: 'sprint',
      parentId: 0,
      path: `,${executionId},`,
      grade: 1,
      name: '私有执行',
      model: 'scrum',
      status: 'doing',
      priority: 1,
      beginDate: '2026-02-01',
      endDate: '2026-02-28',
      acl: 'private',
      whitelist: [],
      sort: 0,
      lockVersion: 0,
    })
    const task = await submitTask(executionId, { title: '私有任务' })

    // dev1：只读组（无 task-view 之外的码）→ 先补功能码，再断言数据权限 40302
    db.currentAccountId = 2
    db.groups.find((group) => group.id === 2)?.privCodes.push('task-view')
    await expectApiError(fetchTask(task.id), 40302)
    await expectApiError(fetchTasks(executionId, {}), 40302)
  })
})
