import type { DocCategoryNode } from '@zentao/api-client/generated/model/docCategoryNode'
import type { DocView } from '@zentao/api-client/generated/model/docView'
import { describe, expect, test } from 'vitest'
import {
  buildDocTree,
  docAclKey,
  docActionPerm,
  docCountByCategory,
  docExcerpt,
  docSpaceAclKey,
  docSpaceTypeKey,
  docStatusKey,
  docStatusTone,
  docTypeKey,
  flattenCategories,
  metaFieldLabel,
  myDocFilters,
  showDraftBadge,
} from '../model'

/** doc 域纯逻辑测试（T-4/T-5）：章节树、目录分组、hasDraft 徽标、文案 key 与动作权限映射。 */

function doc(partial: Partial<DocView> & { id: number }): DocView {
  return {
    docSpaceId: 1,
    productId: 0,
    projectId: 0,
    executionId: 0,
    categoryId: 0,
    parentId: 0,
    path: `,${partial.id},`,
    title: `doc ${partial.id}`,
    type: 'markdown',
    status: 'draft',
    acl: 'open',
    editors: { accounts: [], groupIds: [] },
    readers: { accounts: [], groupIds: [] },
    notifyAccounts: [],
    views: 0,
    version: 0,
    hasDraft: false,
    sort: 0,
    createdBy: 'admin',
    createdAt: '2026-09-01T00:00:00Z',
    lockVersion: 0,
    ...partial,
  }
}

describe('buildDocTree（§3.2 章节树）', () => {
  test('按 parentId 组树、同级 sort 再 id、父不可见时提升为根', () => {
    const tree = buildDocTree([
      doc({ id: 3, parentId: 2, sort: 0 }),
      doc({ id: 2, parentId: 1, sort: 0 }),
      doc({ id: 1, parentId: 0, sort: 5 }),
      doc({ id: 4, parentId: 99, sort: 0 }),
      doc({ id: 5, parentId: 0, sort: 0 }),
    ])
    // 根含被提升的 4（sort 0，与 5 同级按 id 在前）与 sort 5 的 1
    expect(tree.map((node) => node.id)).toEqual([4, 5, 1])
    expect(tree[2]?.children.map((node) => node.id)).toEqual([2])
    expect(tree[2]?.children[0]?.children.map((node) => node.id)).toEqual([3])
  })
})

describe('flattenCategories / docCountByCategory（§6 左目录树）', () => {
  const nodes: DocCategoryNode[] = [
    {
      id: 1,
      docSpaceId: 7,
      parentId: 0,
      name: '设计',
      sort: 0,
      children: [{ id: 2, docSpaceId: 7, parentId: 1, name: '前端', sort: 0, children: [] }],
    },
    { id: 3, docSpaceId: 7, parentId: 0, name: '接口', sort: 1, children: [] },
  ]

  test('嵌套目录树 → 带层级平铺', () => {
    expect(flattenCategories(nodes)).toEqual([
      { id: 1, name: '设计', depth: 0 },
      { id: 2, name: '前端', depth: 1 },
      { id: 3, name: '接口', depth: 0 },
    ])
  })

  test('按 categoryId 计数（0 = 未分类）', () => {
    const counts = docCountByCategory([doc({ id: 1, categoryId: 2 }), doc({ id: 2 }), doc({ id: 3, categoryId: 2 })])
    expect(counts.get(2)).toBe(2)
    expect(counts.get(0)).toBe(1)
    expect(counts.get(9)).toBeUndefined()
  })
})

describe('showDraftBadge（§3.2 派生 hasDraft）', () => {
  test('仅「已发布且有未发布修改」打标', () => {
    expect(showDraftBadge({ status: 'published', hasDraft: true })).toBe(true)
    expect(showDraftBadge({ status: 'published', hasDraft: false })).toBe(false)
    expect(showDraftBadge({ status: 'draft', hasDraft: true })).toBe(false)
  })
})

describe('myDocFilters（§6 /doc/my 三页签）', () => {
  test('我创建的 / 我编辑的 / 我的草稿', () => {
    expect(myDocFilters('created')).toEqual({ createdBy: '@me' })
    expect(myDocFilters('edited')).toEqual({ updatedBy: '@me' })
    expect(myDocFilters('draft')).toEqual({ status: 'draft', createdBy: '@me' })
  })
})

describe('文案 key 与状态色', () => {
  test('状态 tone / key 与非法值回落', () => {
    expect(docStatusTone('published')).toBe('active')
    expect(docStatusTone('draft')).toBe('pending')
    expect(docStatusTone('nope')).toBe('neutral')
    expect(docStatusKey('published')).toBe('doc.status.published')
    expect(docStatusKey('nope')).toBe('doc.status.draft')
  })

  test('type / acl / 库 type / 库 acl key 与回落', () => {
    expect(docTypeKey('html')).toBe('doc.type.html')
    expect(docTypeKey(undefined)).toBe('doc.type.markdown')
    expect(docAclKey('private')).toBe('doc.acl.private')
    expect(docAclKey('nope')).toBe('doc.acl.open')
    expect(docSpaceTypeKey('mine')).toBe('docSpace.type.mine')
    expect(docSpaceTypeKey('nope')).toBe('docSpace.type.custom')
    expect(docSpaceAclKey('default')).toBe('docSpace.acl.default')
    expect(docSpaceAclKey('nope')).toBe('docSpace.acl.open')
  })
})

describe('docExcerpt（§3.3 digest 展示）', () => {
  test('折叠空白、超长截断、空值回落空串', () => {
    expect(docExcerpt('  标题\n\n正文   续 ')).toBe('标题 正文 续')
    expect(docExcerpt('abcdef', 4)).toBe('abcd…')
    expect(docExcerpt(null)).toBe('')
  })
})

describe('docActionPerm（§5 权限码列）', () => {
  test('写动作映射到 doc-edit / doc-delete，未知动作返回 null', () => {
    expect(docActionPerm('publish')).toBe('doc-edit')
    expect(docActionPerm('save-draft')).toBe('doc-edit')
    expect(docActionPerm('move')).toBe('doc-edit')
    expect(docActionPerm('delete')).toBe('doc-delete')
    expect(docActionPerm('archive')).toBeNull()
  })
})

describe('metaFieldLabel（03 §5：字段标签与后端同源）', () => {
  const fields = [{ key: 'acl', i18n: 'docSpace.acl' }]
  // 后端 type/acl 的 field i18n 指向选项对象键，resolve 返回对象时必须回落
  const resolve = (key: string): unknown => (key === 'docSpace.acl' ? { open: '公开' } : `text:${key}`)

  test('meta i18n 命中字符串时用 meta key', () => {
    expect(metaFieldLabel([{ key: 'name', i18n: 'docSpace.field.name' }], 'name', 'docSpace.field.name', resolve)).toBe(
      'text:docSpace.field.name',
    )
  })

  test('meta i18n 解析出对象（选项组）与缺字段时回落 fallback', () => {
    expect(metaFieldLabel(fields, 'acl', 'docSpace.field.acl', resolve)).toBe('text:docSpace.field.acl')
    expect(metaFieldLabel(fields, 'sort', 'docSpace.field.sort', resolve)).toBe('text:docSpace.field.sort')
  })
})
