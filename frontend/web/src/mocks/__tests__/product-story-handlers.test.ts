import { ApiError } from '@zentao/api-client'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import {
  closePlanAction,
  fetchProduct,
  fetchProducts,
  fetchReleaseStories,
  finishPlanAction,
  linkPlanAction,
  startPlanAction,
  submitPlan,
  submitRelease,
} from '../../features/product/api/product.api'
import {
  activateStoryAction,
  assignStoryAction,
  changeDoneStoryAction,
  changeStoryAction,
  closeStoryAction,
  fetchStories,
  fetchStory,
  fetchStoryActivities,
  passStoryAction,
  rejectStoryAction,
  submitReviewAction,
  submitStory,
} from '../../features/story/api/story.api'
import { db, resetMockData } from '../db'
import { handlers } from '../handlers'

/**
 * product/requirement handler 契约测试（T-3/T-5/T-7/T-10 验收的「MSW 下闭环可走」）：
 * 状态机守卫、ACL 与发布副作用必须与领域卡一致。
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

describe('需求闭环（requirement §4）', () => {
  test('创建 → 提交评审 → pass → change → change-done → close → activate → assign', async () => {
    const created = await submitStory(1, { title: '闭环需求', reviewers: ['admin'], priority: 3 })
    expect(created.status).toBe('draft')

    const reviewing = await submitReviewAction(created.id, { reviewers: ['admin'], comment: '提审' })
    expect(reviewing.status).toBe('reviewing')

    const passed = await passStoryAction(created.id, '通过')
    expect(passed.status).toBe('active')

    const changing = await changeStoryAction(created.id)
    expect(changing.status).toBe('changing')

    const changed = await changeDoneStoryAction(created.id, {
      title: '闭环需求（改）',
      lockVersion: changing.lockVersion,
    })
    expect(changed.status).toBe('changed')

    const closed = await closeStoryAction(created.id, { closedReason: 'duplicate', duplicateOfId: 1 })
    expect(closed.status).toBe('closed')
    expect(closed.closedReason).toBe('duplicate')

    const activated = await activateStoryAction(created.id, '重开')
    expect(activated.status).toBe('active')

    const assigned = await assignStoryAction(created.id, { assignee: 'dev1' })
    expect(assigned.assignee).toBe('dev1')
    expect(assigned.assignedAt).not.toBeNull()

    const activities = await fetchStoryActivities(created.id)
    expect(activities.items.map((item) => item.action)).toEqual(
      expect.arrayContaining([
        'created',
        'submitted',
        'passed',
        'changed',
        'changeDone',
        'closed',
        'activated',
        'assigned',
      ]),
    )
  })

  test('提交评审的双分支：needNotReview=true 直达 active', async () => {
    const created = await submitStory(1, { title: '免评审需求', needNotReview: true })
    const story = await submitReviewAction(created.id, { comment: null })
    expect(story.status).toBe('active')
  })

  test('守卫：非法迁移 42202、reject 缺 comment 42201、close(duplicate) 缺 duplicateOfId 42201', async () => {
    const created = await submitStory(1, { title: '守卫需求', reviewers: ['admin'] })
    await expectApiError(closeStoryAction(created.id, { closedReason: 'done' }), 42202)
    await submitReviewAction(created.id, { reviewers: ['admin'], comment: null })
    await expectApiError(rejectStoryAction(created.id, ''), 42201)
    await passStoryAction(created.id)
    await expectApiError(closeStoryAction(created.id, { closedReason: 'duplicate' }), 42201)
    await expectApiError(submitReviewAction(created.id, { comment: null }), 42202)
  })

  test('优先级越界 → 42201，详情不存在 → 40401', async () => {
    await expectApiError(submitStory(1, { title: '越界', priority: 9 }), 42201)
    await expectApiError(fetchStory(999999), 40401)
  })
})

describe('计划动作与关联（product §4.3）', () => {
  test('start/finish 迁移，link 幂等', async () => {
    const plan = await submitPlan(1, { title: '闭环计划', beginDate: '2026-09-01' })
    expect(plan.status).toBe('wait')
    const doing = await startPlanAction(plan.id)
    expect(doing.status).toBe('doing')

    await linkPlanAction(plan.id, 'story', [8, 8])
    await linkPlanAction(plan.id, 'story', [8])
    const linked = await fetchStories(1, { filters: { planId: String(plan.id) } })
    expect(linked.items.map((story) => story.id)).toEqual([8])

    const finished = await finishPlanAction(plan.id)
    expect(finished.status).toBe('done')
    expect(finished.finishedAt).not.toBeNull()
  })

  test('closed 计划 link → 42202', async () => {
    const plan = await submitPlan(1, { title: '关闭后不可关联' })
    await closePlanAction(plan.id, 'cancel', '取消')
    await expectApiError(linkPlanAction(plan.id, 'story', [1]), 42202)
  })
})

describe('发布创建副作用（product §4.4）', () => {
  test('storyIds → stage=released + 需求侧 linked2release 动态流', async () => {
    const release = await submitRelease(1, { name: 'V2.0', releaseDate: '2026-12-01', storyIds: [2] })
    const stories = await fetchReleaseStories(release.id)
    expect(stories.items.map((story) => story.id)).toEqual([2])
    const story = await fetchStory(2)
    expect(story.stage).toBe('released')
    const activities = await fetchStoryActivities(2)
    expect(activities.items.some((item) => item.action === 'linked2release')).toBe(true)
  })
})

describe('产品 ACL（product §7）', () => {
  test('custom 白名单外不可见（列表过滤 + 详情 40302），超管全见', async () => {
    const product = db.products.find((item) => item.id === 1)
    if (product) {
      product.acl = 'custom'
      product.whitelist = []
    }
    const group = db.groups.find((item) => item.id === 2)
    group?.privCodes.push('product-view')

    db.currentAccountId = 2 // dev1：有 product-view 但不在白名单
    const visible = await fetchProducts({ limit: 200 })
    expect(visible.items.map((item) => item.id)).toEqual([2, 3])
    await expectApiError(fetchProduct(1), 40302)

    db.currentAccountId = 1
    expect((await fetchProduct(1)).id).toBe(1)
  })
})
