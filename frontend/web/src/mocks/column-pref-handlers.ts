import type { ColumnPrefItem } from '@zentao/api-client/generated/model/columnPrefItem'
import { HttpResponse, http } from 'msw'
import { currentAccount, db, UNAUTHENTICATED } from './db'

/**
 * 列设置 MSW handlers（platform「列设置」）：GET/PUT/DELETE /column-prefs/{resource} 三端点，
 * 与后端 ColumnPrefController 同形——**个人级**：键 = `${accountId}:${resource}`，只读/只写当前账号的行；
 * 未设置回 `columns: null`（前端用页面默认列），DELETE 即删行回默认。
 */

const ok = (data: unknown) => HttpResponse.json({ data })
const unauthorized = () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })
const validation = (fields: Record<string, string>) =>
  HttpResponse.json({ error: { code: 42201, message: '字段校验失败。', traceId: 'mock', fields } }, { status: 422 })

const RESOURCE = /^[a-z0-9-]{1,64}$/
const prefKey = (accountId: number, resource: string) => `${accountId}:${resource}`

/** 后端 ColumnPref.normalizeColumns 的同口径：键非空白/不重复/≤64、fixed ∈ left/right/null。 */
function normalizeColumns(input: unknown): ColumnPrefItem[] | null {
  if (!Array.isArray(input) || input.length === 0) {
    return null
  }
  const seen = new Set<string>()
  const columns: ColumnPrefItem[] = []
  for (const raw of input) {
    const item = raw as { key?: unknown; visible?: unknown; fixed?: unknown }
    const columnKey = typeof item.key === 'string' ? item.key.trim() : ''
    if (columnKey === '' || columnKey.length > 64 || seen.has(columnKey)) {
      return null
    }
    seen.add(columnKey)
    const fixed = item.fixed === 'left' || item.fixed === 'right' ? item.fixed : null
    if (item.fixed !== null && item.fixed !== undefined && item.fixed !== '' && fixed === null) {
      return null
    }
    columns.push({ key: columnKey, visible: item.visible === true, fixed })
  }
  return columns
}

/** 资源标识校验（三端点共用）：非法 → 42201 带 fields.resource。 */
function resourceOf(params: { resource?: string | readonly string[] }): { resource: string } | { failed: Response } {
  const resource = String(params.resource)
  return RESOURCE.test(resource)
    ? { resource }
    : { failed: validation({ resource: '资源标识非法：仅小写字母/数字/连字符，1–64 位。' }) }
}

export const columnPrefHandlers = [
  http.get('*/api/v1/column-prefs/:resource', ({ params }) => {
    const account = currentAccount()
    if (!account) {
      return unauthorized()
    }
    const resolved = resourceOf(params)
    if ('failed' in resolved) {
      return resolved.failed
    }
    return ok({
      resource: resolved.resource,
      columns: db.columnPrefs.get(prefKey(account.id, resolved.resource)) ?? null,
    })
  }),

  http.put('*/api/v1/column-prefs/:resource', async ({ params, request }) => {
    const account = currentAccount()
    if (!account) {
      return unauthorized()
    }
    const resolved = resourceOf(params)
    if ('failed' in resolved) {
      return resolved.failed
    }
    const body = (await request.json()) as { columns?: unknown }
    const columns = normalizeColumns(body.columns)
    if (columns === null) {
      return validation({ columns: '列项非法（键空白/重复/超长，或 fixed 枚举外值，或整表为空）。' })
    }
    db.columnPrefs.set(prefKey(account.id, resolved.resource), columns)
    return ok({ resource: resolved.resource, columns })
  }),

  http.delete('*/api/v1/column-prefs/:resource', ({ params }) => {
    const account = currentAccount()
    if (!account) {
      return unauthorized()
    }
    const resolved = resourceOf(params)
    if ('failed' in resolved) {
      return resolved.failed
    }
    db.columnPrefs.delete(prefKey(account.id, resolved.resource))
    return ok(null)
  }),
]
