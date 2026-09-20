import { expect, type Page, test } from '@playwright/test'

/**
 * P1 org-admin 关键链路（phase-1 T-14）：建组 → 勾权限码 → 加成员 → 该成员登录后菜单/按钮显隐随之变化。
 * API 从测试进程直连 8080（显式 cookie）；页面交互走 5173（真实后端，VITE_API_MOCK=0）。
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

async function api(
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: { data: unknown } }> {
  const response = await fetch(`${BASE_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = (await response.json()) as { data: unknown }
  return { status: response.status, json }
}

async function login(page: Page, account: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('账号').fill(account)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/localhost:5173\/my$/)
}

test('建组→勾码→加成员→成员登录后显隐变化', async ({ page }) => {
  const stamp = Date.now()

  // 1. API：建账号（组长）+ 建组
  const adminCookie = await apiLogin('admin', 'admin123')
  const chief = await api(adminCookie, 'POST', '/accounts', {
    account: `e2echief${stamp}`,
    password: 'e2e123456',
    realName: 'E2E组长',
  })
  expect(chief.status).toBe(200)
  const created = await api(adminCookie, 'POST', '/groups', {
    name: `e2e研发组${stamp}`,
    description: 'E2E 建组链路',
  })
  expect(created.status).toBe(200)
  const groupId = (created.json.data as { id: number }).id

  // 2. UI：勾权限码（矩阵页勾 account-view + 保存）
  await login(page, 'admin', 'admin123')
  await page.goto(`/org/groups/${groupId}/privileges`)
  await page.getByLabel('account-view').check()
  await page.getByRole('button', { name: /保\s*存\s*矩\s*阵/ }).click()
  await expect
    .poll(async () => (await api(adminCookie, 'GET', `/groups/${groupId}/privileges`)).json.data)
    .toEqual({ codes: ['account-view'] })

  // 3. API：建成员 + 加入组
  const member = await api(adminCookie, 'POST', '/accounts', {
    account: `e2emember${stamp}`,
    password: 'e2e123456',
    realName: 'E2E成员',
  })
  expect(member.status).toBe(200)
  const memberId = (member.json.data as { id: number }).id
  const saved = await api(adminCookie, 'PUT', `/groups/${groupId}/members`, { accountIds: [memberId] })
  expect(saved.status).toBe(200)

  // 4. 成员登录：有码菜单可见（账号列表），无码菜单不可见（系统设置）
  await page.getByLabel('账号菜单').click()
  await page.getByText('退出登录').click()
  await expect(page).toHaveURL(/\/login/)
  await login(page, `e2emember${stamp}`, 'e2e123456')
  await page.locator('.ant-menu-item', { hasText: '组织' }).first().click()
  await expect(page.getByRole('menuitem', { name: '账号列表' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '系统设置' })).toBeHidden()

  // 5. 直访有码页面可进，能看到自己
  await page.goto('/org/accounts')
  await expect(page.getByText('E2E成员').first()).toBeVisible()
})
