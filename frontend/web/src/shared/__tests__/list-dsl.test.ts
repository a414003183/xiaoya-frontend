import type { ListExecutionTasksParams } from '@zentao/api-client/generated/model/listExecutionTasksParams'
import { describe, expect, test } from 'vitest'
import { buildListParams } from '../list-dsl'

/** A6-1：列表 DSL 构造口的运行期行为 + 契约过滤键的编译期约束。 */

describe('buildListParams', () => {
  test('page/limit/sort/q 透传，空串 sort/q 丢弃', () => {
    expect(buildListParams<ListExecutionTasksParams>({ page: 2, limit: 20, sort: '-id', q: '登录' })).toEqual({
      page: 2,
      limit: 20,
      sort: '-id',
      q: '登录',
    })
    expect(buildListParams<ListExecutionTasksParams>({ sort: '', q: '' })).toEqual({})
  })

  test('filters 折叠为 filters[x]：数组逗号 IN、数字转字符串、空值丢弃', () => {
    expect(
      buildListParams<ListExecutionTasksParams>({
        filters: {
          status: 'doing',
          type: 'devel',
          id: ['1', '2', '3'],
          priority: 2,
          assignee: '',
          deadline: undefined,
        },
      }),
    ).toEqual({
      'filters[status]': 'doing',
      'filters[type]': 'devel',
      'filters[id]': '1,2,3',
      'filters[priority]': '2',
    })
  })

  test('filters 键受契约约束（P 未声明的键编译期拒绝）', () => {
    // @ts-expect-error listExecutionTasks 契约没有 filters[unknownKey]
    expect(buildListParams<ListExecutionTasksParams>({ filters: { unknownKey: 'x' } })).toEqual({
      'filters[unknownKey]': 'x',
    })
  })
})
