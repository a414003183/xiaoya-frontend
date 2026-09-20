import { expect, type Page, test } from '@playwright/test'

/**
 * 权限显隐链路（P1 T-2，platform §7.1 / 01 §3.4）：
 * admin（超管组）可见 org 菜单；无码账号菜单不可见、直访路由 → 403 页。
 * API 调用从测试进程直连 8080（显式携带会话 cookie），页面交互走 5173。
 */
const BASE_API = 'http://localhost:8080/api/v1'

async function apiLogin(account: string, password: string): Promise<string> {
  const response = await fetch(`${BASE_API}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: JSON.stringify({ account, password }),
  })
  expect(response.status).toBe(200)
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

async function apiPost(cookie: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
    body: JSON.stringify(body),
  })
}

async function login(page: Page, account: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('账号').fill(account)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/localhost:5173\/my$/)
}

/** 切到侧栏一级栏的某个组（用户裁决 2026-09-20 二次修订：一级不下拉，点击只把右侧二级栏切到该组）。 */
async function openMenuGroup(page: Page, label: string): Promise<void> {
  await page.locator('.ant-menu-item', { hasText: label }).first().click()
}

/** 头像下拉退出（UI 三项修订 2026-09-20：退出入口随头像收进**侧栏底部**工具条）。 */
async function logoutViaHeader(page: Page): Promise<void> {
  await page.getByLabel('账号菜单').click()
  await page.getByText('退出登录').click()
}

test('超管可见组织管理菜单并能进入账号列表', async ({ page }) => {
  await login(page, 'admin', 'admin123')
  await openMenuGroup(page, '组织')
  await expect(page.getByRole('menuitem', { name: '账号列表' })).toBeVisible()
  await page.getByRole('menuitem', { name: '账号列表' }).click()
  await expect(page).toHaveURL(/\/org\/accounts/)
})

test('无码账号无 org 菜单，直访路由 → 403 页', async ({ page }) => {
  const adminCookie = await apiLogin('admin', 'admin123')
  const account = `e2e-guest-${Date.now()}`
  const created = await apiPost(adminCookie, '/accounts', {
    account,
    password: 'e2e123456',
    realName: 'E2E访客',
  })
  expect(created.status).toBe(200)

  await login(page, 'admin', 'admin123')
  await openMenuGroup(page, '组织')
  await expect(page.getByRole('menuitem', { name: '账号列表' })).toBeVisible()
  await logoutViaHeader(page)
  await expect(page).toHaveURL(/\/login/)

  await login(page, account, 'e2e123456')
  // 无 account-view：组织组整体被权限过滤（组内无可见项即整组消失）
  await expect(page.locator('.ant-menu-submenu-title', { hasText: '组织' })).toBeHidden()
  await expect(page.getByRole('menuitem', { name: '账号列表' })).toBeHidden()

  await page.goto('/org/accounts')
  await expect(page.getByText('403')).toBeVisible()
})
