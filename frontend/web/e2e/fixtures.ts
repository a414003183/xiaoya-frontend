import { expect, type Page } from '@playwright/test'

/**
 * E2E 共享夹具（phase-6 T-7）：登录态 + 经 API 造数/断言的统一入口。
 * 被测链路一律走 5173 的 UI；数据种子与服务端断言走测试进程直连 8080（显式 cookie）。
 * 端口可覆写（T73/OPS-16，缺省不变）：E2E_API_BASE / E2E_WEB_BASE——与 playwright.config.ts 的
 * E2E_API_PORT / E2E_WEB_PORT 一次性端口配套用。
 */
export const BASE_API = process.env.E2E_API_BASE ?? 'http://localhost:8080/api/v1'
const BASE_WEB = process.env.E2E_WEB_BASE ?? 'http://localhost:5173'

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

/** multipart 上传（api() 只发 JSON）；objectType/objectId 可省 = 未绑定（T73 运营面/安全回归用）。 */
export async function uploadFile(
  cookie: string,
  filename: string,
  bytes: Uint8Array<ArrayBuffer>,
  objectType?: string,
  objectId?: number,
): Promise<Response> {
  const form = new FormData()
  form.append('file', new Blob([bytes]), filename)
  if (objectType !== undefined) form.append('objectType', objectType)
  if (objectId !== undefined) form.append('objectId', String(objectId))
  return fetch(`${BASE_API}/files`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'fetch', Cookie: cookie },
    body: form,
  })
}

/** 取错误信封的 code（ErrorEnvelope.error.code；非错误响应返回 null）。消费了 body 就别再读 text。 */
export async function errorCode(response: Response): Promise<number | null> {
  const body = (await response.json()) as { error?: { code?: number } }
  return body.error?.code ?? null
}

export async function login(page: Page, account: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('账号').fill(account)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  // 严格度不变（整 URL 精确匹配），只是宿主随 E2E_WEB_BASE 走（缺省 http://localhost:5173）
  await expect(page).toHaveURL(`${BASE_WEB}/my`)
}

/** 各 spec 数据唯一前缀（互不影响）。 */
export const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`
