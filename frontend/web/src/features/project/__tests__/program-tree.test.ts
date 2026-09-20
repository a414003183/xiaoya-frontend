import type { ProjectView } from '@zentao/api-client/generated/model/projectView'
import { describe, expect, test } from 'vitest'
import { buildProjectTree } from '../model'

/** programs 平铺 + path → 树（project §2 物化路径，§6 列表页折叠树）。 */

function program(id: number, name: string, parentId: number, path: string | null, sort = 0): ProjectView {
  const segments = (path ?? '').split(',').filter((segment) => segment !== '')
  return {
    id,
    type: 'program',
    parentId,
    ...(path === null ? {} : { path }),
    grade: segments.length === 0 ? 1 : segments.length,
    name,
    status: 'wait',
    priority: 1,
    acl: 'open',
    whitelist: [],
    sort,
    lockVersion: 0,
  }
}

describe('buildProjectTree', () => {
  test('平铺 + path 装配为父子树，同级按 sort、id 排', () => {
    const tree = buildProjectTree([
      program(3, '研发线', 1, ',1,3,', 1),
      program(1, '云端产品线', 0, ',1,', 0),
      program(2, '平台线', 1, ',1,2,', 0),
    ])
    expect(tree.map((node) => node.id)).toEqual([1])
    expect(tree[0]?.children.map((node) => node.id)).toEqual([2, 3])
    expect(tree[0]?.children[1]?.name).toBe('研发线')
  })

  test('path 优先于 parentId（path 指向可见父级时按 path 归位）', () => {
    const tree = buildProjectTree([program(1, '顶级', 0, ',1,'), program(2, '子级', 0, ',1,2,')])
    expect(tree).toHaveLength(1)
    expect(tree[0]?.children.map((node) => node.id)).toEqual([2])
  })

  test('父级不在可见集（DataScope 裁剪）时提升为根', () => {
    const tree = buildProjectTree([program(9, '孤儿子集', 99, ',99,9,')])
    expect(tree.map((node) => node.id)).toEqual([9])
  })

  test('path 缺失时回退 parentId；自引用不成环', () => {
    const tree = buildProjectTree([
      program(1, '顶级', 0, null),
      program(2, '子级', 1, null),
      program(3, '自引用', 3, ',3,3,'),
    ])
    expect(tree.map((node) => node.id).sort()).toEqual([1, 3])
    expect(tree.find((node) => node.id === 1)?.children.map((node) => node.id)).toEqual([2])
    expect(tree.find((node) => node.id === 3)?.children).toEqual([])
  })

  test('空输入返回空树', () => {
    expect(buildProjectTree([])).toEqual([])
  })
})
