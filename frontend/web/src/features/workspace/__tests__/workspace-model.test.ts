import type { TodoView } from '@zentao/api-client/generated/model/todoView'
import { describe, expect, test } from 'vitest'
import {
  activityDateKey,
  groupActivitiesByDate,
  MY_ROLES,
  metaFieldLabel,
  metaFieldMaxLength,
  mondayOf,
  myRoleKey,
  normalizeDateTab,
  normalizeMyRole,
  todoBatchItems,
  todoBatchOutcomes,
  todoCreateBody,
  todoDateFilter,
  todoDisplayTitle,
  todoObjectRequired,
  todoObjectScope,
  todoPatchBody,
  todoPriorityKey,
  todoStatusKey,
  todoStatusTone,
  todoTypeKey,
} from '../model'

/** workspace 域纯逻辑：日期页签区间、role 映射、objectTitle 兜底、批量行装配与逐项结果对齐。 */

function todo(overrides: Partial<TodoView> = {}): TodoView {
  return {
    id: 1,
    title: '整理验收材料',
    type: 'custom',
    objectId: 0,
    objectTitle: null,
    date: '2026-09-18',
    beginTime: null,
    endTime: null,
    priority: 3,
    description: null,
    status: 'wait',
    isPrivate: false,
    assignee: 'admin',
    assignedBy: null,
    assignedAt: null,
    finishedBy: null,
    finishedAt: null,
    closedBy: null,
    closedAt: null,
    createdBy: 'admin',
    createdAt: '2026-09-18T01:00:00Z',
    updatedBy: null,
    updatedAt: null,
    lockVersion: 0,
    ...overrides,
  }
}

describe('日期页签 → filters[date]', () => {
  test('今天 = 单值；本周 = 周一..周日闭区间', () => {
    // 2026-09-18 是周五，所在周为 2026-09-14(一)..2026-09-20(日)
    expect(todoDateFilter('today', '2026-09-18')).toBe('2026-09-18')
    expect(todoDateFilter('week', '2026-09-18')).toBe('2026-09-14..2026-09-20')
    expect(todoDateFilter('undated', '2026-09-18')).toBe('@null')
    expect(todoDateFilter('all', '2026-09-18')).toBeUndefined()
  })

  test('周日归上一周；周一天然对齐', () => {
    expect(mondayOf('2026-09-20')).toBe('2026-09-14')
    expect(mondayOf('2026-09-14')).toBe('2026-09-14')
    expect(todoDateFilter('week', '2026-09-20')).toBe('2026-09-14..2026-09-20')
    // 跨年周：2027-01-01 是周五，所在周周一落在 2026-12-28
    expect(todoDateFilter('week', '2027-01-01')).toBe('2026-12-28..2027-01-03')
  })

  test('URL 页签非法值回落今天', () => {
    expect(normalizeDateTab(null)).toBe('today')
    expect(normalizeDateTab('week')).toBe('week')
    expect(normalizeDateTab('yesterday')).toBe('today')
  })
})

describe('todo 展示与文案派生', () => {
  test('title 为空时以现算 objectTitle 兜底', () => {
    expect(todoDisplayTitle(todo({ title: '写日报' }))).toBe('写日报')
    expect(todoDisplayTitle(todo({ title: '   ', type: 'bug', objectId: 7, objectTitle: '登录页报错' }))).toBe(
      '登录页报错',
    )
    expect(todoDisplayTitle(todo({ title: '', objectTitle: null }))).toBe('')
  })

  test('状态/优先级/类型 key，优先级越界回落 3', () => {
    expect(todoStatusKey('doing')).toBe('todo.status.doing')
    expect(todoStatusKey('unknown')).toBe('todo.status.wait')
    expect(todoStatusTone('wait')).toBe('pending')
    expect(todoStatusTone('doing')).toBe('active')
    expect(todoStatusTone('closed')).toBe('closed')
    expect(todoPriorityKey(1)).toBe('common.priority.1')
    expect(todoPriorityKey(9)).toBe('common.priority.3')
    expect(todoPriorityKey(null)).toBe('common.priority.3')
    expect(todoTypeKey('testRun')).toBe('todo.type.testRun')
  })

  test('关联对象必填/搜索 scope 仅覆盖已注册类型', () => {
    expect(todoObjectRequired('custom')).toBe(false)
    expect(todoObjectRequired('bug')).toBe(true)
    expect(todoObjectScope('task')).toBe('task')
    expect(todoObjectScope('testRun')).toBeNull()
  })

  test('meta 字段标签与长度来自 /meta/todo，缺字段时回落本域默认', () => {
    const fields = [
      { key: 'title', type: 'text', required: true, maxLength: 150, i18n: 'todo.field.title' },
      { key: 'beginTime', type: 'text', maxLength: 5, i18n: 'todo.field.begin' },
    ]
    expect(metaFieldLabel(fields, 'title', 'fallback')).toBe('todo.field.title')
    expect(metaFieldLabel(fields, 'date', 'todo.field.date')).toBe('todo.field.date')
    expect(metaFieldMaxLength(fields, 'title', 99)).toBe(150)
    expect(metaFieldMaxLength(fields, 'date', 10)).toBe(10)
  })
})

describe('创建/编辑请求体装配', () => {
  test('创建：日期留空 = 待定，objectId 仅非 custom 下发', () => {
    const body = todoCreateBody({
      title: '  写周报 ',
      type: 'custom',
      objectId: 7,
      date: '',
      beginTime: '',
      endTime: '',
      priority: 2,
      description: '',
      isPrivate: false,
      assignee: 'admin',
    })
    expect(body).toMatchObject({ title: '写周报', type: 'custom', date: null, beginTime: null, endTime: null })
    expect(body).not.toHaveProperty('objectId')

    const linked = todoCreateBody({
      title: '修复 Bug',
      type: 'bug',
      objectId: 12,
      date: '2026-09-18',
      beginTime: '09:00',
      endTime: '10:00',
      priority: 1,
      description: 'd',
      isPrivate: true,
      assignee: 'dev1',
    })
    expect(linked).toMatchObject({ objectId: 12, date: '2026-09-18', beginTime: '09:00', endTime: '10:00' })
  })

  test('编辑：只提交改动键 + lockVersion；转 custom 解绑对象', () => {
    const current = todo({ lockVersion: 3, title: '写日报', priority: 2 })
    expect(
      todoPatchBody(current, {
        title: '写日报',
        type: 'custom',
        objectId: null,
        date: '2026-09-18',
        beginTime: '',
        endTime: '',
        priority: 2,
        description: '',
        isPrivate: false,
      }),
    ).toEqual({ lockVersion: 3 })

    const changed = todoPatchBody(current, {
      title: '写日报（改）',
      type: 'custom',
      objectId: null,
      date: '2026-09-19',
      beginTime: '08:00',
      endTime: '',
      priority: 4,
      description: '',
      isPrivate: true,
    })
    expect(changed).toEqual({
      lockVersion: 3,
      title: '写日报（改）',
      date: '2026-09-19',
      beginTime: '08:00',
      priority: 4,
      isPrivate: true,
    })

    const unbind = todoPatchBody(todo({ type: 'bug', objectId: 7, lockVersion: 1 }), {
      title: '整理验收材料',
      type: 'custom',
      objectId: null,
      date: '2026-09-18',
      beginTime: '',
      endTime: '',
      priority: 3,
      description: '',
      isPrivate: false,
    })
    expect(unbind).toMatchObject({ type: 'custom', objectId: 0 })
  })
})

describe('我的地盘 role 映射', () => {
  test('三类列表的 role 白名单与页签 key', () => {
    expect(MY_ROLES.tasks).toEqual(['assignee', 'creator', 'finisher', 'closer'])
    expect(MY_ROLES.bugs).toEqual(['assignee', 'creator', 'resolver', 'closer'])
    expect(MY_ROLES.stories).toEqual(['assignee', 'creator', 'reviewer', 'closer'])
    expect(myRoleKey('tasks', 'finisher')).toBe('my.role.tasks.finisher')
    expect(myRoleKey('bugs', 'resolver')).toBe('my.role.bugs.resolver')
    expect(myRoleKey('stories', 'reviewer')).toBe('my.role.stories.reviewer')
  })

  test('非法 role 回落 assignee（不下发非法值给 40001）', () => {
    expect(normalizeMyRole('tasks', null)).toBe('assignee')
    expect(normalizeMyRole('tasks', 'finisher')).toBe('finisher')
    expect(normalizeMyRole('tasks', 'resolver')).toBe('assignee')
    expect(normalizeMyRole('bugs', 'resolver')).toBe('resolver')
  })
})

describe('动态按日期分组', () => {
  test('同日相邻条目合并，跨日新开组，保持原有倒序', () => {
    // 用 UTC 正午时间戳，任何时区都落在同一自然日，避免测试受 TZ 影响
    const groups = groupActivitiesByDate([
      { id: 3, occurredAt: '2026-09-18T12:00:00Z' },
      { id: 2, occurredAt: '2026-09-18T11:00:00Z' },
      { id: 1, occurredAt: '2026-09-17T12:00:00Z' },
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]?.date).toBe(activityDateKey('2026-09-18T12:00:00Z'))
    expect(groups[1]?.date).toBe(activityDateKey('2026-09-17T12:00:00Z'))
    expect(groups[0]?.date).not.toBe(groups[1]?.date)
    expect(groups[0]?.items.map((item) => item.id)).toEqual([3, 2])
    expect(groups[1]?.items.map((item) => item.id)).toEqual([1])
  })

  test('非法时间串回落到前 10 位', () => {
    expect(activityDateKey('not-a-date')).toBe('not-a-date')
  })
})

describe('批量创建行装配', () => {
  test('丢弃空标题行，objectId 仅非 custom 下发，日期/指派空值不下发', () => {
    const { items, keys } = todoBatchItems([
      {
        key: 1,
        title: ' A ',
        type: 'custom',
        objectId: 9,
        date: '2026-09-18',
        beginTime: '',
        endTime: '',
        priority: 3,
        assignee: null,
      },
      {
        key: 2,
        title: '   ',
        type: 'custom',
        objectId: null,
        date: '',
        beginTime: '',
        endTime: '',
        priority: 3,
        assignee: null,
      },
      {
        key: 3,
        title: 'B',
        type: 'bug',
        objectId: 4,
        date: '',
        beginTime: '09:00',
        endTime: '',
        priority: 2,
        assignee: 'dev1',
      },
    ])
    expect(keys).toEqual([1, 3])
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ title: 'A', type: 'custom', date: '2026-09-18' })
    expect(items[0]).not.toHaveProperty('objectId')
    expect(items[1]).toMatchObject({ title: 'B', objectId: 4, beginTime: '09:00', priority: 2, assignee: 'dev1' })
    expect(items[1]).not.toHaveProperty('date')
  })

  test('逐项结果按已提交行下标对齐；未返回的项按失败计', () => {
    const rows = [
      {
        key: 11,
        title: 'A',
        type: 'custom',
        objectId: null,
        date: '',
        beginTime: '',
        endTime: '',
        priority: 3,
        assignee: null,
      },
      {
        key: 12,
        title: 'B',
        type: 'custom',
        objectId: null,
        date: '',
        beginTime: '',
        endTime: '',
        priority: 3,
        assignee: null,
      },
    ]
    const outcomes = todoBatchOutcomes(rows, [{ index: 0, ok: true, id: 88, error: null }])
    expect(outcomes.get(11)).toEqual({ ok: true, id: 88, error: null })
    expect(outcomes.get(12)).toEqual({ ok: false, id: null, error: 'todo.message.batchFailed' })
  })
})
