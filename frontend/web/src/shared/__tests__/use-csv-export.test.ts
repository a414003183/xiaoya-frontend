import { ApiError } from '@zentao/api-client'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { csvFilename, csvQuery, exportCsv } from '../use-csv-export'

/** A-04：参数拼装 / 文件名 / blob 下载 / 错误信封归一（mock fetch，不出网）。 */

let clicked: HTMLAnchorElement | null = null
const createObjectURL = vi.fn(() => 'blob:mock')
const revokeObjectURL = vi.fn()
const fetchMock = vi.fn()

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function mockClick(this: HTMLAnchorElement) {
    clicked = this
  })
  vi.stubGlobal('fetch', fetchMock)
})

beforeEach(() => {
  fetchMock.mockReset()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  clicked = null
})

describe('csvQuery', () => {
  test('保留 filters/q/sort，丢弃空值与 page/limit', () => {
    const query = csvQuery({ page: 2, limit: 20, q: 'web', sort: '-id', filters: { status: '', type: 'story' } })
    // 键序无语义，按排序后比对
    expect([...query.keys()].sort().join(',')).toBe('filters[type],q,sort')
    expect(query.get('q')).toBe('web')
    expect(query.get('sort')).toBe('-id')
    expect(query.get('filters[type]')).toBe('story')
  })

  test('无过滤即空参数（全量导出）', () => {
    expect(csvQuery({}).toString()).toBe('')
  })
})

describe('csvFilename', () => {
  test('export-<resource>-<yyyymmdd-HHMM>.csv', () => {
    expect(csvFilename('products', new Date(2026, 8, 19, 10, 5))).toBe('export-products-20260919-1005.csv')
  })
})

describe('exportCsv', () => {
  // 08 B1-5：资源路径不含基址（属主域 api 提供），基址与 CSRF 头由本函数统一注入
  test('拼 format=csv&limit=5000 与当前过滤，blob 下载并回收', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('id,title\n1,x', { status: 200, headers: { 'Content-Type': 'text/csv' } }),
    )
    await exportCsv('/products', csvQuery({ q: 'web', filters: { status: 'active' } }), 'products')

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/products?format=csv&limit=5000&q=web&filters%5Bstatus%5D=active', {
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'fetch' },
    })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clicked?.download).toMatch(/^export-products-\d{8}-\d{4}\.csv$/)
    expect(clicked?.href).toContain('blob:mock')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  test('业务错误（错误信封）归一 ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 40001, message: '导出超过上限 5000 行。' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const thrown = await exportCsv('/todos', new URLSearchParams(), 'todos').catch((error) => error)
    expect(thrown).toBeInstanceOf(ApiError)
    expect((thrown as ApiError).code).toBe(40001)
    expect((thrown as ApiError).message).toContain('5000')
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  // 08 B1-5：出网必须带 CSRF 头（03 §7）——旧实现绕过 httpFetch 却没补这个头
  test('请求带 X-Requested-With（CSRF 防线）', async () => {
    fetchMock.mockResolvedValueOnce(new Response('id\n1', { status: 200 }))
    await exportCsv('/products', new URLSearchParams(), 'products')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['X-Requested-With']).toBe('fetch')
  })
})
