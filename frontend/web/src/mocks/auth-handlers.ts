import { HttpResponse, http } from 'msw'
import { currentAccount, db, error, MISSING_CSRF, privilegesOf, toAccountView, UNAUTHENTICATED } from './db'

/**
 * 会话域 MSW handlers —— 与 contract/openapi.yaml 一一对应（01 §3.2）。
 * 会话态在共享内存库（db.ts），Set-Cookie 头同步给浏览器 worker 以贴近真实。
 */
export const authHandlers = [
  http.post('*/api/v1/session', async ({ request }) => {
    if (request.headers.get('X-Requested-With') !== 'fetch') {
      return HttpResponse.json(MISSING_CSRF, { status: 403 })
    }
    const body = (await request.json()) as { account?: string; password?: string }
    const account = db.accounts.find((item) => item.account === body.account && item.deletedAt === null)
    if (account?.status !== 'active' || account.password !== body.password) {
      return HttpResponse.json(error(40101, '账号或密码错误。'), { status: 401 })
    }
    db.sessionActive = true
    db.currentAccountId = account.id
    return HttpResponse.json(
      { data: toAccountView(account) },
      { headers: { 'Set-Cookie': 'ZT_SESSION=mock-token; Path=/; HttpOnly; SameSite=Lax' } },
    )
  }),

  http.get('*/api/v1/me', () => {
    const account = currentAccount()
    if (!account) {
      return HttpResponse.json(UNAUTHENTICATED, { status: 401 })
    }
    return HttpResponse.json({
      data: { account: toAccountView(account), privileges: privilegesOf(account), dictionaries: {} },
    })
  }),

  http.delete('*/api/v1/session', ({ request }) => {
    if (request.headers.get('X-Requested-With') !== 'fetch') {
      return HttpResponse.json(MISSING_CSRF, { status: 403 })
    }
    db.sessionActive = false
    db.currentAccountId = null
    return HttpResponse.json({ data: null })
  }),
]

/** 兼容旧导出名（P0 测试在用）。 */
export function resetMockSession(): void {
  db.sessionActive = false
  db.currentAccountId = null
}
