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
  if (me.isPending || me.error) {
    return <PageLoading />
  }
  return <PermScope privileges={me.data.privileges}>{children}</PermScope>
}
