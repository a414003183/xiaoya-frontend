import { useQuery } from '@tanstack/react-query'
import { ok } from '@zentao/api-client'
import { getMe } from '@zentao/api-client/generated'
import { PageLoading, PermScope } from '@zentao/design-system'
import type { ReactNode } from 'react'

/**
 * getMe privileges Provider（01 §3.4）：/me 数据唯一取数点（queryKey 复用，SessionGate 共享缓存），
 * 注入 PermScope；域内组件经 usePrivileges / HasPerm 读权限码，前端显隐只认它（03 §7）。
 */
export function PrivilegesProvider({ children }: { children: ReactNode }) {
  const me = useQuery({ queryKey: ['getMe'], queryFn: async () => ok(await getMe()).data })
  if (me.error) {
    // 取数失败不能返回 loading（FE-09：原先 isPending || error 都走 PageLoading = 无限转圈）。
    // 抛给上层错误面（壳层 ErrorBoundary / 路由 errorElement，均可刷新重试）；401 由 SessionGate 先处理。
    throw me.error
  }
  if (me.isPending) {
    return <PageLoading />
  }
  return <PermScope privileges={me.data.privileges}>{children}</PermScope>
}
