import type { DocCategoryNode } from '@zentao/api-client/generated/model/docCategoryNode'
import type { DocView } from '@zentao/api-client/generated/model/docView'
import type { StatusTone } from '@zentao/design-system'
import type { MetaField } from '../../shared/meta'

/** doc 域纯逻辑（01 §3.2 model.ts）：章节树组树、目录分组、hasDraft 徽标派生、状态/类型/权限文案 key。 */

export const DOC_STATUSES = ['draft', 'published'] as const
export const DOC_TYPES = ['markdown', 'html'] as const
export const DOC_ACLS = ['open', 'private'] as const
export const DOC_SPACE_TYPES = ['product', 'project', 'execution', 'custom', 'mine'] as const
export const DOC_SPACE_ACLS = ['open', 'default', 'private'] as const
/** /doc/my 页签（§6：我创建的 / 我编辑的 / 我的草稿）。 */
export const DOC_MY_TABS = ['created', 'edited', 'draft'] as const
export type DocMyTab = (typeof DOC_MY_TABS)[number]

const DOC_STATUS_TONE: Record<string, StatusTone> = { draft: 'pending', published: 'active' }

export function docStatusTone(status: string): StatusTone {
  return DOC_STATUS_TONE[status] ?? 'neutral'
}

export function docStatusKey(status: string | undefined): string {
  const value = status !== undefined && (DOC_STATUSES as readonly string[]).includes(status) ? status : 'draft'
  return `doc.status.${value}`
}

export function docTypeKey(type: string | undefined): string {
  const value = type !== undefined && (DOC_TYPES as readonly string[]).includes(type) ? type : 'markdown'
  return `doc.type.${value}`
}

export function docAclKey(acl: string | undefined): string {
  const value = acl !== undefined && (DOC_ACLS as readonly string[]).includes(acl) ? acl : 'open'
  return `doc.acl.${value}`
}

export function docSpaceTypeKey(type: string | undefined): string {
  const value = type !== undefined && (DOC_SPACE_TYPES as readonly string[]).includes(type) ? type : 'custom'
  return `docSpace.type.${value}`
}

export function docSpaceAclKey(acl: string | undefined): string {
  const value = acl !== undefined && (DOC_SPACE_ACLS as readonly string[]).includes(acl) ? acl : 'open'
  return `docSpace.acl.${value}`
}

/**
 * /doc/my 页签 → filters（doc §6 页面表数据端点）：
 * 我创建的 createdBy=@me；我编辑的 updatedBy=@me；我的草稿 status=draft + createdBy=@me。
 */
export function myDocFilters(tab: DocMyTab): Record<string, string> {
  switch (tab) {
    case 'edited':
      return { updatedBy: '@me' }
    case 'draft':
      return { status: 'draft', createdBy: '@me' }
    default:
      return { createdBy: '@me' }
  }
}

/** 「有未发布修改」徽标（§3.2 派生行 hasDraft）：已发布且 v0 与最新快照有差异才打标；未发布草稿由状态列承载。 */
export function showDraftBadge(doc: Pick<DocView, 'hasDraft' | 'status'>): boolean {
  return doc.status === 'published' && doc.hasDraft === true
}

// ── 章节树（§3.2 parentId；同级 sort 再 id） ──

export type DocNode = DocView & { children: DocNode[] }

/** 平铺文档列表 → 章节树；父不在当前可见集时提升为根（ACL 过滤后不会出现悬挂行）。 */
export function buildDocTree(items: readonly DocView[]): DocNode[] {
  const nodes = new Map<number, DocNode>(items.map((item) => [item.id, { ...item, children: [] }]))
  const roots: DocNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId > 0 ? nodes.get(node.parentId) : undefined
    if (parent && parent.id !== node.id) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  sortNodes(roots)
  return roots
}

function sortNodes(nodes: DocNode[]): void {
  nodes.sort((a, b) => a.sort - b.sort || a.id - b.id)
  for (const node of nodes) {
    sortNodes(node.children)
  }
}

// ── 目录分组（§2 doc_category + §6：左目录树，文档按 categoryId 归位） ──

export type CategoryOption = { id: number; name: string; depth: number }

/** 目录树（响应已嵌套 children）→ 带层级的平铺选项，供左树渲染。 */
export function flattenCategories(nodes: readonly DocCategoryNode[], depth = 0): CategoryOption[] {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, depth },
    ...flattenCategories(node.children ?? [], depth + 1),
  ])
}

/** 目录 → 文档数（键 0 = 未分类，§6 左树计数）。 */
export function docCountByCategory(docs: readonly DocView[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const doc of docs) {
    counts.set(doc.categoryId, (counts.get(doc.categoryId) ?? 0) + 1)
  }
  return counts
}

// ── 摘要展示（§3.3 digest / §5 列表不携带正文） ──

/** 摘要：折叠空白并按长度截断（digest 已是去标记文本；空值回落空串，调用方决定占位）。 */
export function docExcerpt(text: string | null | undefined, maxLength = 80): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > maxLength ? `${flat.slice(0, maxLength)}…` : flat
}

// ── meta 字段目录（03 §5：标签与后端同源，前端不另立一份） ──

/**
 * meta 字段标签：后端 doc/docSpace meta 把 type/acl 的 field i18n 指向选项对象键（t 返回的是对象），
 * 非字符串一律回落调用方给定 key，避免把对象当 React 子节点渲染。
 */
export function metaFieldLabel(
  fields: readonly MetaField[] | undefined,
  key: string,
  fallback: string,
  resolve: (key: string) => unknown,
): string {
  const metaKey = (fields ?? []).find((field) => field.key === key)?.i18n
  const value = metaKey === undefined ? undefined : resolve(metaKey)
  return typeof value === 'string' && value !== '' ? value : String(resolve(fallback) ?? fallback)
}

// ── 动作区（§4/§5） ──

/**
 * 动作 → 功能权限码（§5 端点表权限码列）。
 * workflow 导出的 code（doc-save-draft/doc-publish/doc-move）不在 RBAC 注册集内
 * （doc 域注册的写码只有 doc-edit/doc-delete），照 code 过滤会把按钮对所有人隐藏，故按端点权限码映射。
 */
const DOC_ACTION_PERM: Record<string, string> = {
  'save-draft': 'doc-edit',
  publish: 'doc-edit',
  move: 'doc-edit',
  delete: 'doc-delete',
}

export function docActionPerm(action: string): string | null {
  return DOC_ACTION_PERM[action] ?? null
}
