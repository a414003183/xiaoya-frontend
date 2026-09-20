import { expect, type Page, test } from '@playwright/test'

/**
 * P4 Bug 转需求链路（phase-4 卡 T-11 手工走查 2 的自动化等价物）：
 * resolve resolution=tostory → 需求生成、Bug.storyId 回填、需求详情可见。
 * 真后端（H2+Flyway+种子 admin）+ 真前端（VITE_API_MOCK=0）。
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

async function apiData<T>(cookie: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  expect(response.status, `${method} ${path} → ${response.status}: ${text}`).toBe(200)
  return (JSON.parse(text) as { data: T }).data
}

async function login(page: Page, account: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('账号').fill(account)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/localhost:5173\/my$/)
}

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test('Bug 解决为「转为需求」：需求生成 + Bug.storyId 回填且双向可见', async ({ page }) => {
  const admin = await apiLogin('admin', 'admin123')
  const product = await apiData<{ id: number }>(admin, 'POST', '/products', {
    name: `E2E转需产品-${suffix()}`,
    type: 'branch',
  })
  const bugTitle = `E2E转需求缺陷-${suffix()}`
  const bug = await apiData<{ id: number }>(admin, 'POST', `/products/${product.id}/bugs`, {
    title: bugTitle,
    openedBuilds: '1',
    priority: 2,
  })

  await login(page, 'admin', 'admin123')
  await page.goto(`/bugs/${bug.id}`)
  await expect(page.getByText(bugTitle)).toBeVisible()

  await page.getByRole('button', { name: /^解\s*决$/ }).click()
  await page.getByLabel('转为需求').check()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()

  // 先等落库再断言，避免与请求竞态（弹窗内也有「已解决」单选文案，故用 API 轮询作准）
  await expect
    .poll(async () => (await apiData<{ status: string }>(admin, 'GET', `/bugs/${bug.id}`)).status, {
      message: 'resolve(tostory) 后 Bug 状态应为 resolved',
    })
    .toBe('resolved')

  // Bug.storyId 回填
  const detail = await apiData<{ storyId: number | null; resolution: string; status: string }>(
    admin,
    'GET',
    `/bugs/${bug.id}`,
  )
  expect(detail.status).toBe('resolved')
  expect(detail.resolution).toBe('tostory')
  expect(detail.storyId, 'Bug.storyId 应由 tostory 执行回填').not.toBeNull()

  // 需求已生成：source=bug、status=active、title 同 Bug
  const story = await apiData<{ title: string; source: string; status: string; productId: number }>(
    admin,
    'GET',
    `/stories/${detail.storyId}`,
  )
  expect(story.title).toBe(bugTitle)
  expect(story.source).toBe('bug')
  expect(story.status).toBe('active')
  expect(story.productId).toBe(product.id)

  // 需求在产品的需求列表可见（UI）
  await page.goto(`/products/${product.id}/stories`)
  await expect(page.getByText(bugTitle)).toBeVisible()

  // Bug 动态流可见 resolved（extra=tostory）
  const activities = await apiData<{ items: { action: string }[] }>(admin, 'GET', `/bugs/${bug.id}/activities`)
  expect(activities.items.map((item) => item.action)).toContain('resolved')
})
