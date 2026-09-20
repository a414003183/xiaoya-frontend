import { expect, type Page, test } from '@playwright/test'

/**
 * P5 工作台链路（phase-5 卡 T-13 手工走查 3/4 的自动化等价物）：
 * 真后端（H2+Flyway+种子 admin）+ 真前端（VITE_API_MOCK=0）。
 * 覆盖：待办 创建→开始→完成→激活→关闭 全动作链 + 指派他人；
 * /my 计数卡 → /my/* 列表 role 页签；周报重复刷新 EVM 数字不变（幂等）；燃尽双线渲染。
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

/** 建一条待办（UI 全流程：抽屉 → 列表可见）并进入详情，返回 todoId。 */
async function createTodoViaUi(page: Page, title: string): Promise<number> {
  await page.goto('/my/todos')
  await page.getByRole('button', { name: '新建待办' }).click()
  // 列表页同时挂载新建/编辑两个抽屉，字段 aria-label 相同 → 只在可见抽屉内取字段
  const drawer = page.getByRole('dialog', { name: '新建待办' })
  await drawer.getByLabel('todo-title').fill(title)
  await drawer.getByRole('button', { name: /提\s*交/ }).click()
  await expect(page.getByText(title).first()).toBeVisible()

  await page.getByText(title).first().click()
  await expect(page).toHaveURL(/\/todos\/\d+/)
  return Number(page.url().match(/\/todos\/(\d+)/)?.[1])
}

test.describe('@p5 工作台链路', () => {
  test('待办全动作链：创建→开始→完成→激活→关闭（动作区随 meta allowedStatus 收敛）', async ({ page }) => {
    const cookie = await apiLogin('admin', 'admin123')
    const title = `E2E待办链-${suffix()}`
    await login(page, 'admin', 'admin123')
    const todoId = await createTodoViaUi(page, title)
    await expect(page.getByText('未开始').first()).toBeVisible()

    await page.getByRole('button', { name: /开\s*始/ }).click()
    await expect(page.getByText('进行中').first()).toBeVisible()

    await page.getByRole('button', { name: /完\s*成/ }).click()
    await expect(page.getByText('已完成').first()).toBeVisible()

    await page.getByRole('button', { name: /激\s*活/ }).click()
    await expect(page.getByText('未开始').first()).toBeVisible()

    await page.getByRole('button', { name: /关\s*闭/ }).click()
    await expect(page.getByText('已关闭').first()).toBeVisible()

    const detail = await apiData<{ status: string; closedBy: string | null }>(cookie, 'GET', `/todos/${todoId}`)
    expect(detail.status).toBe('closed')
    expect(detail.closedBy).toBe('admin')
  })

  test('指派他人：详情页指派弹窗成功后归属接收人（对方 /my/todos 可见）', async ({ page }) => {
    const cookie = await apiLogin('admin', 'admin123')
    const other = `e2euser${Math.floor(Math.random() * 100000)}`
    // 接收人需 todo-view 才能从 /my/todos 派生（无功能码 → 40301 是预期语义）
    const group = await apiData<{ id: number }>(cookie, 'POST', '/groups', { name: `E2E组-${other}` })
    await apiData(cookie, 'PUT', `/groups/${group.id}/privileges`, { codes: ['todo-view'] })
    await apiData(cookie, 'POST', '/accounts', {
      account: other,
      password: 'secret123',
      realName: other,
      groupIds: [group.id],
    })

    const title = `E2E待办指派-${suffix()}`
    await login(page, 'admin', 'admin123')
    const todoId = await createTodoViaUi(page, title)

    await page.getByRole('button', { name: /指\s*派/ }).click()
    const modal = page.getByRole('dialog', { name: /指\s*派/ })
    // showSearch 的 Select：聚焦后键入过滤，回车选中（避免依赖下拉 DOM 类名）
    await modal.getByLabel('todo-assign-assignee').click()
    await page.keyboard.type(other)
    await page.keyboard.press('Enter')
    const submit = modal.getByRole('button', { name: /提\s*交/ })
    if (await submit.isVisible().catch(() => false)) {
      await submit.click({ force: true })
    }
    await expect(page.getByText(other).first()).toBeVisible({ timeout: 15_000 })

    const otherCookie = await apiLogin(other, 'secret123')
    const mine = await apiData<{ items: { id: number; title: string }[] }>(otherCookie, 'GET', '/todos')
    expect(
      mine.items.some((item) => item.id === todoId && item.title === title),
      '指派后归属接收人',
    ).toBe(true)
  })

  test('/my 计数卡进入 /my/tasks，role 页签切换与后端 role 口径一致', async ({ page }) => {
    const cookie = await apiLogin('admin', 'admin123')
    const product = await apiData<{ id: number }>(cookie, 'POST', '/products', {
      name: `E2E地盘产品-${suffix()}`,
      acl: 'public',
    })
    const project = await apiData<{ id: number }>(cookie, 'POST', '/projects', {
      name: `E2E地盘项目-${suffix()}`,
      beginDate: '2026-09-01',
      endDate: '2026-12-31',
      productIds: [product.id],
    })
    const execution = await apiData<{ id: number }>(cookie, 'POST', `/projects/${project.id}/executions`, {
      type: 'sprint',
      name: `E2E地盘执行-${suffix()}`,
      beginDate: '2026-09-01',
      endDate: '2026-09-30',
    })
    const taskTitle = `E2E地盘任务-${suffix()}`
    await apiData(cookie, 'POST', `/executions/${execution.id}/tasks`, { title: taskTitle })

    await login(page, 'admin', 'admin123')
    await page.goto('/my')
    await expect(page.getByText('我的任务').first()).toBeVisible()

    await page.getByText('我的任务').first().click()
    await expect(page).toHaveURL(/\/my\/tasks/)

    const creatorTotal = await apiData<{ total: number }>(cookie, 'GET', '/my/tasks?role=creator&limit=1')
    expect(creatorTotal.total).toBeGreaterThan(0)

    await page.getByText('由我创建', { exact: true }).click()
    await expect(page).toHaveURL(/role=creator/)
    await expect(page.getByText(taskTitle).first()).toBeVisible()
  })

  test('周报幂等与燃尽双线：同周重复请求 EVM 数字不变，燃尽页 ideal/remaining 双线渲染', async ({ page }) => {
    const cookie = await apiLogin('admin', 'admin123')
    const product = await apiData<{ id: number }>(cookie, 'POST', '/products', {
      name: `E2E周报产品-${suffix()}`,
      acl: 'public',
    })
    const project = await apiData<{ id: number }>(cookie, 'POST', '/projects', {
      name: `E2E周报项目-${suffix()}`,
      beginDate: '2026-09-01',
      endDate: '2026-12-31',
      productIds: [product.id],
    })
    const execution = await apiData<{ id: number }>(cookie, 'POST', `/projects/${project.id}/executions`, {
      type: 'sprint',
      name: `E2E周报执行-${suffix()}`,
      beginDate: '2026-09-01',
      endDate: '2026-09-30',
    })
    const task = await apiData<{ id: number }>(cookie, 'POST', `/executions/${execution.id}/tasks`, {
      title: `E2E周报任务-${suffix()}`,
      estimateHours: 8,
    })
    await apiData(cookie, 'POST', `/tasks/${task.id}/start`, { leftHours: 6 })

    const first = await apiData<{ pv: number; ev: number; weekStart: string }>(
      cookie,
      'GET',
      `/projects/${project.id}/weekly-reports/current?date=2026-09-16`,
    )
    const second = await apiData<{ pv: number; ev: number; weekStart: string }>(
      cookie,
      'GET',
      `/projects/${project.id}/weekly-reports/current?date=2026-09-18`,
    )
    expect(second.weekStart).toBe(first.weekStart)
    expect(second.pv).toBe(first.pv)
    expect(second.ev).toBe(first.ev)

    await login(page, 'admin', 'admin123')
    await page.goto(`/projects/${project.id}/weekly-report`)
    await expect(page.getByText('PV').first()).toBeVisible()

    const burn = await apiData<{ dates: string[]; ideal: number[]; remaining: number[] }>(
      cookie,
      'GET',
      `/executions/${execution.id}/reports/burn`,
    )
    expect(burn.ideal.length).toBe(burn.dates.length)
    expect(burn.remaining.length).toBe(burn.dates.length)

    await page.goto(`/executions/${execution.id}/reports/burn`)
    await expect(page.getByRole('img', { name: '燃尽图' })).toBeVisible()
  })
})
