/**
 * 列表 DSL 参数拼装（03 §3）：page/limit/sort/q/filters[x] 的唯一构造口，列表页与 api 层共用。
 * filters 值数组按逗号 IN 折叠；空串与 undefined 直接丢弃（避免下发无效过滤）。
 *
 * A6-1：泛型 P = 该端点 orval 生成的 *Params（契约真源）。DSL 的 filters 键集合取自 P 中声明的
 * `filters[*]` 键、返回值即 P——列表请求参数在编译期被契约约束，调用点不再需要类型逃逸。
 * 例：buildListParams<ListExecutionTasksParams>({ filters: { status: 'doing' } })
 */
/** 列表分页默认值（03 §3：契约 default=20、上限 200；CSV 导出恒 limit=5000 不走此默认）。 */
export const DEFAULT_PAGE_SIZE = 20
/** 服务端 limit 上限（Filters.MAX_LIMIT；超过由后端夹到上限）。 */
export const MAX_PAGE_SIZE = 200

type FilterNameOf<K> = K extends `filters[${infer Name}]` ? Name : never

/** P（orval *Params）声明的 filters 键名集合，如 'status' | 'type'；无 filters 声明的端点得到 never。 */
export type ListFilterNames<P> = FilterNameOf<keyof P>

/** 过滤值：string/number 等值、数组 IN；构造口统一折叠为契约声明的 string 串。 */
export type ListFilterValue = string | number | readonly string[] | null | undefined

/** 未指定端点 P 时的开放形状（CSV 导出等只拼串、不过请求类型检查的场景）。 */
type OpenListParams = {
  readonly [key: `filters[${string}]`]: string | undefined
  page?: number
  limit?: number
  sort?: string
  q?: string
}

export type ListDsl<P extends object = OpenListParams> = {
  page?: number
  limit?: number
  sort?: string
  q?: string
  filters?: { [K in ListFilterNames<P>]?: ListFilterValue }
}

export function buildListParams<P extends object = OpenListParams>(dsl: ListDsl<P> = {}): P {
  const params: Record<string, string | number> = {}
  if (dsl.page !== undefined) {
    params.page = dsl.page
  }
  if (dsl.limit !== undefined) {
    params.limit = dsl.limit
  }
  if (dsl.sort !== undefined && dsl.sort.length > 0) {
    params.sort = dsl.sort
  }
  if (dsl.q !== undefined && dsl.q.length > 0) {
    params.q = dsl.q
  }
  for (const [key, value] of Object.entries(dsl.filters ?? {}) as [string, ListFilterValue][]) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    params[`filters[${key}]`] = typeof value === 'string' || typeof value === 'number' ? String(value) : value.join(',')
  }
  // 唯一类型出口：filters[key] 是分片拼键，静态无法逐键证明；DSL 侧键名已由 ListDsl<P> 约束。
  return params as unknown as P
}
