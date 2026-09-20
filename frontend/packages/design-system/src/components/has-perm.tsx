import { createContext, type ReactNode, useContext, useMemo } from 'react'

const PermContext = createContext<readonly string[]>([])

export type PermScopeProps = {
  privileges: readonly string[]
  children: ReactNode
}

/** 由 /me 的 privileges 驱动；前端显隐只认它，真鉴权永远在后端（03 §7）。 */
export function PermScope({ privileges, children }: PermScopeProps) {
  const set = useMemo(() => privileges, [privileges])
  return <PermContext.Provider value={set}>{children}</PermContext.Provider>
}

export function usePrivileges(): readonly string[] {
  return useContext(PermContext)
}

export function hasPerm(privileges: readonly string[], code: string): boolean {
  return privileges.includes(code)
}

export type HasPermProps = {
  perm: string
  children: ReactNode
  /** 无权限时的替代渲染；缺省渲染 null。 */
  fallback?: ReactNode
}

export function HasPerm({ perm, children, fallback = null }: HasPermProps) {
  const privileges = usePrivileges()
  return <>{hasPerm(privileges, perm) ? children : fallback}</>
}
