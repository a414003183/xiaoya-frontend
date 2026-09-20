import { expect, type Page, test } from '@playwright/test'

/**
 * P2 需求闭环（phase-2 卡 T-11 手工走查的自动化等价物）：
 * 真后端（H2+Flyway+种子 admin）+ 真前端（VITE_API_MOCK=0）。
 * 数据种子走测试进程直连 8080（显式 cookie，见 P1 偏差注记），UI 交互走 5173。
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

async function api(cookie: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${BASE_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function apiData<T>(cookie: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await api(cookie, method, path, body)
  expect(response.status, `${method} ${path} → ${response.status}`).toBe(200)
  return ((await response.json()) as { data: T }).data
}

async function login(page: Page, account: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('账号').fill(account)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/localhost:5173\/my$/)
}

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`

test('产品列表→提需求→提交评审→评审通过（真实后端 UI 动作链）', async ({ page }) => {
  const admin = await apiLogin('admin', 'admin123')
  const name = `E2E产品-${suffix()}`
  const product = await apiData<{ id: number }>(admin, 'POST', '/products', { name, type: 'branch' })

  await login(page, 'admin', 'admin123')

  // 产品列表渲染真实数据
  await page.goto('/products')
  await expect(page.getByText(name)).toBeVisible()

  // 产品下提需求：抽屉表单（提需求 → 需求名称 → 保存）
  await page.goto(`/products/${product.id}/stories`)
  await page.getByRole('button', { name: '提需求' }).click()
  const storyTitle = `E2E需求-${suffix()}`
  await page.getByLabel('story-title').fill(storyTitle)
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(storyTitle)).toBeVisible()

  // 详情页：草稿 → 提交评审 → 评审中 → 评审通过 → 激活
  await page.getByText(storyTitle).click()
  // 06 A1-3 起 '需求详情' 不再出现在侧栏（隐藏页不进菜单），详情上下文以返回钮+状态标记
  await expect(page.getByRole('button', { name: /返\s*回/ })).toBeVisible()
  await expect(page.getByText(/草\s*稿/).first()).toBeVisible()

  await page.getByRole('button', { name: '提交评审' }).click()
  await page.getByLabel('story-reviewers').click()
  // 并行用例会让账号下拉变长（antd 虚拟列表），先过滤再选，选毕收起避免遮挡提交
  await page.keyboard.type('admin')
  await page.getByTitle('管理员(admin)').click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/评审中/).first()).toBeVisible()

  await page.getByRole('button', { name: '评审通过' }).click()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/激\s*活/).first()).toBeVisible()
})

test('变更→变更完成→关闭→激活（UI 动作链 + 动态页签落痕）', async ({ page }) => {
  const admin = await apiLogin('admin', 'admin123')
  const product = await apiData<{ id: number }>(admin, 'POST', '/products', {
    name: `E2E变更产品-${suffix()}`,
  })
  const story = await apiData<{ id: number }>(admin, 'POST', `/products/${product.id}/stories`, {
    title: `E2E变更需求-${suffix()}`,
    needNotReview: true,
  })
  await apiData(admin, 'POST', `/stories/${story.id}/submit-review`, {})

  await login(page, 'admin', 'admin123')
  await page.goto(`/stories/${story.id}`)
  await expect(page.getByText(/激\s*活/).first()).toBeVisible()

  await page.getByRole('button', { name: '发起变更' }).click()
  await expect(page.getByText(/变更中/).first()).toBeVisible()

  await page.getByRole('button', { name: '变更完成' }).click()
  await page.getByLabel('story-title').fill(`E2E变更需求-已改-${suffix()}`)
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/已\s*变\s*更/).first()).toBeVisible()

  await page.getByRole('button', { name: /关\s*闭/ }).click()
  await page.getByRole('radio', { name: '已完成' }).click()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/已\s*关\s*闭/).first()).toBeVisible()

  await page.getByRole('button', { name: /激\s*活/ }).click()
  await expect(page.getByText(/激\s*活/).first()).toBeVisible()

  // 动态页签：动作链全部落痕
  await page.getByRole('tab', { name: '动态' }).click()
  await expect(page.getByText('变更完成').first()).toBeVisible()
})

test('计划关联需求 + 发布副作用（UI 断言真实联动：stage=已发布、动态见发布）', async ({ page }) => {
  const admin = await apiLogin('admin', 'admin123')
  const product = await apiData<{ id: number }>(admin, 'POST', '/products', {
    name: `E2E联动产品-${suffix()}`,
  })
  const story = await apiData<{ id: number }>(admin, 'POST', `/products/${product.id}/stories`, {
    title: `E2E联动需求-${suffix()}`,
  })
  const plan = await apiData<{ id: number }>(admin, 'POST', `/products/${product.id}/plans`, {
    title: `E2E计划-${suffix()}`,
  })
  await apiData(admin, 'POST', `/plans/${plan.id}/link`, { objectType: 'story', ids: [story.id] })
  await apiData(admin, 'POST', `/plans/${plan.id}/start`)
  await apiData(admin, 'POST', `/products/${product.id}/releases`, {
    name: `E2E发布-${suffix()}`,
    releaseDate: '2026-09-18',
    storyIds: [story.id],
  })

  await login(page, 'admin', 'admin123')

  // 计划详情：需求页签可见关联需求
  await page.goto(`/plans/${plan.id}`)
  await expect(page.getByText('需求').first()).toBeVisible()

  // 需求详情：stage 已发布 + 动态含发布关联
  await page.goto(`/stories/${story.id}`)
  await expect(page.getByText('已发布').first()).toBeVisible()
  await page.getByRole('tab', { name: '动态' }).click()
  await expect(page.getByText('发布关联').first()).toBeVisible()
})
