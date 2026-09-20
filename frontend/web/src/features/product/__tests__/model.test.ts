import type { CategoryView } from '@zentao/api-client/generated/model/categoryView'
import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import { describe, expect, test } from 'vitest'
import {
  buildCategoryTree,
  buildsOfBranch,
  buildTrackMatrix,
  commaFilter,
  groupByStatus,
  parentPlanOptions,
  pickChangedFields,
  statusTone,
} from '../model'

const story = (id: number, overrides: Partial<StoryView> = {}): StoryView => ({
  id,
  productId: 1,
  title: `story-${id}`,
  type: 'story',
  status: 'active',
  priority: 3,
  stage: 'wait',
  version: 1,
  lockVersion: 0,
  ...overrides,
})

const category = (id: number, parentId: number, sort = 0, type: CategoryView['type'] = 'story'): CategoryView => ({
  id,
  productId: 1,
  parentId,
  type,
  name: `category-${id}`,
  sort,
  lockVersion: 0,
})

describe('statusTone', () => {
  test('覆盖产品域状态并回退 neutral', () => {
    expect(statusTone('normal')).toBe('active')
    expect(statusTone('doing')).toBe('active')
    expect(statusTone('wait')).toBe('pending')
    expect(statusTone('done')).toBe('closed')
    expect(statusTone('terminated')).toBe('error')
    expect(statusTone('unknown-status')).toBe('neutral')
  })
})

describe('groupByStatus', () => {
  test('按给定状态序分列且列内保序', () => {
    const groups = groupByStatus(
      [{ status: 'closed' }, { status: 'normal' }, { status: 'normal' }],
      ['normal', 'closed'],
    )
    expect(groups.map((group) => group.status)).toEqual(['normal', 'closed'])
    expect(groups[0]?.items).toHaveLength(2)
    expect(groups[1]?.items).toHaveLength(1)
  })
})

describe('buildTrackMatrix', () => {
  test('cell 由发布 storyIds 决定，行序与需求一致', () => {
    const matrix = buildTrackMatrix(
      [story(1), story(2), story(3)],
      [
        { id: 11, storyIds: [1, 3] },
        { id: 12, storyIds: [] },
      ],
    )
    expect(matrix.releaseIds).toEqual([11, 12])
    expect(matrix.rows.map((row) => row.storyId)).toEqual([1, 2, 3])
    expect(matrix.rows[0]?.cells).toEqual([true, false])
    expect(matrix.rows[1]?.cells).toEqual([false, false])
    expect(matrix.rows[2]?.cells).toEqual([true, false])
  })

  test('release.storyIds 缺省按空数组处理', () => {
    const matrix = buildTrackMatrix([story(1)], [{ id: 11 }])
    expect(matrix.rows[0]?.cells).toEqual([false])
  })
})

describe('parentPlanOptions', () => {
  test('仅同产品一级计划，排除自身与已关闭', () => {
    const plans = [
      { id: 1, parentId: 0, status: 'wait' },
      { id: 2, parentId: 1, status: 'doing' },
      { id: 3, parentId: 0, status: 'closed' },
      { id: 4, parentId: 0, status: 'doing' },
    ]
    expect(parentPlanOptions(plans, 1).map((plan) => plan.id)).toEqual([4])
    expect(parentPlanOptions(plans).map((plan) => plan.id)).toEqual([1, 4])
  })
})

describe('buildsOfBranch', () => {
  test('按分支联动过滤构建，branchId 缺省视为 0', () => {
    expect(buildsOfBranch([{ branchId: 1 }, { branchId: 2 }, {}], 1)).toHaveLength(1)
    expect(buildsOfBranch([{ branchId: 1 }, {}], 0)).toHaveLength(1)
  })
})

describe('buildCategoryTree', () => {
  test('按 parentId 建树并按 sort/id 排序', () => {
    const tree = buildCategoryTree([category(2, 1, 2), category(1, 0, 1), category(3, 0, 0), category(4, 1, 1)])
    expect(tree.map((node) => node.id)).toEqual([3, 1])
    expect(tree[1]?.children.map((node) => node.id)).toEqual([4, 2])
  })

  test('同 type 之外的节点不混入（调用方已按 type 过滤）', () => {
    const tree = buildCategoryTree([category(1, 0, 0, 'bug')])
    expect(tree.map((node) => node.type)).toEqual(['bug'])
  })
})

describe('pickChangedFields', () => {
  test('只挑与原始值不同的字段', () => {
    const original = { name: 'a', sort: 0, acl: 'public' }
    expect(pickChangedFields(original, { name: 'b', sort: 0 }, ['name', 'sort', 'acl'])).toEqual({ name: 'b' })
  })

  test('未提供的字段不进入补丁', () => {
    const original = { name: 'a', sort: 0 }
    expect(pickChangedFields(original, { sort: 1 }, ['name', 'sort'])).toEqual({ sort: 1 })
  })
})

describe('commaFilter', () => {
  test('逗号折叠', () => {
    expect(commaFilter(['wait', 'doing'])).toBe('wait,doing')
  })
})
