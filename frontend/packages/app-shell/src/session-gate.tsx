import { useQuery } from '@tanstack/react-query'
import { ApiError, ok } from '@zentao/api-client'
import { getMe } from '@zentao/api-client/generated'
import { PageLoading, useMessage } from '@zentao/design-system'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation } from 'react-router'
import { PrivilegesProvider } from './privileges'

/** 首登强制改密落点（workspace 卡 §6：/my/profile 带本人改密弹窗）。 */
const FORCE_PASSWORD_PATH = '/my/profile'

/**
 * 会话门：未登录 → 登录页（带 redirect 回跳）；已登录 → PrivilegesProvider 注入权限上下文。
 * /me 查询与 Provider 共用 queryKey，一次取数；缓存形状 = 拆封后的 MeView（与各页面 fetchMe 一致，
 * 信封与 MeView 混存会令页面读 me.data.privileges 崩溃——A3-3 走查实证）。
 *
 * 06 A7-5 首登强制改密：/me 的 account.mustChangePassword 为真时，业务路由一律重定向到改密落点并提示
 * （拦截放前端门禁而非 SessionResolver：后端全局拦会把改密端点自身拦死，前端一层即可覆盖全部页面）。
 * 改密成功后由改密弹窗失效 getMe 缓存，本门即自动放行。
 */
export function SessionGate() {
  const location = useLocation()
  const { t } = useTranslation()
  const message = useMessage()
  const notified = useRef(false)
  const me = useQuery({ queryKey: ['getMe'], queryFn: async () => ok(await getMe()).data })

  const mustChangePassword = me.data?.account.mustChangePassword === true
  useEffect(() => {
    if (mustChangePassword && !notified.current) {
      notified.current = true
      message.warning(t('auth.login.message.mustChangePassword'))
    }
  }, [mustChangePassword, message, t])

  if (me.isPending) {
    return <PageLoading />
  }
  if (me.error instanceof ApiError && me.error.code === 40101) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }
  if (me.error) {
    return <PageLoading tip={me.error.message} />
  }
  if (mustChangePassword && location.pathname !== FORCE_PASSWORD_PATH) {
    return <Navigate to={FORCE_PASSWORD_PATH} replace />
  }
  return <PrivilegesProvider>{<Outlet />}</PrivilegesProvider>
}
