import { describe, expect, test } from 'vitest'
import { type BatchCreateRow, batchCreateItems, batchCreateOutcomes } from '../model'

/** 批量创建行装配（T-11 / task §3 创建约束）：parentIndex 占位与父失败子连带提示。 */
function row(key: number, title: string, overrides: Partial<BatchCreateRow> = {}): BatchCreateRow {
  return {
    key,
    title,
    type: 'devel',
    priority: 3,
    estimateHours: null,
    assignee: null,
    deadline: '',
    child: false,
    ...overrides,
  }
}

describe('batchCreateItems', () => {
  test('空名称行不提交，child 行以「上一行」在 items 中的下标占位', () => {
    const { items, keys } = batchCreateItems([
      row(1, '顶层 A'),
      row(2, '子 A1', { child: true }),
      row(3, ''),
      row(4, '顶层 B'),
      row(5, '子 B1', { child: true }),
      row(6, '子 B2', { child: true }),
    ])
    expect(keys).toEqual([1, 2, 4, 5, 6])
    expect(items.map((item) => item.parentIndex)).toEqual([undefined, 0, undefined, 2, 3])
    expect(items[0]?.title).toBe('顶层 A')
    expect(items[3]).toMatchObject({ title: '子 B1', parentIndex: 2 })
  })

  test('父行未填名称时子行退化为顶层，不产生悬挂占位', () => {
    const { items } = batchCreateItems([row(1, '顶层'), row(2, ''), row(3, '子行', { child: true })])
    expect(items).toHaveLength(2)
    expect(items[1]?.parentIndex).toBe(0)
  })
})

describe('batchCreateOutcomes', () => {
  const rows = [row(1, '顶层 A'), row(2, '子 A1', { child: true }), row(3, '顶层 B')]

  test('父行失败 → 子行连带提示父失败，其余行按服务端逐项结果', () => {
    const outcomes = batchCreateOutcomes(rows, [
      { index: 0, ok: false, id: null, error: '42201' },
      { index: 1, ok: false, id: null, error: '42201' },
      { index: 2, ok: true, id: 66, error: null },
    ])
    expect(outcomes.get(1)).toEqual({ ok: false, id: null, error: '42201' })
    expect(outcomes.get(2)).toEqual({ ok: false, id: null, error: 'task.message.parentFailed' })
    expect(outcomes.get(3)).toEqual({ ok: true, id: 66, error: null })
  })

  test('子行自身失败但父行成功时保留服务端 error', () => {
    const outcomes = batchCreateOutcomes(rows, [
      { index: 0, ok: true, id: 60, error: null },
      { index: 1, ok: false, id: null, error: '42203' },
      { index: 2, ok: true, id: 66, error: null },
    ])
    expect(outcomes.get(2)).toEqual({ ok: false, id: null, error: '42203' })
  })
})
