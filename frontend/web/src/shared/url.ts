/** URL 状态工具（01 §3.3）：页码/页签/过滤只存 URL，增删单键返回新实例。 */

export function withParam(params: URLSearchParams, key: string, value: string | number | undefined): URLSearchParams {
  const next = new URLSearchParams(params)
  if (value === undefined || value === '') {
    next.delete(key)
  } else {
    next.set(key, String(value))
  }
  return next
}

export function withParams(
  params: URLSearchParams,
  values: Record<string, string | number | undefined>,
): URLSearchParams {
  let next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(values)) {
    next = withParam(next, key, value)
  }
  return next
}

export function paramNumber(params: URLSearchParams, key: string, fallback: number): number {
  const value = Number(params.get(key))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function paramString(params: URLSearchParams, key: string, fallback = ''): string {
  return params.get(key) ?? fallback
}

/** 逗号分隔的 id 列表（批量页从列表多选进入：?ids=1,2,3）。 */
export function paramIds(params: URLSearchParams, key = 'ids'): number[] {
  const raw = params.get(key)
  if (!raw) {
    return []
  }
  return raw
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
}
