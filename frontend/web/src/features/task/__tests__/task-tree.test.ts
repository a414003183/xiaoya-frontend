import type { TaskView } from '@zentao/api-client/generated/model/taskView'
import { describe, expect, test } from 'vitest'
import { TASK_META } from '../../../mocks/task-handlers'
import { buildTaskTree, isOverdue, taskProgress, visibleTaskActions } from '../model'

/** task 域纯逻辑（T-10）：parentId 树装配、进度口径、逾期派生、动作可见性。 */
function task(id: number, overrides: Partial<TaskView> = {}): TaskView {
  return {
    id,
    executionId: 5,
    projectId: 3,
    storyId: 0,
    parentId: 0,
    categoryId: 0,
    title: `任务 ${id}`,
    type: 'devel',
    priority: 3,
    status: 'wait',
    consumedHours: 0,
    isParent: false,
    notifyAccounts: [],
    createdBy: 'admin',
    createdAt: '2026-02-01T00:00:00Z',
    lockVersion: 0,
    ...overrides,
  }
}

describe('buildTaskTree', () => {
  test('按 parentId 装配一层父子，同级按 id', () => {
    const tree = buildTaskTree([
      task(3, { parentId: 1 }),
      task(1, { isParent: true }),
      task(2, { parentId: 1 }),
      task(4),
    ])
    expect(tree.map((node) => node.id)).toEqual([1, 4])
    expect(tree[0]?.children.map((node) => node.id)).toEqual([2, 3])
    expect(tree[0]?.children[0]?.children).toEqual([])
  })

  test('父任务不在可见集时提升为根', () => {
    const tree = buildTaskTree([task(9, { parentId: 99 })])
    expect(tree.map((node) => node.id)).toEqual([9])
  })
})

describe('taskProgress', () => {
  test('进度 = consumed ÷ (consumed + left)', () => {
    expect(taskProgress(task(1, { consumedHours: 4, leftHours: 12 }))).toBe(25)
    expect(taskProgress(task(1, { consumedHours: 6, leftHours: 0 }))).toBe(100)
    expect(taskProgress(task(1, { consumedHours: 0, leftHours: null }))).toBe(0)
  })
})

describe('isOverdue', () => {
  test('仅 wait/doing/pause 且 deadline 早于今天算逾期', () => {
    expect(isOverdue(task(1, { status: 'doing', deadline: '2026-02-10' }), '2026-09-18')).toBe(true)
    expect(isOverdue(task(1, { status: 'done', deadline: '2026-02-10' }), '2026-09-18')).toBe(false)
    expect(isOverdue(task(1, { status: 'doing', deadline: '2026-12-10' }), '2026-09-18')).toBe(false)
    expect(isOverdue(task(1, { status: 'doing', deadline: null }), '2026-09-18')).toBe(false)
  })
})

describe('visibleTaskActions', () => {
  test('父任务隐藏 start/finish，保留 pause/resume/cancel/close/activate', () => {
    const parent = visibleTaskActions(TASK_META.actions, 'doing', true).map((action) => action.action)
    expect(parent).toContain('pause')
    expect(parent).toContain('close')
    expect(parent).not.toContain('start')
    expect(parent).not.toContain('finish')

    const child = visibleTaskActions(TASK_META.actions, 'doing', false).map((action) => action.action)
    expect(child).toContain('finish')
    expect(child).not.toContain('close')
  })

  test('close 的可关闭状态仅对父任务开放（wait/doing/pause）', () => {
    expect(visibleTaskActions(TASK_META.actions, 'wait', false).map((action) => action.action)).not.toContain('close')
    expect(visibleTaskActions(TASK_META.actions, 'wait', true).map((action) => action.action)).toContain('close')
    // done 来源的关闭对所有任务开放（closedReason 由服务端按来源回填）
    expect(visibleTaskActions(TASK_META.actions, 'done', false).map((action) => action.action)).toContain('close')
  })

  test('start 仅 wait 可用，finish 覆盖 wait/doing/pause', () => {
    expect(visibleTaskActions(TASK_META.actions, 'wait', false).map((action) => action.action)).toEqual(
      expect.arrayContaining(['start', 'finish', 'cancel', 'assign', 'edit']),
    )
    expect(visibleTaskActions(TASK_META.actions, 'doing', false).map((action) => action.action)).not.toContain('start')
    expect(visibleTaskActions(TASK_META.actions, 'closed', false).map((action) => action.action)).toEqual([
      'activate',
      'edit',
    ])
  })
})
