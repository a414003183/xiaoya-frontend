import { expect, type Page } from '@playwright/test'

/**
 * E2E 共享夹具（phase-6 T-7）：登录态 + 经 API 造数/断言的统一入口。
 * 被测链路一律走 5173 的 UI；数据种子与服务端断言走测试进程直连 8080（显式 cookie）。
 */
export const BASE_API = 'http://localhost:8080/api/v1'

export async function apiLogin(account: string, password: string): Promise<string> {
  const response = await fetch(`${BASE_API}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: JSON.stringify({ account, password }),
  })
  expect(response.status).toBe(200)
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

export async function api(cookie: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${BASE_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

export async function apiData<T>(cookie: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await api(cookie, method, path, body)
  expect(response.status, `${method} ${path} → ${response.status}`).toBe(200)
  return ((await response.json()) as { data: T }).data
}

export async function login(page: Page, account: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('账号').fill(account)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/localhost:5173\/my$/)
}

/** 各 spec 数据唯一前缀（互不影响）。 */
export const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`
