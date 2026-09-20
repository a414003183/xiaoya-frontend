import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ok } from '@zentao/api-client'
import { getColumnPref, resetColumnPref, saveColumnPref } from '@zentao/api-client/generated'
import type { ColumnPrefItem } from '@zentao/api-client/generated/model/columnPrefItem'
import type { ColumnPrefStore } from '@zentao/design-system'
import { useCallback } from 'react'

/**
 * 列设置 store（design-system `ColumnPrefStore` 的服务端实现；04 §列设置改造）。
 *
 * 个人级偏好：读 GET /column-prefs/{resource}（未设置回 `columns: null` → 页面默认列），
 * 写 PUT/DELETE 后失效同键缓存。**浏览器不留副本**（旧 `zt-columns:` 本地实现已删除）——
 * 同账号换设备/换浏览器看到的是同一份设置。
 */
const columnPrefKey = (resource: string) => ['getColumnPref', resource] as const

export function useColumnPrefStore(): ColumnPrefStore {
  const queryClient = useQueryClient()

  /** 每个列表页都会调用（resource 为空串 = 该页无列设置身份，不发请求）。 */
  const usePref = (resource: string) => {
    const query = useQuery({
      queryKey: columnPrefKey(resource),
      queryFn: async () => ok(await getColumnPref(resource)).data.columns,
      enabled: resource !== '',
    })
    return { pref: query.data, loading: query.isLoading }
  }

  const save = useCallback(
    async (resource: string, pref: ColumnPrefItem[]) => {
      const saved = ok(await saveColumnPref(resource, { columns: pref })).data
      void queryClient.invalidateQueries({ queryKey: columnPrefKey(resource) })
      return saved
    },
    [queryClient],
  )

  const reset = useCallback(
    async (resource: string) => {
      await resetColumnPref(resource)
      void queryClient.invalidateQueries({ queryKey: columnPrefKey(resource) })
    },
    [queryClient],
  )

  return { usePref, save, reset }
}
