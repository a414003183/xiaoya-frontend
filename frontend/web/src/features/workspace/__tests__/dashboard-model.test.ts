import { describe, expect, test } from 'vitest'
import {
  DASHBOARD_WIDGETS,
  type DashboardLayoutItem,
  type DashboardWidgetKind,
  defaultDashboardLayout,
  isDashboardLayout,
  isDefaultDashboardLayout,
  parseDashboardLayout,
  patchDashboardLayout,
  reorderDashboardLayout,
  visibleDashboardLayout,
} from '../model'

/** 地盘布局纯逻辑（§3.5）：目录、损坏回退、换序/显隐/尺寸。 */

describe('widget 目录与缺省布局（§3.5）', () => {
  test('六种 widget 固定目录，summary 通栏居首', () => {
    expect(DASHBOARD_WIDGETS.map((entry) => entry.widget)).toEqual([
      'summary',
      'myTodos',
      'myTasks',
      'myBugs',
      'myStories',
      'myActivities',
    ])
    expect(DASHBOARD_WIDGETS[0]?.size).toBe('full')
  })

  test('缺省布局 = 全部可见、order 1..6、summary/myActivities 通栏', () => {
    const layout = defaultDashboardLayout()
    expect(layout).toHaveLength(6)
    expect(layout.map((item) => item.order)).toEqual([1, 2, 3, 4, 5, 6])
    expect(layout.every((item) => item.visible)).toBe(true)
    expect(layout.find((item) => item.widget === 'summary')?.size).toBe('full')
    expect(layout.find((item) => item.widget === 'myActivities')?.size).toBe('full')
    expect(layout.find((item) => item.widget === 'myTasks')?.size).toBe('half')
    expect(isDefaultDashboardLayout(layout)).toBe(true)
  })
})

describe('布局解析与损坏回退（§3.5）', () => {
  const valid: DashboardLayoutItem[] = [
    { widget: 'myBugs', visible: false, order: 1, size: 'half' },
    { widget: 'summary', visible: true, order: 2, size: 'full' },
    { widget: 'myTodos', visible: true, order: 3, size: 'half' },
    { widget: 'myTasks', visible: true, order: 4, size: 'half' },
    { widget: 'myStories', visible: true, order: 5, size: 'half' },
    { widget: 'myActivities', visible: true, order: 6, size: 'full' },
  ]

  test('合法值按 order 升序并重编号', () => {
    const parsed = parseDashboardLayout(valid)
    expect(parsed.map((item) => item.widget)).toEqual([
      'myBugs',
      'summary',
      'myTodos',
      'myTasks',
      'myStories',
      'myActivities',
    ])
    expect(parsed.map((item) => item.order)).toEqual([1, 2, 3, 4, 5, 6])
    expect(parsed[0]?.visible).toBe(false)
  })

  test('JSON 字符串值可直接解析（setting 值可能是序列化文本）', () => {
    expect(parseDashboardLayout(JSON.stringify(valid)).map((item) => item.widget)).toEqual(valid.map((i) => i.widget))
  })

  test('损坏值一律回退缺省布局', () => {
    const cases: unknown[] = [
      '{not json',
      null,
      undefined,
      [],
      valid.slice(0, 5),
      [...valid.slice(0, 5), { widget: 'unknownWidget', visible: true, order: 6, size: 'half' }],
      [...valid.slice(0, 5), { widget: 'summary', visible: true, order: 6, size: 'half' }], // 重复 widget 名
      [...valid.slice(0, 5), { widget: 'myActivities', visible: 'yes', order: 6, size: 'half' }],
      [...valid.slice(0, 5), { widget: 'myActivities', visible: true, order: 6, size: 'wide' }],
      [...valid.slice(0, 5), { widget: 'myActivities', visible: true, order: '6', size: 'half' }],
    ]
    for (const value of cases) {
      expect(parseDashboardLayout(value).map((item) => item.widget)).toEqual(
        defaultDashboardLayout().map((item) => item.widget),
      )
      expect(isDashboardLayout(value)).toBe(false)
    }
    expect(isDashboardLayout(valid)).toBe(true)
  })
})

describe('换序 / 显隐 / 尺寸', () => {
  const layout = defaultDashboardLayout()

  test('拖拽换序：跨越隐藏项仍在序列中并重编号', () => {
    const hidden = patchDashboardLayout(layout, 'myTasks', { visible: false })
    const reordered = reorderDashboardLayout(hidden, 'myActivities', 'myTodos')
    expect(reordered.map((item) => item.widget)).toEqual([
      'summary',
      'myActivities',
      'myTodos',
      'myTasks',
      'myBugs',
      'myStories',
    ])
    expect(reordered.map((item) => item.order)).toEqual([1, 2, 3, 4, 5, 6])
    expect(reordered.find((item) => item.widget === 'myTasks')?.visible).toBe(false)
  })

  test('未知/相同 widget 换序不改动（返回副本）', () => {
    expect(reorderDashboardLayout(layout, 'summary', 'summary')).toEqual(layout)
    // 白名单外的运行时输入：类型收窄到目录联合后仍须被守卫拒绝（URL 解析已过滤，函数自身兜底）
    expect(reorderDashboardLayout(layout, 'nope' as DashboardWidgetKind, 'summary')).toEqual(layout)
  })

  test('显隐与半栏/通栏单项改写不影响其他项', () => {
    const patched = patchDashboardLayout(layout, 'summary', { size: 'half' })
    expect(patched.find((item) => item.widget === 'summary')?.size).toBe('half')
    expect(patched.find((item) => item.widget === 'myTodos')).toEqual(layout.find((i) => i.widget === 'myTodos'))
    expect(isDefaultDashboardLayout(patched)).toBe(false)
  })

  test('visibleDashboardLayout 仅保留可见项且按 order 升序', () => {
    const hidden = patchDashboardLayout(patchDashboardLayout(layout, 'summary', { visible: false }), 'myBugs', {
      visible: false,
    })
    expect(visibleDashboardLayout(hidden).map((item) => item.widget)).toEqual([
      'myTodos',
      'myTasks',
      'myStories',
      'myActivities',
    ])
  })
})
